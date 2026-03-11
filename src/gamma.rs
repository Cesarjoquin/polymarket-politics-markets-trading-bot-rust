//! Gamma API client for fetching politics (and other keyword-based) markets.

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

/// Fetch active binary markets whose event title or market question matches any of the given keywords.
pub async fn find_politics_markets(
    client: &Client,
    gamma_host: &str,
    keywords: &[String],
) -> Result<Vec<MarketInfo>> {
    let url = format!("{}/events", gamma_host.trim_end_matches('/'));
    let resp = client
        .get(&url)
        .query(&[
            ("limit", "100"),
            ("active", "true"),
            ("closed", "false"),
        ])
        .send()
        .await?;
    let events: Vec<GammaEvent> = resp.json().await.unwrap_or_default();
    let now = chrono::Utc::now();
    let mut all = Vec::new();
    for ev in events {
        let title_lower = ev.title.as_deref().unwrap_or("").to_lowercase();
        let event_matches = keywords
            .iter()
            .any(|k| !k.is_empty() && title_lower.contains(k));
        let markets = ev.markets.as_deref().unwrap_or(&[]);
        for m in markets {
            let question = m.get("question").and_then(|v| v.as_str()).unwrap_or("");
            let question_lower = question.to_lowercase();
            let market_matches = event_matches
                || keywords
                    .iter()
                    .any(|k| !k.is_empty() && question_lower.contains(k));
            if !market_matches {
                continue;
            }
            let closed = m.get("closed").and_then(|v| v.as_bool()).unwrap_or(true);
            let active = m.get("active").and_then(|v| v.as_bool()).unwrap_or(false);
            let enable_order_book = m.get("enableOrderBook").and_then(|v| v.as_bool()).unwrap_or(false);
            let end_date_str = match m.get("endDate").and_then(|v| v.as_str()) {
                Some(s) => s,
                _ => continue,
            };
            let end_date: chrono::DateTime<chrono::Utc> = match end_date_str.parse() {
                Ok(d) => d,
                _ => continue,
            };
            if closed || !active || !enable_order_book || end_date <= now {
                continue;
            }
            let token_ids = match m.get("clobTokenIds") {
                Some(serde_json::Value::Array(arr)) => {
                    let ids: Vec<String> = arr
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                    if ids.len() != 2 {
                        continue;
                    }
                    crate::types::TokenIds::Array(ids)
                }
                Some(serde_json::Value::String(_)) => continue,
                _ => continue,
            };
            if let Some(market) = parse_market_from_value(
                m,
                ev.id.as_deref(),
                ev.title.as_deref(),
                token_ids,
            ) {
                all.push(market);
            }
        }
    }
    Ok(all)
}

fn parse_market_from_value(
    m: &serde_json::Value,
    event_id: Option<&str>,
    event_name: Option<&str>,
    token_ids: crate::types::TokenIds,
) -> Option<MarketInfo> {
    let market_id = m.get("id")?.as_str()?.to_string();
    let question = m.get("question").and_then(|v| v.as_str()).map(String::from);
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
