//! Gamma API client for fetching BTC 5-minute markets.

use crate::types::MarketInfo;
use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;

const BTC_5M_SERIES_ID: &str = "10684";
const BTC_5M_SLUG: &str = "btc-updown-5m";

#[derive(Debug, Deserialize)]
struct GammaEvent {
    id: Option<String>,
    title: Option<String>,
    markets: Option<Vec<serde_json::Value>>,
}

pub async fn find_btc_5m_markets(client: &Client, gamma_host: &str) -> Result<Vec<MarketInfo>> {
    let url = format!("{}/events", gamma_host.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .query(&[
            ("series_id", BTC_5M_SERIES_ID),
            ("active", "true"),
            ("closed", "false"),
            ("limit", "25"),
        ])
        .send()
        .await?;
    let events: Vec<GammaEvent> = resp.json().await.unwrap_or_default();

    let mut markets = Vec::new();
    for event in events {
        let markets_arr = event.markets.as_deref().unwrap_or(&[]);
        for m in markets_arr {
            if let Some(market) = parse_market(m, event.id.as_deref(), event.title.as_deref()) {
                if is_btc_up_down(&market) {
                    markets.push(market);
                }
            }
        }
    }

    if markets.is_empty() {
        markets = fetch_markets_by_slug(client, gamma_host).await?;
    }

    Ok(markets)
}

fn parse_market(
    m: &serde_json::Value,
    event_id: Option<&str>,
    event_name: Option<&str>,
) -> Option<MarketInfo> {
    let market_id = m.get("id")?.as_str()?.to_string();
    let question = m.get("question").and_then(|v| v.as_str()).map(String::from);
    let token_ids = match m.get("clobTokenIds") {
        Some(serde_json::Value::Array(arr)) => {
            let ids: Vec<String> = arr
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect();
            if ids.len() == 1 {
                crate::types::TokenIds::Single(ids[0].clone())
            } else {
                crate::types::TokenIds::Array(ids)
            }
        }
        Some(serde_json::Value::String(s)) => crate::types::TokenIds::Single(s.clone()),
        _ => return None,
    };
    let outcomes = m
        .get("outcomes")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect());
    let end_date = m.get("endDate")?.as_str()?.to_string();
    let start_date = m.get("startDate").and_then(|v| v.as_str()).map(String::from);
    Some(MarketInfo {
        event_id: event_id.map(String::from),
        event_name: event_name.map(String::from),
        market_id,
        question,
        token_ids,
        outcomes,
        outcome_prices: None,
        active: m.get("active").and_then(|v| v.as_bool()),
        slug: m.get("slug").and_then(|v| v.as_str()).map(String::from),
        end_date,
        start_date,
    })
}

fn is_btc_up_down(m: &MarketInfo) -> bool {
    let q = m.question().to_lowercase();
    q.contains("bitcoin") && q.contains("up or down")
}

async fn fetch_markets_by_slug(client: &Client, gamma_host: &str) -> Result<Vec<MarketInfo>> {
    let url = format!("{}/markets", gamma_host.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .query(&[
            ("slug", BTC_5M_SLUG),
            ("active", "true"),
            ("closed", "false"),
            ("enableOrderBook", "true"),
            ("limit", "25"),
        ])
        .send()
        .await?;
    let arr: Vec<serde_json::Value> = resp.json().await.unwrap_or_default();
    let mut markets = Vec::new();
    for m in arr {
        if let Some(market) = parse_market(&m, None, None) {
            if is_btc_up_down(&market) {
                markets.push(market);
            }
        }
    }
    Ok(markets)
}
