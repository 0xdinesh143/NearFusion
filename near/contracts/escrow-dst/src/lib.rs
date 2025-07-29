use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near_bindgen, AccountId, Promise, NearToken,
    PanicOnDefault, log, Gas,
};
use near_contract_standards::fungible_token::core::ext_ft_core;

use shared::{EscrowImmutables, CryptoUtils, EscrowError, Balance};
use schemars::JsonSchema;

/// Gas for NEP141 token transfers
const GAS_FOR_FT_TRANSFER: Gas = Gas::from_gas(20_000_000_000_000);

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, JsonSchema)]
#[serde(crate = "near_sdk::serde")]
pub enum EscrowState {
    Active,
    Withdrawn,
    Cancelled,
    Rescued,
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct EscrowDst {
    /// Immutable escrow parameters
    pub immutables: EscrowImmutables,
    /// Current state of the escrow
    pub state: EscrowState,
    /// Factory contract that created this escrow
    pub factory: AccountId,
    /// Secret used for withdrawal (stored for verification)
    pub secret_used: Option<String>,
}

#[near_bindgen]
impl EscrowDst {
    #[init]
    pub fn new(immutables: EscrowImmutables) -> Self {
        Self {
            immutables,
            state: EscrowState::Active,
            factory: env::predecessor_account_id(),
            secret_used: None,
        }
    }

    /// Withdraw funds with secret (this is called by taker who learned secret from EVM)
    /// For NEAR→EVM swaps, the taker uses the secret revealed on EVM to claim NEAR tokens
    pub fn withdraw(&mut self, secret: String) -> Promise {
        // Validate state
        assert!(
            matches!(self.state, EscrowState::Active),
            "Escrow is not active"
        );

        // Validate timelock
        assert!(
            self.immutables.timelocks.can_withdraw(),
            "Withdrawal period has expired"
        );

        // Validate secret
        assert!(
            CryptoUtils::verify_secret(&secret, &self.immutables.hashlock),
            "Invalid secret"
        );

        // Validate caller (should be taker)
        assert_eq!(
            env::predecessor_account_id(),
            self.immutables.taker,
            "Only taker can withdraw"
        );

        // Update state
        self.state = EscrowState::Withdrawn;
        self.secret_used = Some(secret.clone());

        log!(
            "Escrow withdrawal by taker {} with secret: {}",
            self.immutables.taker,
            secret
        );

        // Transfer funds to the taker
        self.transfer_funds_to_taker()
    }

    /// Cancel escrow and refund (after cancellation period)
    /// This can be called by maker if taker doesn't withdraw in time
    pub fn cancel(&mut self) -> Promise {
        // Validate state
        assert!(
            matches!(self.state, EscrowState::Active),
            "Escrow is not active"
        );

        // Validate timelock
        assert!(
            self.immutables.timelocks.can_cancel(),
            "Cancellation period not reached"
        );

        // Validate caller (should be maker)
        assert_eq!(
            env::predecessor_account_id(),
            self.immutables.maker,
            "Only maker can cancel"
        );

        // Update state
        self.state = EscrowState::Cancelled;

        log!(
            "Escrow cancelled by maker: {}",
            self.immutables.maker
        );

        // Refund to maker
        self.transfer_funds_to_maker()
    }

    /// Emergency rescue funds (after rescue delay)
    /// This is a safety mechanism for stuck funds
    pub fn rescue_funds(&mut self, recipient: AccountId) -> Promise {
        // Validate state
        assert!(
            matches!(self.state, EscrowState::Active),
            "Escrow is not active"
        );

        // Validate timelock
        assert!(
            self.immutables.timelocks.can_rescue(),
            "Rescue period not reached"
        );

        // Validate caller (should be maker for safety)
        assert_eq!(
            env::predecessor_account_id(),
            self.immutables.maker,
            "Only maker can rescue funds"
        );

        // Update state
        self.state = EscrowState::Rescued;

        log!(
            "Funds rescued by {} to {}",
            env::predecessor_account_id(),
            recipient
        );

        // Transfer to recipient
        self.transfer_funds(recipient)
    }

    // === View Methods ===

    pub fn get_immutables(&self) -> EscrowImmutables {
        self.immutables.clone()
    }

    pub fn get_state(&self) -> EscrowState {
        self.state.clone()
    }

    pub fn get_secret_used(&self) -> Option<String> {
        self.secret_used.clone()
    }

    pub fn get_factory(&self) -> AccountId {
        self.factory.clone()
    }

    pub fn can_withdraw(&self) -> bool {
        matches!(self.state, EscrowState::Active) 
            && self.immutables.timelocks.can_withdraw()
    }

    pub fn can_cancel(&self) -> bool {
        matches!(self.state, EscrowState::Active) 
            && self.immutables.timelocks.can_cancel()
    }

