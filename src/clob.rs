//! Polymarket CLOB API client: auth (EIP-712 + HMAC), orders, balance, open orders.

use crate::types::{BalanceAllowance, OpenOrderItem, OrderResult, PriceResponse};
use anyhow::{Context, Result};
use ethers::core::types::transaction::eip712::{EIP712Domain, Eip712DomainType, TypedData};
use ethers::core::types::{Address, U256};
use ethers::signers::{LocalWallet, Signer};
use reqwest::Client;
use serde::Deserialize;
use std::collections::BTreeMap;
use std::str::FromStr;

const CLOB_EXCHANGE_ADDRESS: &str = "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E";
const CLOB_AUTH_MESSAGE: &str = "This message attests that I control the given wallet";
const ZERO_ADDRESS: &str = "0x0000000000000000000000000000000000000000";
const FIXED_POINT_SCALE: u64 = 1_000_000;

#[derive(Debug, Deserialize)]
pub struct ApiCreds {
    pub api_key: Option<String>,
    #[serde(alias = "apiKey")]
    pub api_key_alt: Option<String>,
    pub secret: Option<String>,
    pub passphrase: Option<String>,
}

impl ApiCreds {
    pub fn key(&self) -> Option<&str> {
        self.api_key_alt.as_deref().or(self.api_key.as_deref())
    }
}

