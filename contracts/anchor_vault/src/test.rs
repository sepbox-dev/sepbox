use super::*;
use soroban_sdk::{
    testutils::Address as _,
    token::{Client as TokenClient, StellarAssetClient},
    BytesN, Env,
};

fn setup_env() -> (Env, Address, Address, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let operator = Address::generate(&env);
    let user = Address::generate(&env);
    let token_admin = Address::generate(&env);

    let sac = env.register_stellar_asset_contract_v2(token_admin);
    let token_id = sac.address();

    let vault_id = env.register(AnchorVaultContract, ());
    let client = AnchorVaultContractClient::new(&env, &vault_id);
    client.initialize(&admin, &operator, &token_id);

    (env, admin, operator, user, token_id, vault_id)
}

#[test]
fn test_initialize_prevents_reinitialization() {
    let (env, admin, operator, _, token_id, vault_id) = setup_env();
    let client = AnchorVaultContractClient::new(&env, &vault_id);

    let second = client.try_initialize(&admin, &operator, &token_id);
    assert!(matches!(second, Err(Ok(VaultError::AlreadyInitialized))));
}

#[test]
fn test_fund_and_settle_deposit_updates_balances_and_stats() {
    let (env, admin, _, user, token_id, vault_id) = setup_env();
    let client = AnchorVaultContractClient::new(&env, &vault_id);
    let sac_admin = StellarAssetClient::new(&env, &token_id);
    let token_client = TokenClient::new(&env, &token_id);

    sac_admin.mint(&admin, &1_000_0000000);
    let new_balance = client.fund_vault(&admin, &500_0000000);
    assert_eq!(new_balance, 500_0000000);

    let tx_id = BytesN::from_array(&env, &[7_u8; 32]);
    let record = client.settle_deposit(&tx_id, &user, &199_0000000, &1_0000000);

    assert_eq!(record.kind, SettlementKind::Deposit);
    assert_eq!(record.account, user);
    assert_eq!(record.amount, 199_0000000);
    assert_eq!(record.fee, 1_0000000);

    assert_eq!(token_client.balance(&user), 199_0000000);
    assert_eq!(token_client.balance(&vault_id), 301_0000000);

    let stored = client.get_settlement(&tx_id).expect("settlement record must persist");
    assert_eq!(stored, record);

    let stats = client.get_stats();
    assert_eq!(stats.vault_balance, 301_0000000);
    assert_eq!(stats.total_deposits, 199_0000000);
    assert_eq!(stats.total_fees, 1_0000000);
    assert!(!stats.paused);
}

#[test]
fn test_duplicate_deposit_settlement_is_rejected() {
    let (env, admin, _, user, token_id, vault_id) = setup_env();
    let client = AnchorVaultContractClient::new(&env, &vault_id);
    let sac_admin = StellarAssetClient::new(&env, &token_id);

    sac_admin.mint(&admin, &500_0000000);
    client.fund_vault(&admin, &500_0000000);

    let tx_id = BytesN::from_array(&env, &[42_u8; 32]);
    client.settle_deposit(&tx_id, &user, &100_0000000, &5000000);

    let duplicate = client.try_settle_deposit(&tx_id, &user, &100_0000000, &5000000);
    assert!(matches!(duplicate, Err(Ok(VaultError::DuplicateSettlement))));
}

#[test]
fn test_insufficient_liquidity_is_rejected() {
    let (env, _, _, user, _, vault_id) = setup_env();
    let client = AnchorVaultContractClient::new(&env, &vault_id);

    let tx_id = BytesN::from_array(&env, &[9_u8; 32]);
    let res = client.try_settle_deposit(&tx_id, &user, &50_0000000, &0);
    assert!(matches!(res, Err(Ok(VaultError::InsufficientLiquidity))));
}

#[test]
fn test_record_withdrawal_transfers_tokens_into_vault() {
    let (env, _, _, user, token_id, vault_id) = setup_env();
    let client = AnchorVaultContractClient::new(&env, &vault_id);
    let sac_admin = StellarAssetClient::new(&env, &token_id);
    let token_client = TokenClient::new(&env, &token_id);

    sac_admin.mint(&user, &300_0000000);

    let tx_id = BytesN::from_array(&env, &[11_u8; 32]);
    let record = client.record_withdrawal(&tx_id, &user, &100_0000000, &5000000);

    assert_eq!(record.kind, SettlementKind::Withdrawal);
    assert_eq!(token_client.balance(&user), 200_0000000);
    assert_eq!(token_client.balance(&vault_id), 100_0000000);

    let stats = client.get_stats();
    assert_eq!(stats.total_withdrawals, 100_0000000);
    assert_eq!(stats.total_fees, 5000000);

    let dup = client.try_record_withdrawal(&tx_id, &user, &100_0000000, &5000000);
    assert!(matches!(dup, Err(Ok(VaultError::DuplicateSettlement))));
}

#[test]
fn test_pause_circuit_breaker_blocks_settlements_until_unpaused() {
    let (env, admin, _, user, token_id, vault_id) = setup_env();
    let client = AnchorVaultContractClient::new(&env, &vault_id);
    let sac_admin = StellarAssetClient::new(&env, &token_id);

    sac_admin.mint(&admin, &200_0000000);
    client.fund_vault(&admin, &200_0000000);

    client.set_paused(&true);
    assert!(client.get_stats().paused);

    let tx_id = BytesN::from_array(&env, &[99_u8; 32]);
    let blocked = client.try_settle_deposit(&tx_id, &user, &50_0000000, &0);
    assert!(matches!(blocked, Err(Ok(VaultError::ContractPaused))));

    client.set_paused(&false);
    let settled = client.settle_deposit(&tx_id, &user, &50_0000000, &0);
    assert_eq!(settled.amount, 50_0000000);
}

#[test]
fn test_operator_rotation_updates_required_signer() {
    let (env, admin, _, user, token_id, vault_id) = setup_env();
    let client = AnchorVaultContractClient::new(&env, &vault_id);
    let sac_admin = StellarAssetClient::new(&env, &token_id);

    sac_admin.mint(&admin, &200_0000000);
    client.fund_vault(&admin, &200_0000000);

    let rotated_operator = Address::generate(&env);
    client.set_operator(&rotated_operator);

    let tx_id = BytesN::from_array(&env, &[77_u8; 32]);
    client.settle_deposit(&tx_id, &user, &25_0000000, &0);

    assert!(
        env.auths()
            .iter()
            .any(|(authorized_addr, _)| authorized_addr == &rotated_operator),
        "Rotated operator must be the required signer for settlement"
    );
}