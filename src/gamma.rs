//! Gamma API client for fetching 5-minute Up/Down markets (BTC, ETH, SOL).

use crate::config::TradeAsset;
use crate::types::MarketInfo;
use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct GammaEvent {
    id: Option<String>,
    title: Option<String>,
    markets: Option<Vec<serde_json::Value>>,
}

/// Fetch all active 5m Up/Down markets for the given assets, merged and deduped by market key.
pub async fn find_5m_updown_markets(
    client: &Client,
    gamma_host: &str,
    assets: &[TradeAsset],
) -> Result<Vec<MarketInfo>> {
    let mut all = Vec::new();
    for asset in assets {
        let markets = fetch_markets_by_slug(client, gamma_host, *asset).await?;
        for m in markets {
            if is_up_down_for_asset(&m, *asset) {
                all.push(m);
            }
        }
    }
    Ok(all)
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

fn is_up_down_for_asset(m: &MarketInfo, asset: TradeAsset) -> bool {
    let q = m.question().to_lowercase();
    q.contains(asset.question_keyword()) && q.contains("up or down")
}

async fn fetch_markets_by_slug(
    client: &Client,
    gamma_host: &str,
    asset: TradeAsset,
) -> Result<Vec<MarketInfo>> {
    let url = format!("{}/markets", gamma_host.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .query(&[
            ("slug", asset.slug()),
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
            markets.push(market);
        }
    }
    Ok(markets)
}