/// Build EIP-712 TypedData for ClobAuth (derive API key).
fn build_clob_auth_typed_data(chain_id: u64, address: &Address, timestamp: u64, nonce: u64) -> TypedData {
    let domain = EIP712Domain {
        name: Some("ClobAuthDomain".to_string()),
        version: Some("1".to_string()),
        chain_id: Some(U256::from(chain_id)),
        verifying_contract: None,
        salt: None,
    };
    let mut types = BTreeMap::new();
    types.insert(
        "EIP712Domain".to_string(),
        vec![
            Eip712DomainType { name: "name".into(), r#type: "string".into() },
            Eip712DomainType { name: "version".into(), r#type: "string".into() },
            Eip712DomainType { name: "chainId".into(), r#type: "uint256".into() },
        ],
    );
    types.insert(
        "ClobAuth".to_string(),
        vec![
            Eip712DomainType { name: "address".into(), r#type: "address".into() },
            Eip712DomainType { name: "timestamp".into(), r#type: "string".into() },
            Eip712DomainType { name: "nonce".into(), r#type: "uint256".into() },
            Eip712DomainType { name: "message".into(), r#type: "string".into() },
        ],
    );
    let mut message = BTreeMap::new();
    message.insert("address".to_string(), serde_json::json!(format!("{:?}", address)));
    message.insert("timestamp".to_string(), serde_json::json!(timestamp.to_string()));
    message.insert("nonce".to_string(), serde_json::json!(format!("{}", nonce)));
    message.insert("message".to_string(), serde_json::json!(CLOB_AUTH_MESSAGE));
    TypedData {
        domain,
        types,
        primary_type: "ClobAuth".to_string(),
        message,
    }
}

/// Build EIP-712 TypedData for Order (Polymarket CTF Exchange).
fn build_order_typed_data(
    chain_id: u64,
    salt: u64,
    maker: &Address,
    signer: &Address,
    token_id: U256,
    maker_amount: U256,
    taker_amount: U256,
    expiration: u64,
    nonce: u64,
    fee_rate_bps: u64,
    side: u8,
    signature_type: u8,
) -> TypedData {
    let verifying_contract = Address::from_str(CLOB_EXCHANGE_ADDRESS).unwrap();
    let domain = EIP712Domain {
        name: Some("Polymarket CTF Exchange".to_string()),
        version: Some("1".to_string()),
        chain_id: Some(U256::from(chain_id)),
        verifying_contract: Some(verifying_contract),
        salt: None,
    };
    let mut types = BTreeMap::new();
    types.insert(
        "EIP712Domain".to_string(),
        vec![
            Eip712DomainType { name: "name".into(), r#type: "string".into() },
            Eip712DomainType { name: "version".into(), r#type: "string".into() },
            Eip712DomainType { name: "chainId".into(), r#type: "uint256".into() },
            Eip712DomainType { name: "verifyingContract".into(), r#type: "address".into() },
        ],
    );
    types.insert(
        "Order".to_string(),
        vec![
            Eip712DomainType { name: "salt".into(), r#type: "uint256".into() },
            Eip712DomainType { name: "maker".into(), r#type: "address".into() },
            Eip712DomainType { name: "signer".into(), r#type: "address".into() },
            Eip712DomainType { name: "taker".into(), r#type: "address".into() },
            Eip712DomainType { name: "tokenId".into(), r#type: "uint256".into() },
            Eip712DomainType { name: "makerAmount".into(), r#type: "uint256".into() },
            Eip712DomainType { name: "takerAmount".into(), r#type: "uint256".into() },
            Eip712DomainType { name: "expiration".into(), r#type: "uint256".into() },
            Eip712DomainType { name: "nonce".into(), r#type: "uint256".into() },
            Eip712DomainType { name: "feeRateBps".into(), r#type: "uint256".into() },
            Eip712DomainType { name: "side".into(), r#type: "uint8".into() },
            Eip712DomainType { name: "signatureType".into(), r#type: "uint8".into() },
        ],
    );
    let taker = Address::from_str(ZERO_ADDRESS).unwrap();
    let mut message = BTreeMap::new();
    message.insert("salt".to_string(), serde_json::json!(format!("{}", salt)));
    message.insert("maker".to_string(), serde_json::json!(format!("{:?}", maker)));
    message.insert("signer".to_string(), serde_json::json!(format!("{:?}", signer)));
    message.insert("taker".to_string(), serde_json::json!(format!("{:?}", taker)));
    message.insert("tokenId".to_string(), serde_json::json!(format!("{}", token_id)));
    message.insert("makerAmount".to_string(), serde_json::json!(format!("{}", maker_amount)));
    message.insert("takerAmount".to_string(), serde_json::json!(format!("{}", taker_amount)));
    message.insert("expiration".to_string(), serde_json::json!(format!("{}", expiration)));
    message.insert("nonce".to_string(), serde_json::json!(format!("{}", nonce)));
    message.insert("feeRateBps".to_string(), serde_json::json!(format!("{}", fee_rate_bps)));
    message.insert("side".to_string(), serde_json::json!(side));
    message.insert("signatureType".to_string(), serde_json::json!(signature_type));
    TypedData {
        domain,
        types,
        primary_type: "Order".to_string(),
        message,
    }
}

fn hmac_l2(secret_b64: &str, timestamp: u64, method: &str, path: &str, body: Option<&str>) -> Result<String> {
    let message = if let Some(b) = body {
        format!("{}{}{}{}", timestamp, method, path, b)
    } else {
        format!("{}{}{}", timestamp, method, path)
    };
    let secret_bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        secret_b64.replace('-', "+").replace('_', "/").trim(),
    )
    .context("Invalid base64 secret")?;
    use hmac::{Hmac, Mac};
    type HmacSha256 = Hmac<sha2::Sha256>;
    let mut mac = HmacSha256::new_from_slice(&secret_bytes).context("HMAC key")?;
    mac.update(message.as_bytes());
    let result = mac.finalize();
    let sig = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, result.into_bytes());
    let url_safe = sig.replace('+', "-").replace('/', "_");
    Ok(url_safe)
}

pub struct ClobClient {
    client: Client,
    host: String,
    chain_id: u64,
    wallet: LocalWallet,
    funder: Address,
    creds: Option<ApiCreds>,
}

impl ClobClient {
    pub fn new(host: &str, chain_id: u64, wallet: LocalWallet, funder_address: Option<&str>) -> Self {
        let funder = funder_address
            .and_then(|s| Address::from_str(s).ok())
            .unwrap_or_else(|| wallet.address());
        Self {
            client: Client::new(),
            host: host.trim_end_matches('/').to_string(),
            chain_id,
            wallet,
            funder,
            creds: None,
        }
    }

    pub async fn derive_api_key(&mut self) -> Result<()> {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let nonce = 0u64;
        let address = self.wallet.address();
        let typed = build_clob_auth_typed_data(self.chain_id, &address, timestamp, nonce);
        let sig = self.wallet.sign_typed_data(&typed).await?;
        let sig_hex = format!("0x{}", hex::encode(sig.to_vec()));
        let url = format!("{}/auth/derive-api-key", self.host);
        let resp = self
            .client
            .get(&url)
            .header("POLY_ADDRESS", format!("{:?}", address))
            .header("POLY_SIGNATURE", &sig_hex)
            .header("POLY_TIMESTAMP", timestamp.to_string())
            .header("POLY_NONCE", nonce.to_string())
            .send()
            .await?;
        let creds: ApiCreds = resp.json().await.context("derive-api-key response")?;
        self.creds = Some(creds);
        Ok(())
    }

    fn l2_headers(&self, method: &str, path: &str, body: Option<&str>) -> Result<Vec<(String, String)>> {
        let creds = self.creds.as_ref().context("Not authenticated: call derive_api_key first")?;
        let secret = creds.secret.as_deref().context("No secret in creds")?;
        let key = creds.key().context("No api key")?;
        let passphrase = creds.passphrase.as_deref().context("No passphrase")?;
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let sig = hmac_l2(secret, timestamp, method, path, body)?;
        Ok(vec![
            ("POLY_ADDRESS".to_string(), format!("{:?}", self.wallet.address())),
            ("POLY_SIGNATURE".to_string(), sig),
            ("POLY_TIMESTAMP".to_string(), timestamp.to_string()),
            ("POLY_API_KEY".to_string(), key.to_string()),
            ("POLY_PASSPHRASE".to_string(), passphrase.to_string()),
        ])
    }

    /// Public: get mid/price for a token (no auth).
    pub async fn get_price(&self, token_id: &str, side: &str) -> Result<Option<f64>> {
        let url = format!("{}/price", self.host);
        let resp = self
            .client
            .get(&url)
            .query(&[("token_id", token_id), ("side", side)])
            .send()
            .await?;
        let data: PriceResponse = resp.json().await.unwrap_or(PriceResponse {
            price: "0".to_string(),
        });
        let p: f64 = data.price.parse().unwrap_or(0.0);
        if p > 0.0 && p < 1.0 {
            Ok(Some(p))
        } else {
            Ok(None)
        }
    }

    pub async fn get_balance_allowance(&self) -> Result<BalanceAllowance> {
        let path = "/balance-allowance";
        let url = format!("{}{}", self.host, path);
        let headers = self.l2_headers("GET", path, None)?;
        let mut req = self.client.get(&url).query(&[("asset_type", "COLLATERAL")]);
        for (k, v) in &headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let resp = req.send().await?;
        let balance: BalanceAllowance = resp.json().await.context("balance-allowance")?;
        Ok(balance)
    }

    pub async fn get_open_orders(&self) -> Result<Vec<OpenOrderItem>> {
        let path = "/orders";
        let url = format!("{}{}", self.host, path);
        let headers = self.l2_headers("GET", path, None)?;
        let mut req = self.client.get(&url);
        for (k, v) in &headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let resp = req.send().await?;
        let orders: Vec<OpenOrderItem> = resp.json().await.unwrap_or_default();
        Ok(orders)
    }

    pub async fn cancel_order(&self, order_id: &str) -> Result<()> {
        let path = format!("/order/{}", order_id.trim_start_matches("0x"));
        let url = format!("{}{}", self.host, path);
        let headers = self.l2_headers("DELETE", &path, None)?;
        let mut req = self.client.delete(&url);
        for (k, v) in &headers {
            req = req.header(k.as_str(), v.as_str());
        }
        req.send().await?;
        Ok(())
    }

    /// Place a limit order (GTC). token_id is hex string from API.
    pub async fn place_limit_order(
        &self,
        token_id: &str,
        side: &str,
        price: f64,
        size: f64,
    ) -> Result<OrderResult> {
        let salt = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() as u64;
        let token_id_u256 = if token_id.starts_with("0x") {
            U256::from_str(token_id).unwrap_or(U256::zero())
        } else {
            U256::from_dec_str(token_id).unwrap_or(U256::zero())
        };
        let (maker_amount, taker_amount) = if side == "BUY" {
            let maker_usd = (price * size * FIXED_POINT_SCALE as f64) as u64;
            let taker_shares = (size * FIXED_POINT_SCALE as f64) as u64;
            (U256::from(maker_usd), U256::from(taker_shares))
        } else {
            let maker_shares = (size * FIXED_POINT_SCALE as f64) as u64;
            let taker_usd = (price * size * FIXED_POINT_SCALE as f64) as u64;
            (U256::from(maker_shares), U256::from(taker_usd))
        };
        let side_u8 = if side == "BUY" { 0u8 } else { 1u8 };
        let signature_type = 2u8; // Gnosis Safe
        let typed = build_order_typed_data(
            self.chain_id,
            salt,
            &self.funder,
            &self.wallet.address(),
            token_id_u256,
            maker_amount,
            taker_amount,
            0,
            0,
            0,
            side_u8,
            signature_type,
        );
        let sig = self.wallet.sign_typed_data(&typed).await?;
        let sig_hex = format!("0x{}", hex::encode(sig.to_vec()));

        let order_json = serde_json::json!({
            "maker": format!("{:?}", self.funder),
            "signer": format!("{:?}", self.wallet.address()),
            "taker": ZERO_ADDRESS,
            "tokenId": token_id,
            "makerAmount": format!("{}", maker_amount),
            "takerAmount": format!("{}", taker_amount),
            "side": side,
            "expiration": "0",
            "nonce": "0",
            "feeRateBps": "0",
            "signature": sig_hex,
            "salt": salt,
            "signatureType": signature_type,
        });
        let body = serde_json::json!({
            "order": order_json,
            "owner": uuid::Uuid::nil().to_string(),
            "orderType": "GTC",
        });
        let body_str = body.to_string();
        let path = "/order";
        let url = format!("{}/order", self.host);
        let headers = self.l2_headers("POST", path, Some(&body_str))?;
        let mut req = self.client.post(&url).json(&body);
        for (k, v) in &headers {
            req = req.header(k.as_str(), v.as_str());
        }
        let resp = req.send().await?;
        let result: OrderResult = resp.json().await.context("post order response")?;
        Ok(result)
    }
}