    pub fn can_rescue(&self) -> bool {
        matches!(self.state, EscrowState::Active) 
            && self.immutables.timelocks.can_rescue()
    }

    // === Private Methods ===

    fn transfer_funds_to_maker(&self) -> Promise {
        self.transfer_funds(self.immutables.maker.clone())
    }

    fn transfer_funds_to_taker(&self) -> Promise {
        self.transfer_funds(self.immutables.taker.clone())
    }

    fn transfer_funds(&self, recipient: AccountId) -> Promise {
        match &self.immutables.token {
            // Native NEAR transfer
            None => {
                Promise::new(recipient).transfer(NearToken::from_yoctonear(self.immutables.amount))
            }
            // NEP141 token transfer
            Some(token_account) => {
                ext_ft_core::ext(token_account.clone())
                    .with_static_gas(GAS_FOR_FT_TRANSFER)
                    .with_attached_deposit(NearToken::from_yoctonear(1)) // Required 1 yoctoNEAR for storage
                    .ft_transfer(
                        recipient,
                        U128(self.immutables.amount),
                        None, // No memo
                    )
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, VMContext};
    use shared::{Timelocks, CryptoUtils};

    fn get_context(predecessor: AccountId) -> VMContext {
        VMContextBuilder::new()
            .predecessor_account_id(predecessor)
            .attached_deposit(NearToken::from_near(1)) // 1 NEAR
            .build()
    }

    #[test]
    fn test_escrow_creation() {
        let context = get_context(accounts(0));
        testing_env!(context);

        let secret = "test_secret_123";
        let hashlock = CryptoUtils::create_hashlock(secret);
        
        let immutables = EscrowImmutables {
            order_hash: "order_123".to_string(),
            hashlock,
            maker: accounts(1),
            taker: accounts(2),
            token: None, // Native NEAR
            amount: 1000000000000000000000000, // 1 NEAR
            safety_deposit: 100000000000000000000000, // 0.1 NEAR
            timelocks: Timelocks::new(3600, 7200, 86400), // 1h, 2h, 24h
        };

        let escrow = EscrowDst::new(immutables.clone());
        
        assert!(matches!(escrow.state, EscrowState::Active));
        assert_eq!(escrow.immutables.order_hash, "order_123");
        assert_eq!(escrow.immutables.taker, accounts(2));
    }

    #[test]
    fn test_taker_withdrawal() {
        let mut context = get_context(accounts(2)); // taker
        testing_env!(context);

        let secret = "test_secret_123";
        let hashlock = CryptoUtils::create_hashlock(secret);
        
        let immutables = EscrowImmutables {
            order_hash: "order_123".to_string(),
            hashlock,
            maker: accounts(1),
            taker: accounts(2),
            token: None,
            amount: 1000000000000000000000000,
            safety_deposit: 100000000000000000000000,
            timelocks: Timelocks::new(3600, 7200, 86400),
        };

        let mut escrow = EscrowDst::new(immutables);
        
        // Taker should be able to withdraw with correct secret
        let _promise = escrow.withdraw(secret.to_string());
        
        assert!(matches!(escrow.state, EscrowState::Withdrawn));
        assert_eq!(escrow.secret_used, Some(secret.to_string()));
    }

    #[test]
    #[should_panic(expected = "Only taker can withdraw")]
    fn test_maker_cannot_withdraw() {
        let mut context = get_context(accounts(1)); // maker
        testing_env!(context);

        let secret = "test_secret_123";
        let hashlock = CryptoUtils::create_hashlock(secret);
        
        let immutables = EscrowImmutables {
            order_hash: "order_123".to_string(),
            hashlock,
            maker: accounts(1),
            taker: accounts(2),
            token: None,
            amount: 1000000000000000000000000,
            safety_deposit: 100000000000000000000000,
            timelocks: Timelocks::new(3600, 7200, 86400),
        };

        let mut escrow = EscrowDst::new(immutables);
        
        // Maker should not be able to withdraw
        escrow.withdraw(secret.to_string());
    }

    #[test]
    fn test_maker_cancellation() {
        let mut context = get_context(accounts(1)); // maker
        context.block_timestamp = 8000_000_000_000; // After cancellation period
        testing_env!(context);

        let secret = "test_secret_123";
        let hashlock = CryptoUtils::create_hashlock(secret);
        
        let immutables = EscrowImmutables {
            order_hash: "order_123".to_string(),
            hashlock,
            maker: accounts(1),
            taker: accounts(2),
            token: None,
            amount: 1000000000000000000000000,
            safety_deposit: 100000000000000000000000,
            timelocks: Timelocks::new(3600, 7200, 86400),
        };

        let mut escrow = EscrowDst::new(immutables);
        
        // Maker should be able to cancel after timelock
        let _promise = escrow.cancel();
        
        assert!(matches!(escrow.state, EscrowState::Cancelled));
    }
} 