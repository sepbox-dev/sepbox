#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, BytesN,
    Env,
};

#[cfg(test)]
mod test;

const INSTANCE_TTL_THRESHOLD: u32 = 5_000;
const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;
const PERSISTENT_TTL_THRESHOLD: u32 = 10_000;
const PERSISTENT_TTL_EXTEND_TO: u32 = 100_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    ContractPaused = 3,
    InvalidAmount = 4,
    InsufficientLiquidity = 5,
    DuplicateSettlement = 6,
    Overflow = 7,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SettlementKind {
    Deposit,
    Withdrawal,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SettlementRecord {
    pub tx_id: BytesN<32>,
    pub kind: SettlementKind,
    pub account: Address,
    pub amount: i128,
    pub fee: i128,
    pub settled_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VaultStats {
    pub token: Address,
    pub vault_balance: i128,
    pub total_deposits: i128,
    pub total_withdrawals: i128,
    pub total_fees: i128,
    pub paused: bool,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Operator,
    Token,
    Paused,
    TotalDeposits,
    TotalWithdrawals,
    TotalFees,
    Settlement(BytesN<32>),
}

#[contractevent(topics = ["vault", "init"])]
pub struct VaultInitialized {
    pub admin: Address,
    pub operator: Address,
    pub token: Address,
}

#[contractevent(topics = ["vault", "funded"])]
pub struct VaultFunded {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

#[contractevent(topics = ["vault", "deposit"])]
pub struct DepositSettled {
    #[topic]
    pub tx_id: BytesN<32>,
    pub recipient: Address,
    pub amount: i128,
    pub fee: i128,
}

#[contractevent(topics = ["vault", "withdraw"])]
pub struct WithdrawalRecorded {
    #[topic]
    pub tx_id: BytesN<32>,
    pub sender: Address,
    pub amount: i128,
    pub fee: i128,
}

#[contractevent(topics = ["vault", "paused"])]
pub struct VaultPaused {
    pub paused: bool,
}

#[contractevent(topics = ["vault", "operator"])]
pub struct OperatorRotated {
    pub new_operator: Address,
}

#[contract]
pub struct AnchorVaultContract;

impl AnchorVaultContract {
    fn extend_instance(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }

    fn require_initialized(env: &Env) -> Result<(), VaultError> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(VaultError::NotInitialized);
        }
        Ok(())
    }

    fn require_not_paused(env: &Env) -> Result<(), VaultError> {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        if paused {
            return Err(VaultError::ContractPaused);
        }
        Ok(())
    }
}

#[contractimpl]
impl AnchorVaultContract {
    /// One-time vault configuration setting admin, anchor settlement operator, and SAC token.
    pub fn initialize(
        env: Env,
        admin: Address,
        operator: Address,
        token: Address,
    ) -> Result<(), VaultError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(VaultError::AlreadyInitialized);
        }

        admin.require_auth();

        let store = env.storage().instance();
        store.set(&DataKey::Admin, &admin);
        store.set(&DataKey::Operator, &operator);
        store.set(&DataKey::Token, &token);
        store.set(&DataKey::Paused, &false);
        store.set(&DataKey::TotalDeposits, &0_i128);
        store.set(&DataKey::TotalWithdrawals, &0_i128);
        store.set(&DataKey::TotalFees, &0_i128);
        Self::extend_instance(&env);

        VaultInitialized {
            admin,
            operator,
            token,
        }
        .publish(&env);
        Ok(())
    }

    /// Deposits liquidity into the anchor vault from a liquidity provider account.
    pub fn fund_vault(env: Env, from: Address, amount: i128) -> Result<i128, VaultError> {
        Self::require_initialized(&env)?;
        if amount <= 0 {
            return Err(VaultError::InvalidAmount);
        }

        from.require_auth();

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(VaultError::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        let vault_addr = env.current_contract_address();

        token_client.transfer(&from, &vault_addr, &amount);
        Self::extend_instance(&env);

        let updated_balance = token_client.balance(&vault_addr);
        VaultFunded { from, amount }.publish(&env);
        Ok(updated_balance)
    }

    /// Settles a completed SEP-24 deposit by disbursing tokens from the vault to the recipient.
    /// Enforces strict tx_id idempotency to prevent double payouts.
    pub fn settle_deposit(
        env: Env,
        tx_id: BytesN<32>,
        recipient: Address,
        amount: i128,
        fee: i128,
    ) -> Result<SettlementRecord, VaultError> {
        Self::require_initialized(&env)?;
        Self::require_not_paused(&env)?;

        if amount <= 0 || fee < 0 {
            return Err(VaultError::InvalidAmount);
        }

        let operator: Address = env
            .storage()
            .instance()
            .get(&DataKey::Operator)
            .ok_or(VaultError::NotInitialized)?;
        operator.require_auth();

        let key = DataKey::Settlement(tx_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(VaultError::DuplicateSettlement);
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(VaultError::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        let vault_addr = env.current_contract_address();

        if token_client.balance(&vault_addr) < amount {
            return Err(VaultError::InsufficientLiquidity);
        }

        token_client.transfer(&vault_addr, &recipient, &amount);

        let record = SettlementRecord {
            tx_id: tx_id.clone(),
            kind: SettlementKind::Deposit,
            account: recipient.clone(),
            amount,
            fee,
            settled_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);

        let total_deposits: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalDeposits)
            .unwrap_or(0);
        let total_fees: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalFees)
            .unwrap_or(0);

        let next_deposits = total_deposits
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        let next_fees = total_fees.checked_add(fee).ok_or(VaultError::Overflow)?;

        env.storage()
            .instance()
            .set(&DataKey::TotalDeposits, &next_deposits);
        env.storage()
            .instance()
            .set(&DataKey::TotalFees, &next_fees);
        Self::extend_instance(&env);

        DepositSettled {
            tx_id,
            recipient,
            amount,
            fee,
        }
        .publish(&env);
        Ok(record)
    }

    /// Receives on-chain tokens from a user for a SEP-24 withdrawal and records settlement state.
    pub fn record_withdrawal(
        env: Env,
        tx_id: BytesN<32>,
        sender: Address,
        amount: i128,
        fee: i128,
    ) -> Result<SettlementRecord, VaultError> {
        Self::require_initialized(&env)?;
        Self::require_not_paused(&env)?;

        if amount <= 0 || fee < 0 || fee >= amount {
            return Err(VaultError::InvalidAmount);
        }

        sender.require_auth();

        let key = DataKey::Settlement(tx_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(VaultError::DuplicateSettlement);
        }

        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(VaultError::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        let vault_addr = env.current_contract_address();

        token_client.transfer(&sender, &vault_addr, &amount);

        let record = SettlementRecord {
            tx_id: tx_id.clone(),
            kind: SettlementKind::Withdrawal,
            account: sender.clone(),
            amount,
            fee,
            settled_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&key, &record);
        env.storage()
            .persistent()
            .extend_ttl(&key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);

        let total_withdrawals: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalWithdrawals)
            .unwrap_or(0);
        let total_fees: i128 = env
            .storage()
            .instance()
            .get(&DataKey::TotalFees)
            .unwrap_or(0);

        let next_withdrawals = total_withdrawals
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        let next_fees = total_fees.checked_add(fee).ok_or(VaultError::Overflow)?;

        env.storage()
            .instance()
            .set(&DataKey::TotalWithdrawals, &next_withdrawals);
        env.storage()
            .instance()
            .set(&DataKey::TotalFees, &next_fees);
        Self::extend_instance(&env);

        WithdrawalRecorded {
            tx_id,
            sender,
            amount,
            fee,
        }
        .publish(&env);
        Ok(record)
    }

    /// Emergency circuit breaker toggled by the vault admin.
    pub fn set_paused(env: Env, paused: bool) -> Result<(), VaultError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaultError::NotInitialized)?;
        admin.require_auth();

        env.storage().instance().set(&DataKey::Paused, &paused);
        Self::extend_instance(&env);

        VaultPaused { paused }.publish(&env);
        Ok(())
    }

    /// Rotates the authorized anchor settlement operator key.
    pub fn set_operator(env: Env, new_operator: Address) -> Result<(), VaultError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(VaultError::NotInitialized)?;
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::Operator, &new_operator);
        Self::extend_instance(&env);

        OperatorRotated { new_operator }.publish(&env);
        Ok(())
    }

    /// Looks up a previously settled transaction by its 32-byte SEP-24 correlation ID.
    pub fn get_settlement(env: Env, tx_id: BytesN<32>) -> Option<SettlementRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::Settlement(tx_id))
    }

    /// Returns live vault balance, cumulative settlement totals, and pause state.
    pub fn get_stats(env: Env) -> Result<VaultStats, VaultError> {
        let token_addr: Address = env
            .storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(VaultError::NotInitialized)?;
        let token_client = token::Client::new(&env, &token_addr);
        let vault_balance = token_client.balance(&env.current_contract_address());

        Ok(VaultStats {
            token: token_addr,
            vault_balance,
            total_deposits: env
                .storage()
                .instance()
                .get(&DataKey::TotalDeposits)
                .unwrap_or(0),
            total_withdrawals: env
                .storage()
                .instance()
                .get(&DataKey::TotalWithdrawals)
                .unwrap_or(0),
            total_fees: env
                .storage()
                .instance()
                .get(&DataKey::TotalFees)
                .unwrap_or(0),
            paused: env
                .storage()
                .instance()
                .get(&DataKey::Paused)
                .unwrap_or(false),
        })
    }
}