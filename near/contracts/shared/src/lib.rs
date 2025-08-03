use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{AccountId, Timestamp};
use sha2::{Digest, Sha256};
use schemars::{JsonSchema, gen::SchemaGenerator, schema::{Schema, SchemaObject}};

// Type alias for compatibility
pub type Balance = u128;

/// Type of escrow contract - determines permissions and behavior
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, JsonSchema)]
#[serde(crate = "near_sdk::serde")]
pub enum EscrowType {
    /// Source escrow for EVM→NEAR swaps (maker withdraws, taker cancels/rescues)
    Source,
    /// Destination escrow for NEAR→EVM swaps (taker withdraws, maker cancels/rescues)
    Destination,
}

/// Immutable parameters for escrow contracts that match EVM structure
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct EscrowImmutables {
    pub order_hash: String,
    pub hashlock: String,      // SHA-256 hash of secret (hex encoded)
    pub maker: AccountId,      // Account creating the order
    pub taker: AccountId,      // Account filling the order
    pub token: Option<AccountId>, // None for NEAR, Some(account_id) for NEP141
    pub amount: Balance,       // Amount in yoctoNEAR or token units
    pub safety_deposit: Balance, // Safety deposit amount
    pub timelocks: Timelocks,
}

impl JsonSchema for EscrowImmutables {
    fn schema_name() -> String {
        "EscrowImmutables".to_string()
    }

    fn json_schema(gen: &mut SchemaGenerator) -> Schema {
        let mut schema = SchemaObject::default();
        schema.object().properties.insert("order_hash".to_string(), gen.subschema_for::<String>());
        schema.object().properties.insert("hashlock".to_string(), gen.subschema_for::<String>());
        schema.object().properties.insert("maker".to_string(), gen.subschema_for::<String>());
        schema.object().properties.insert("taker".to_string(), gen.subschema_for::<String>());
        schema.object().properties.insert("token".to_string(), gen.subschema_for::<Option<String>>());
        schema.object().properties.insert("amount".to_string(), gen.subschema_for::<u128>());
        schema.object().properties.insert("safety_deposit".to_string(), gen.subschema_for::<u128>());
        schema.object().properties.insert("timelocks".to_string(), gen.subschema_for::<Timelocks>());
        schema.object().required.extend(vec![
            "order_hash".to_string(), 
            "hashlock".to_string(), 
            "maker".to_string(), 
            "taker".to_string(), 
            "token".to_string(), 
            "amount".to_string(), 
            "safety_deposit".to_string(),
            "timelocks".to_string()
        ]);
        Schema::Object(schema)
    }
}

/// Timelock configuration matching EVM implementation
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, JsonSchema)]
#[serde(crate = "near_sdk::serde")]
pub struct Timelocks {
    pub deployed_at: Timestamp,
    pub withdrawal_period: u64,    // Duration in seconds for withdrawal
    pub cancellation_period: u64,  // Duration in seconds for cancellation
    pub rescue_delay: u64,         // Delay before funds can be rescued
}

impl Timelocks {
    pub fn new(withdrawal_period: u64, cancellation_period: u64, rescue_delay: u64) -> Self {
        Self {
            deployed_at: near_sdk::env::block_timestamp(),
            withdrawal_period,
            cancellation_period,
            rescue_delay,
        }
    }

    pub fn can_withdraw(&self) -> bool {
        let current_time = near_sdk::env::block_timestamp();
        current_time <= self.deployed_at + self.withdrawal_period * 1_000_000_000 // Convert to nanoseconds
    }

    pub fn can_cancel(&self) -> bool {
        let current_time = near_sdk::env::block_timestamp();
        current_time >= self.deployed_at + self.cancellation_period * 1_000_000_000
    }

    pub fn can_rescue(&self) -> bool {
        let current_time = near_sdk::env::block_timestamp();
        current_time >= self.deployed_at + self.rescue_delay * 1_000_000_000
    }
}

/// Cryptographic utilities for hashlock verification
pub struct CryptoUtils;

impl CryptoUtils {
    /// Create SHA-256 hashlock from secret (compatible with EVM)
    pub fn create_hashlock(secret: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(secret.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Verify secret matches hashlock
    pub fn verify_secret(secret: &str, hashlock: &str) -> bool {
        let computed_hash = Self::create_hashlock(secret);
        computed_hash == hashlock
    }

    /// Generate random secret (for testing/demo purposes)
    pub fn generate_secret() -> String {
        use near_sdk::env;
        let seed = env::random_seed();
        hex::encode(&seed[..16]) // Use first 16 bytes as secret
    }
}

/// Error types for escrow operations
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Debug)]
#[serde(crate = "near_sdk::serde")]
pub enum EscrowError {
    InvalidCaller,
    InvalidSecret,
    InvalidTime,
    InsufficientBalance,
    StorageDepositRequired,
    InvalidImmutables,
    TransferFailed,
}

impl std::fmt::Display for EscrowError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            EscrowError::InvalidCaller => write!(f, "Invalid caller"),
            EscrowError::InvalidSecret => write!(f, "Invalid secret"),
            EscrowError::InvalidTime => write!(f, "Invalid time for this operation"),
            EscrowError::InsufficientBalance => write!(f, "Insufficient balance"),
            EscrowError::StorageDepositRequired => write!(f, "Storage deposit required"),
            EscrowError::InvalidImmutables => write!(f, "Invalid immutables"),
            EscrowError::TransferFailed => write!(f, "Transfer failed"),
        }
    }
}

/// Storage deposit calculation for NEAR
pub fn calculate_storage_deposit() -> Balance {
    // Approximately 0.1 NEAR for storage deposit
    100_000_000_000_000_000_000_000 // 0.1 NEAR in yoctoNEAR
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_crypto_utils() {
        let secret = "test_secret_123";
        let hashlock = CryptoUtils::create_hashlock(secret);
        
        assert!(CryptoUtils::verify_secret(secret, &hashlock));
        assert!(!CryptoUtils::verify_secret("wrong_secret", &hashlock));
    }

    #[test]
    fn test_timelocks() {
        let timelocks = Timelocks::new(3600, 7200, 86400); // 1h, 2h, 24h
        
        // Should be able to withdraw initially
        assert!(timelocks.can_withdraw());
        
        // Cannot cancel initially
        assert!(!timelocks.can_cancel());
        
        // Cannot rescue initially
        assert!(!timelocks.can_rescue());
    }
} 