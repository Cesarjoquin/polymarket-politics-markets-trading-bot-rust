//! Domain types for markets and orders.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct MarketInfo {
    pub event_id: Option<String>,
    pub event_name: Option<String>,
    #[serde(alias = "id")]
    pub market_id: String,
    pub question: Option<String>,
    #[serde(alias = "clobTokenIds")]
    pub token_ids: TokenIds,
    pub outcomes: Option<Vec<String>>,
    pub outcome_prices: Option<Vec<String>>,
    pub active: Option<bool>,
    pub slug: Option<String>,
    #[serde(alias = "endDate")]
    pub end_date: String,
    #[serde(alias = "startDate")]
    pub start_date: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum TokenIds {
    Single(String),
    Array(Vec<String>),
}

impl MarketInfo {
    pub fn token_ids_vec(&self) -> Vec<String> {
        match &self.token_ids {
            TokenIds::Single(s) => vec![s.clone()],
            TokenIds::Array(arr) => arr.clone(),
        }
    }

    pub fn question(&self) -> &str {
        self.question.as_deref().unwrap_or(&self.market_id)
    }
}

#[derive(Clone, Debug)]
pub struct TrackedOrder {
    pub token_id: String,
    pub outcome: Outcome,
    pub market_id: String,
    pub market_key: String,
    pub end_date: String,
    pub size: f64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Outcome {
    Up,
    Down,
}

impl std::fmt::Display for Outcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Outcome::Up => write!(f, "Up"),
            Outcome::Down => write!(f, "Down"),
        }
    }
}

#[derive(Clone, Debug)]
pub struct TrackedSellInfo {
    pub token_id: String,
    pub outcome: Outcome,
    pub market_id: String,
    pub market_key: String,
    pub end_date: String,
    pub size: f64,
}

#[derive(Debug, Deserialize)]
pub struct OrderResult {
    pub order_id: Option<String>,
    #[serde(alias = "orderID")]
    pub order_id_alt: Option<String>,
    pub success: Option<bool>,
    pub status: Option<String>,
    pub error_msg: Option<String>,
}

impl OrderResult {
    pub fn order_id(&self) -> Option<&str> {
        self.order_id_alt.as_deref().or(self.order_id.as_deref())
    }
}

#[derive(Debug, Deserialize)]
pub struct BalanceAllowance {
    pub balance: Option<String>,
    pub allowance: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OpenOrderItem {
    pub id: Option<String>,
    #[serde(alias = "orderID")]
    pub order_id: Option<String>,
    #[serde(alias = "order_id")]
    pub order_id_alt: Option<String>,
}

impl OpenOrderItem {
    pub fn order_id(&self) -> Option<String> {
        self.id.clone()
            .or_else(|| self.order_id.clone())
            .or_else(|| self.order_id_alt.clone())
    }
}

#[derive(Debug, Deserialize)]
pub struct PriceResponse {
    pub price: String,
}
