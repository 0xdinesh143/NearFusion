use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::{LookupMap, UnorderedMap};
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near_bindgen, AccountId, Gas, Promise, PromiseResult, NearToken,
    PanicOnDefault, log,
};

use shared::{EscrowImmutables, EscrowType, Balance};
use schemars::{JsonSchema, gen::SchemaGenerator, schema::{Schema, SchemaObject}};

/// Gas allocation for escrow contract calls
const GAS_FOR_ESCROW_CALL: Gas = Gas::from_gas(30_000_000_000_000);
/// Minimum storage deposit for escrow creation
const MIN_STORAGE_DEPOSIT: Balance = 3_000_000_000_000_000_000_000_000; // 3 NEAR

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct EscrowInfo {
    pub escrow_type: EscrowType,
    pub immutables: EscrowImmutables,
    pub creator: AccountId,
    pub created_at: u64,
}

impl JsonSchema for EscrowInfo {
    fn schema_name() -> String {
        "EscrowInfo".to_string()
    }

    fn json_schema(gen: &mut SchemaGenerator) -> Schema {
        let mut schema = SchemaObject::default();
        schema.object().properties.insert("escrow_type".to_string(), gen.subschema_for::<EscrowType>());
        schema.object().properties.insert("immutables".to_string(), gen.subschema_for::<EscrowImmutables>());
        schema.object().properties.insert("creator".to_string(), gen.subschema_for::<String>());
        schema.object().properties.insert("created_at".to_string(), gen.subschema_for::<u64>());
        schema.object().required.extend(vec![
            "escrow_type".to_string(),
            "immutables".to_string(),
            "creator".to_string(),
            "created_at".to_string()
        ]);
        Schema::Object(schema)
    }
}

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct EscrowFactory {
    /// Owner of the factory contract
    pub owner: AccountId,
    /// Map from order hash to escrow account ID
    pub order_to_escrow: LookupMap<String, AccountId>,
    /// Map from escrow account ID to escrow info
    pub escrow_info: UnorderedMap<AccountId, EscrowInfo>,
    /// Creation fee in yoctoNEAR
    pub creation_fee: Balance,
    /// Treasury account for collecting fees
    pub treasury: Option<AccountId>,
    /// Pre-deployed escrow contract account ID (used as template)
    pub escrow_template: Option<AccountId>,
}

#[near_bindgen]
impl EscrowFactory {
    #[init]
    pub fn new(
        owner: AccountId,
        creation_fee: U128,
        treasury: Option<AccountId>,
        escrow_template: Option<AccountId>,
    ) -> Self {
        Self {
            owner,
            order_to_escrow: LookupMap::new(b"o"),
            escrow_info: UnorderedMap::new(b"e"),
            creation_fee: creation_fee.0,
            treasury,
            escrow_template,
        }
    }

    /// Update the escrow template contract (owner only)
    pub fn set_escrow_template(&mut self, template: AccountId) {
        self.assert_owner();
        let template_clone = template.clone();
        self.escrow_template = Some(template);
        log!("Escrow template updated to: {}", template_clone);
    }

    /// Create a source escrow for EVM→NEAR swaps
    #[payable]
    pub fn create_src_escrow(&mut self, immutables: EscrowImmutables) -> Promise {
        self.create_escrow(immutables, EscrowType::Source)
    }

    /// Create a destination escrow for NEAR→EVM swaps  
    #[payable]
    pub fn create_dst_escrow(&mut self, immutables: EscrowImmutables) -> Promise {
        self.create_escrow(immutables, EscrowType::Destination)
    }

