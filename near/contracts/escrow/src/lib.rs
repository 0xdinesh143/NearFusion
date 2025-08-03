use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near_bindgen, AccountId, Promise, NearToken,
    PanicOnDefault, log, Gas,
};
use near_contract_standards::fungible_token::core::ext_ft_core;

use shared::{EscrowImmutables, EscrowType, CryptoUtils};
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
pub struct Escrow {
    /// Type of escrow (Source or Destination)
    pub escrow_type: EscrowType,
    /// Immutable escrow parameters
    pub immutables: EscrowImmutables,
    /// Current state of the escrow
    pub state: EscrowState,
    /// Factory contract that created this escrow
    pub factory: AccountId,
    /// Secret used/revealed for withdrawal
    pub secret: Option<String>,
}

#[near_bindgen]
impl Escrow {
    #[init]
    pub fn new(escrow_type: EscrowType, immutables: EscrowImmutables) -> Self {
        Self {
            escrow_type,
            immutables,
            state: EscrowState::Active,
            factory: env::predecessor_account_id(),
            secret: None,
        }
    }

    /// Withdraw funds with secret
    /// Behavior depends on escrow type:
    /// - Source: maker withdraws (reveals secret for EVM claim)
    /// - Destination: taker withdraws (uses secret learned from EVM)
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

        // Validate caller based on escrow type
        let caller = env::predecessor_account_id();
        match self.escrow_type {
            EscrowType::Source => {
                // For source escrows, maker withdraws (no caller restriction for flexibility)
                log!(
                    "Source escrow withdrawal by {} with secret: {}",
                    caller,
                    secret
                );
            }
            EscrowType::Destination => {
                // For destination escrows, only taker can withdraw
                assert_eq!(
                    caller,
                    self.immutables.taker,
                    "Only taker can withdraw from destination escrow"
                );
                log!(
                    "Destination escrow withdrawal by taker {} with secret: {}",
                    caller,
                    secret
                );
            }
        }

        // Update state
        self.state = EscrowState::Withdrawn;
        self.secret = Some(secret);

        // Transfer funds based on escrow type
        match self.escrow_type {
            EscrowType::Source => self.transfer_funds_to_maker(),
            EscrowType::Destination => self.transfer_funds_to_taker(),
        }
    }

    /// Cancel escrow and refund (after cancellation period)
    /// Behavior depends on escrow type:
    /// - Source: taker can cancel (refund taker)
    /// - Destination: maker can cancel (refund maker)
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

        // Validate caller based on escrow type
        let caller = env::predecessor_account_id();
        match self.escrow_type {
            EscrowType::Source => {
                assert_eq!(
                    caller,
                    self.immutables.taker,
                    "Only taker can cancel source escrow"
                );
                log!("Source escrow cancelled by taker: {}", caller);
            }
            EscrowType::Destination => {
                assert_eq!(
                    caller,
                    self.immutables.maker,
                    "Only maker can cancel destination escrow"
                );
                log!("Destination escrow cancelled by maker: {}", caller);
            }
        }

        // Update state
        self.state = EscrowState::Cancelled;

        // Refund based on escrow type
        match self.escrow_type {
            EscrowType::Source => self.transfer_funds_to_taker(),   // Refund taker
            EscrowType::Destination => self.transfer_funds_to_maker(), // Refund maker
        }
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

        // Validate caller based on escrow type
        let caller = env::predecessor_account_id();
        match self.escrow_type {
            EscrowType::Source => {
                assert_eq!(
                    caller,
                    self.immutables.taker,
                    "Only taker can rescue funds from source escrow"
                );
            }
            EscrowType::Destination => {
                assert_eq!(
                    caller,
                    self.immutables.maker,
                    "Only maker can rescue funds from destination escrow"
                );
            }
        }

        // Update state
        self.state = EscrowState::Rescued;

        log!(
            "Funds rescued by {} to {} from {:?} escrow",
            caller,
            recipient,
            self.escrow_type
        );

        // Transfer to recipient
        self.transfer_funds(recipient)
    }

    // === View Methods ===

    pub fn get_escrow_type(&self) -> EscrowType {
        self.escrow_type.clone()
    }

    pub fn get_immutables(&self) -> EscrowImmutables {
        self.immutables.clone()
    }

    pub fn get_state(&self) -> EscrowState {
        self.state.clone()
    }

    pub fn get_secret(&self) -> Option<String> {
        self.secret.clone()
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

    /// Get who can withdraw based on escrow type
    pub fn get_withdraw_authority(&self) -> AccountId {
        match self.escrow_type {
            EscrowType::Source => self.immutables.maker.clone(),
            EscrowType::Destination => self.immutables.taker.clone(),
        }
    }

    /// Get who can cancel based on escrow type
    pub fn get_cancel_authority(&self) -> AccountId {
        match self.escrow_type {
            EscrowType::Source => self.immutables.taker.clone(),
            EscrowType::Destination => self.immutables.maker.clone(),
        }
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
    fn test_source_escrow_creation() {
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

        let escrow = Escrow::new(EscrowType::Source, immutables.clone());
        
        assert!(matches!(escrow.state, EscrowState::Active));
        assert!(matches!(escrow.escrow_type, EscrowType::Source));
        assert_eq!(escrow.immutables.order_hash, "order_123");
        assert_eq!(escrow.get_withdraw_authority(), accounts(1)); // maker
        assert_eq!(escrow.get_cancel_authority(), accounts(2));   // taker
    }

    #[test]
    fn test_destination_escrow_creation() {
        let context = get_context(accounts(0));
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

        let escrow = Escrow::new(EscrowType::Destination, immutables.clone());
        
        assert!(matches!(escrow.state, EscrowState::Active));
        assert!(matches!(escrow.escrow_type, EscrowType::Destination));
        assert_eq!(escrow.get_withdraw_authority(), accounts(2)); // taker
        assert_eq!(escrow.get_cancel_authority(), accounts(1));   // maker
    }

    #[test]
    fn test_source_escrow_withdrawal() {
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

        let mut escrow = Escrow::new(EscrowType::Source, immutables);
        
        // Maker should be able to withdraw with correct secret
        let _promise = escrow.withdraw(secret.to_string());
        
        assert!(matches!(escrow.state, EscrowState::Withdrawn));
        assert_eq!(escrow.secret, Some(secret.to_string()));
    }

    #[test]
    fn test_destination_escrow_withdrawal() {
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

        let mut escrow = Escrow::new(EscrowType::Destination, immutables);
        
        // Taker should be able to withdraw with correct secret
        let _promise = escrow.withdraw(secret.to_string());
        
        assert!(matches!(escrow.state, EscrowState::Withdrawn));
        assert_eq!(escrow.secret, Some(secret.to_string()));
    }

    #[test]
    #[should_panic(expected = "Only taker can withdraw from destination escrow")]
    fn test_destination_escrow_maker_cannot_withdraw() {
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

        let mut escrow = Escrow::new(EscrowType::Destination, immutables);
        
        // Maker should not be able to withdraw from destination escrow
        escrow.withdraw(secret.to_string());
    }
}