    /// Internal escrow creation logic
    fn create_escrow(&mut self, immutables: EscrowImmutables, escrow_type: EscrowType) -> Promise {
        // Ensure template is set
        let template = self.escrow_template.as_ref()
            .expect("Escrow template not set");

        // Validate payment
        let attached_deposit = env::attached_deposit();
        let required_deposit = self.calculate_required_deposit(&immutables);
        
        assert!(
            attached_deposit.as_yoctonear() >= required_deposit,
            "Insufficient deposit. Required: {}, provided: {}", 
            required_deposit, attached_deposit.as_yoctonear()
        );

        // Check if escrow already exists for this order
        assert!(
            !self.order_to_escrow.contains_key(&immutables.order_hash),
            "Escrow already exists for order: {}", immutables.order_hash
        );

        // Generate deterministic escrow account ID
        let escrow_account_id = self.generate_escrow_account_id(&immutables.order_hash, &escrow_type);
        
        // Store escrow info
        let escrow_info = EscrowInfo {
            escrow_type: escrow_type.clone(),
            immutables: immutables.clone(),
            creator: env::predecessor_account_id(),
            created_at: env::block_timestamp(),
        };

        let order_hash_clone = immutables.order_hash.clone();
        self.order_to_escrow.insert(&order_hash_clone, &escrow_account_id);
        self.escrow_info.insert(&escrow_account_id, &escrow_info);

        // Calculate amounts for escrow and fee
        let escrow_amount = NearToken::from_yoctonear(
            attached_deposit.as_yoctonear() - self.creation_fee
        );
        
        log!(
            "Creating {} escrow: {} for order: {} with deposit: {}",
            match escrow_type {
                EscrowType::Source => "source",
                EscrowType::Destination => "destination"
            },
            escrow_account_id,
            immutables.order_hash,
            escrow_amount.as_yoctonear()
        );

        // Create new account and initialize with unified escrow
        Promise::new(escrow_account_id.clone())
            .create_account()
            .transfer(escrow_amount)
            .add_full_access_key(env::signer_account_pk()) // Allow creator to manage
            .deploy_contract(
                // For now, we'll need to read the escrow WASM from the template
                // In production, you'd store this differently or use cross-contract calls
                self.get_escrow_wasm()
            )
            .function_call(
                "new".to_string(),
                near_sdk::serde_json::to_vec(&(escrow_type, immutables)).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_FOR_ESCROW_CALL,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_gas(10_000_000_000_000))
                    .on_escrow_created(
                        escrow_account_id,
                        order_hash_clone,
                        self.creation_fee,
                    )
            )
    }

    /// Simple approach: Use a lightweight initialization pattern
    /// Instead of deploying contracts, we'll use cross-contract calls to existing escrow contracts
    #[payable]
    pub fn initialize_escrow(
        &mut self, 
        escrow_account: AccountId,
        immutables: EscrowImmutables, 
        escrow_type: EscrowType
    ) -> Promise {
        // Validate payment
        let attached_deposit = env::attached_deposit();
        let required_deposit = self.calculate_required_deposit(&immutables);
        
        assert!(
            attached_deposit.as_yoctonear() >= required_deposit,
            "Insufficient deposit. Required: {}, provided: {}", 
            required_deposit, attached_deposit.as_yoctonear()
        );

        // Check if escrow already exists for this order
        assert!(
            !self.order_to_escrow.contains_key(&immutables.order_hash),
            "Escrow already exists for order: {}", immutables.order_hash
        );

        // Store escrow info
        let escrow_info = EscrowInfo {
            escrow_type: escrow_type.clone(),
            immutables: immutables.clone(),
            creator: env::predecessor_account_id(),
            created_at: env::block_timestamp(),
        };

        let order_hash_clone = immutables.order_hash.clone();
        self.order_to_escrow.insert(&order_hash_clone, &escrow_account);
        self.escrow_info.insert(&escrow_account, &escrow_info);

        // Calculate amounts for escrow and fee
        let escrow_amount = NearToken::from_yoctonear(
            attached_deposit.as_yoctonear() - self.creation_fee
        );

        log!(
            "Initializing {} escrow: {} for order: {}",
            match escrow_type {
                EscrowType::Source => "source",
                EscrowType::Destination => "destination"
            },
            escrow_account,
            immutables.order_hash
        );

        // Transfer funds and initialize the escrow
        Promise::new(escrow_account.clone())
            .transfer(escrow_amount)
            .function_call(
                "new".to_string(),
                near_sdk::serde_json::to_vec(&(escrow_type, immutables)).unwrap(),
                NearToken::from_yoctonear(0),
                GAS_FOR_ESCROW_CALL,
            )
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_gas(10_000_000_000_000))
                    .on_escrow_created(
                        escrow_account,
                        order_hash_clone,
                        self.creation_fee,
                    )
            )
    }

    /// Callback after escrow creation
    #[private]
    pub fn on_escrow_created(
        &mut self,
        escrow_account_id: AccountId,
        order_hash: String,
        fee: Balance,
    ) -> bool {
        match env::promise_result(0) {
            PromiseResult::Successful(_) => {
                log!("Escrow created successfully: {}", escrow_account_id);
                
                // Transfer creation fee to treasury if set
                if let Some(treasury) = &self.treasury {
                    if fee > 0 {
                        Promise::new(treasury.clone()).transfer(NearToken::from_yoctonear(fee));
                        log!("Creation fee {} transferred to treasury: {}", fee, treasury);
                    }
                }
                true
            }
            PromiseResult::Failed => {
                log!("Failed to create escrow: {}", escrow_account_id);
                
                // Clean up storage
                self.order_to_escrow.remove(&order_hash);
                self.escrow_info.remove(&escrow_account_id);
                
                false
            }
        }
    }

    /// Get escrow account ID for an order
    pub fn get_escrow_for_order(&self, order_hash: String) -> Option<AccountId> {
        self.order_to_escrow.get(&order_hash)
    }

    /// Get escrow information
    pub fn get_escrow_info(&self, escrow_account_id: AccountId) -> Option<EscrowInfo> {
        self.escrow_info.get(&escrow_account_id)
    }

    /// Update creation fee (owner only)
    pub fn set_creation_fee(&mut self, fee: U128) {
        self.assert_owner();
        self.creation_fee = fee.0;
        log!("Creation fee updated to: {}", fee.0);
    }

    /// Update treasury (owner only)
    pub fn set_treasury(&mut self, treasury: Option<AccountId>) {
        self.assert_owner();
        self.treasury = treasury.clone();
        log!("Treasury updated to: {:?}", treasury);
    }

    /// Emergency fund rescue (owner only)
    pub fn rescue_funds(&mut self, amount: U128, recipient: AccountId) -> Promise {
        self.assert_owner();
        Promise::new(recipient).transfer(NearToken::from_yoctonear(amount.0))
    }

    // === View Methods ===

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_creation_fee(&self) -> U128 {
        U128(self.creation_fee)
    }

    pub fn get_treasury(&self) -> Option<AccountId> {
        self.treasury.clone()
    }

    pub fn get_escrow_template(&self) -> Option<AccountId> {
        self.escrow_template.clone()
    }

    // === Private Methods ===

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can call this method"
        );
    }

    fn calculate_required_deposit(&self, immutables: &EscrowImmutables) -> Balance {
        let mut required = self.creation_fee + MIN_STORAGE_DEPOSIT;
        
        // Add token amount for native NEAR transfers
        if immutables.token.is_none() {
            required += immutables.amount;
        }
        
        // Add safety deposit
        required += immutables.safety_deposit;
        
        required
    }

    fn generate_escrow_account_id(&self, order_hash: &str, escrow_type: &EscrowType) -> AccountId {
        let type_prefix = match escrow_type {
            EscrowType::Source => "src",
            EscrowType::Destination => "dst",
        };
        
        let account_str = format!(
            "{}-{}.{}",
            type_prefix,
            &order_hash[..8], // First 8 chars of order hash
            env::current_account_id()
        );
        
        account_str.parse().unwrap()
    }

    /// Placeholder for getting escrow WASM code
    /// In a real implementation, you would:
    /// 1. Store the WASM as a global contract
    /// 2. Load from an external source
    /// 3. Use a pre-deployed template pattern
    fn get_escrow_wasm(&self) -> Vec<u8> {
        // For now, return empty - this will need to be implemented based on your deployment strategy
        // You could read from a file, fetch from another contract, or use global contracts
        Vec::new()
    }
}

// External contract interface for callbacks
#[near_sdk::ext_contract(ext_self)]
trait ExtSelf {
    fn on_escrow_created(
        &mut self,
        escrow_account_id: AccountId,
        order_hash: String,
        fee: Balance,
    ) -> bool;
}