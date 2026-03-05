//! Main bot loop: market discovery, orders, fill detection, stop-loss, emergency exit.

use crate::clob::ClobClient;
use crate::config::Config;
use crate::gamma;
use crate::logger;
use crate::types::{MarketInfo, Outcome, TrackedOrder, TrackedSellInfo};
use anyhow::Result;
use ethers::signers::{LocalWallet, Signer};
use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::Arc;
use tokio::time::{interval, Duration};

const MIN_SHARE_SIZE: f64 = 5.0;

fn normalize_order_id(id: &str) -> String {
    id.trim().to_lowercase()
}

fn get_market_key(market: &MarketInfo) -> String {
    format!(
        "{}|{}",
        market.end_date,
        market.question.as_deref().unwrap_or(&market.market_id)
    )
}

pub struct Bot {
    config: Config,
    clob: Arc<tokio::sync::Mutex<ClobClient>>,
    http: reqwest::Client,
    monitored_markets: HashMap<String, String>,
    market_id_to_key: HashMap<String, String>,
    bought_outcomes: HashMap<String, HashSet<Outcome>>,
    tracked_buys: HashMap<String, TrackedOrder>,
    tracked_sells: HashMap<String, TrackedSellInfo>,
    once_mode_entered: bool,
}

impl Bot {
    pub async fn new(config: Config) -> Result<Self> {
        let wallet = LocalWallet::from_str(config.private_key.trim())?;
        let _funder = config
            .funder_address
            .as_deref()
            .and_then(|s| ethers::core::types::Address::from_str(s).ok())
            .unwrap_or_else(|| wallet.address());
        let mut clob = ClobClient::new(
            &config.clob_host,
            config.chain_id,
            wallet.with_chain_id(config.chain_id),
            config.funder_address.as_deref(),
        );
        clob.derive_api_key().await?;
        let clob = Arc::new(tokio::sync::Mutex::new(clob));
        Ok(Self {
            config: config.clone(),
            clob,
            http: reqwest::Client::new(),
            monitored_markets: HashMap::new(),
            market_id_to_key: HashMap::new(),
            bought_outcomes: HashMap::new(),
            tracked_buys: HashMap::new(),
            tracked_sells: HashMap::new(),
            once_mode_entered: false,
        })
    }

    pub async fn run(&mut self) -> Result<()> {
        logger::init_global_log_file(self.config.log_file.as_deref());
        logger::divider();
        logger::log("CONFIG", "Polymarket BTC 5-Minute Bot (Rust)");
        logger::divider();
        logger::log("CONFIG", &format!("CLOB host: {}", self.config.clob_host));
        logger::log("CONFIG", &format!("Up BUY target: {}  SELL: {}", self.config.target_price_up, self.config.sell_price_up));
        logger::log("CONFIG", &format!("Down BUY target: {}  SELL: {}", self.config.target_price_down, self.config.sell_price_down));
        logger::log("CONFIG", &format!("Stop loss: Up {} / Down {} (67% of target)", self.config.stop_loss_price_up(), self.config.stop_loss_price_down()));
        logger::log("CONFIG", &format!("Order amount: {} tokens per side", self.config.order_amount_token));
        logger::log("CONFIG", &format!("Check interval: {}ms", self.config.check_interval_ms));
        logger::divider();

        let mut ticker = interval(Duration::from_millis(self.config.check_interval_ms));
        let mut iteration: u64 = 0;
        loop {
            ticker.tick().await;
            iteration += 1;
            logger::divider();
            logger::log(
                "LOOP",
                &format!(
                    "Iteration #{}  |  tracked buys: {}  |  monitored: {}",
                    iteration,
                    self.tracked_buys.len(),
                    self.monitored_markets.len()
                ),
            );
            if let Err(e) = self.run_one_iteration().await {
                logger::err("LOOP", &format!("Error: {}", e));
            }
            if self.config.trading_mode == crate::config::TradingMode::Once
                && self.once_mode_entered
                && self.monitored_markets.is_empty()
            {
                logger::log("LOOP", "Once mode: market ended – exiting.");
                break;
            }
            logger::log("LOOP", &format!("Next check in {}ms...", self.config.check_interval_ms));
        }
        Ok(())
    }

    async fn run_one_iteration(&mut self) -> Result<()> {
        self.log_balance().await?;
        self.cancel_expired_orders().await?;
        self.emergency_exit_near_close().await?;
        self.check_filled_orders().await?;
        self.place_sell_when_price_reached_if_missed().await?;
        self.enforce_stop_loss().await?;
        self.remove_filled_sell_tracking().await?;
        self.discover_and_enter_markets().await?;
        Ok(())
    }

    async fn log_balance(&self) -> Result<()> {
        let clob = self.clob.lock().await;
        let bal = clob.get_balance_allowance().await?;
        let balance = bal.balance.as_deref().unwrap_or("0").parse::<f64>().unwrap_or(0.0) / 1_000_000.0;
        let allowance = bal.allowance.as_deref().unwrap_or("0").parse::<f64>().unwrap_or(0.0) / 1_000_000.0;
        logger::log("BALANCE", &format!("USDC balance: ${:.2}  allowance: ${:.2}", balance, allowance));
        Ok(())
    }

    async fn fetch_open_order_ids(&self) -> Result<HashSet<String>> {
        let clob = self.clob.lock().await;
        let orders = clob.get_open_orders().await?;
        let ids: HashSet<String> = orders
            .into_iter()
            .filter_map(|o| o.order_id().as_deref().map(normalize_order_id))
            .collect();
        Ok(ids)
    }

    async fn cancel_expired_orders(&mut self) -> Result<()> {
        let now = chrono::Utc::now();
        let expired: Vec<_> = self
            .tracked_buys
            .iter()
            .filter(|(_, info)| info.end_date.parse::<chrono::DateTime<chrono::Utc>>().map(|d| d <= now).unwrap_or(false))
            .map(|(id, _)| id.clone())
            .collect();
        for order_id in &expired {
            let clob = self.clob.lock().await;
            if let Err(e) = clob.cancel_order(order_id).await {
                logger::err("EXPIRE", &format!("Cancel failed {}: {}", order_id, e));
            }
            self.tracked_buys.remove(order_id);
        }
        let mut to_prune = Vec::new();
        for (market_id, end_date) in &self.monitored_markets {
            if end_date.parse::<chrono::DateTime<chrono::Utc>>().map(|d| d <= now).unwrap_or(false) {
                if let Some(key) = self.market_id_to_key.get(market_id) {
                    self.bought_outcomes.remove(key);
                }
                to_prune.push(market_id.clone());
            }
        }
        for id in &to_prune {
            self.monitored_markets.remove(id);
            self.market_id_to_key.remove(id);
        }
        self.tracked_sells.retain(|_, info| {
            info.end_date.parse::<chrono::DateTime<chrono::Utc>>().map(|d| d > now).unwrap_or(true)
        });
        Ok(())
    }

    async fn emergency_exit_near_close(&mut self) -> Result<()> {
        let open_ids = self.fetch_open_order_ids().await?;
        let now = chrono::Utc::now();
        let to_exit: Vec<_> = self
            .tracked_sells
            .iter()
            .filter(|(id, info)| {
                if !open_ids.contains(&normalize_order_id(id)) {
                    return false;
                }
                let end: chrono::DateTime<chrono::Utc> = info.end_date.parse().unwrap_or(now);
                (end - now).num_seconds() <= self.config.exit_before_close_seconds as i64
            })
            .map(|(id, info)| (id.clone(), info.clone()))
            .collect();
        for (order_id, info) in to_exit {
            self.tracked_sells.remove(&order_id);
            let clob = self.clob.lock().await;
            let _ = clob.cancel_order(&order_id).await;
            if let Ok(res) = clob.place_limit_order(&info.token_id, "SELL", self.config.aggressive_exit_price, info.size).await {
                if let Some(oid) = res.order_id() {
                    logger::log("EXIT", &format!("Placed aggressive SELL orderId={}", oid));
                }
            }
        }
        Ok(())
    }

    async fn check_filled_orders(&mut self) -> Result<()> {
        if self.tracked_buys.is_empty() {
            return Ok(());
        }
        let open_ids = self.fetch_open_order_ids().await?;
        let filled: Vec<_> = self
            .tracked_buys
            .iter()
            .filter(|(id, _)| !open_ids.contains(&normalize_order_id(id)))
            .map(|(id, info)| (id.clone(), info.clone()))
            .collect();
        for (order_id, info) in filled {
            self.tracked_buys.remove(&order_id);
            self.handle_filled_buy(info).await?;
            tokio::time::sleep(Duration::from_millis(4000)).await;
        }
        Ok(())
    }

    async fn handle_filled_buy(&mut self, info: TrackedOrder) -> Result<()> {
        logger::log("FILL", &format!("BUY filled ({}), waiting {}ms before SELL...", info.outcome, self.config.sell_delay_ms));
        logger::log_market(&info.market_key, "FILL", &format!("Placing SELL after {}ms", self.config.sell_delay_ms));
        tokio::time::sleep(Duration::from_millis(self.config.sell_delay_ms)).await;
        let target_sell = match info.outcome {
            Outcome::Up => self.config.sell_price_up,
            Outcome::Down => self.config.sell_price_down,
        };
        let mut sell_price = target_sell;
        let clob = self.clob.lock().await;
        if let Ok(Some(bid)) = clob.get_price(&info.token_id, "sell").await {
            if bid >= target_sell {
                sell_price = bid;
            }
        }
        logger::log("FILL", &format!("Placing SELL {} shares @ {} for {} (target={})", info.size, sell_price, info.outcome, target_sell));
        let res = clob.place_limit_order(&info.token_id, "SELL", sell_price, info.size).await;
        drop(clob);
        match res {
            Ok(order_res) => {
                if let Some(oid) = order_res.order_id() {
                    self.tracked_sells
                        .insert(oid.to_string(), TrackedSellInfo {
                            token_id: info.token_id,
                            outcome: info.outcome,
                            market_id: info.market_id,
                            market_key: info.market_key,
                            end_date: info.end_date,
                            size: info.size,
                        });
                    logger::log("FILL", &format!("SELL placed orderId={}", oid));
                }
            }
            Err(e) => {
                logger::err("FILL", &format!("SELL failed: {}", e));
                if e.to_string().to_lowercase().contains("balance") || e.to_string().to_lowercase().contains("allowance") {
                    logger::warn("FILL", "Settlement may still be in progress – will retry next loop.");
                }
            }
        }
        Ok(())
    }

    async fn place_sell_when_price_reached_if_missed(&mut self) -> Result<()> {
        if self.tracked_buys.is_empty() {
            return Ok(());
        }
        let open_ids = self.fetch_open_order_ids().await?;
        for (order_id, info) in self.tracked_buys.clone().into_iter() {
            if open_ids.contains(&normalize_order_id(&order_id)) {
                continue;
            }
            let sell_target = match info.outcome {
                Outcome::Up => self.config.sell_price_up,
                Outcome::Down => self.config.sell_price_down,
            };
            let clob = self.clob.lock().await;
            if let Ok(Some(price)) = clob.get_price(&info.token_id, "sell").await {
                if price >= sell_target {
                    drop(clob);
                    self.tracked_buys.remove(&order_id);
                    self.handle_filled_buy(info).await?;
                    break;
                }
            }
        }
        Ok(())
    }

    async fn enforce_stop_loss(&mut self) -> Result<()> {
        let stop_up = self.config.stop_loss_price_up();
        let stop_down = self.config.stop_loss_price_down();
        let mut to_stop: Option<(String, TrackedSellInfo)> = None;
        {
            let clob = self.clob.lock().await;
            for (order_id, info) in &self.tracked_sells.clone() {
                let stop = match info.outcome {
                    Outcome::Up => stop_up,
                    Outcome::Down => stop_down,
                };
                if let Ok(Some(bid)) = clob.get_price(&info.token_id, "sell").await {
                    if bid <= stop {
                        if let Some(info) = self.tracked_sells.get(order_id) {
                            to_stop = Some((order_id.clone(), info.clone()));
                            break;
                        }
                    }
                }
            }
        }
        if let Some((order_id, info)) = to_stop {
            let stop = match info.outcome {
                Outcome::Up => stop_up,
                Outcome::Down => stop_down,
            };
            logger::log("STOP", &format!("Stop-loss triggered for {} – exiting", info.outcome));
            self.tracked_sells.remove(&order_id);
            let clob = self.clob.lock().await;
            let _ = clob.cancel_order(&order_id).await;
            if let Ok(Some(bid)) = clob.get_price(&info.token_id, "sell").await {
                if let Ok(res) = clob.place_limit_order(&info.token_id, "SELL", bid, info.size).await {
                    if let Some(oid) = res.order_id() {
                        self.tracked_sells.insert(oid.to_string(), info);
                    }
                }
            }
        }
        Ok(())
    }

    async fn remove_filled_sell_tracking(&mut self) -> Result<()> {
        let open_ids = self.fetch_open_order_ids().await?;
        self.tracked_sells.retain(|id, _| open_ids.contains(&normalize_order_id(id)));
        Ok(())
    }

    fn filter_live_markets(&self, markets: Vec<MarketInfo>) -> Vec<MarketInfo> {
        let now = chrono::Utc::now();
        let mut future: Vec<_> = markets
            .into_iter()
            .filter(|m| {
                let end: chrono::DateTime<chrono::Utc> = m.end_date.parse().unwrap_or(now);
                if end <= now {
                    return false;
                }
                let secs_left = (end - now).num_seconds();
                if secs_left < self.config.min_seconds_before_expiry as i64 {
                    return false;
                }
                true
            })
            .collect();
        future.sort_by(|a, b| {
            let sa = a.start_date.as_deref().unwrap_or(&a.end_date);
            let sb = b.start_date.as_deref().unwrap_or(&b.end_date);
            sa.cmp(sb)
        });
        let mut seen = HashSet::new();
        future.retain(|m| {
            let key = get_market_key(m);
            if seen.contains(&key) {
                return false;
            }
            seen.insert(key);
            true
        });
        future.into_iter().take(1).collect()
    }

    async fn discover_and_enter_markets(&mut self) -> Result<()> {
        let markets = gamma::find_btc_5m_markets(&self.http, &self.config.gamma_host).await?;
        let live = self.filter_live_markets(markets);
        if live.is_empty() {
            logger::warn("LOOP", "No active BTC 5m markets – will retry");
            return Ok(());
        }
        let monitored_keys: HashSet<_> = self.market_id_to_key.values().cloned().collect();
        for market in live {
            let market_key = get_market_key(&market);
            if self.monitored_markets.contains_key(&market.market_id) {
                continue;
            }
            if monitored_keys.contains(&market_key) {
                continue;
            }
            if self.config.trading_mode == crate::config::TradingMode::Once && self.monitored_markets.len() >= 1 {
                continue;
            }
            self.enter_market(&market).await?;
        }
        Ok(())
    }

    async fn enter_market(&mut self, market: &MarketInfo) -> Result<()> {
        let token_ids = market.token_ids_vec();
        if token_ids.len() < 2 {
            logger::warn("ENTER", "Market has fewer than 2 token IDs – skipping");
            return Ok(());
        }
        let now = chrono::Utc::now();
        let end: chrono::DateTime<chrono::Utc> = market.end_date.parse().unwrap_or(now);
        let secs_left = (end - now).num_seconds() as f64;
        let market_key = get_market_key(market);
        logger::divider();
        logger::log("ENTER", &format!("Market: {}", market.question()));
        logger::log("ENTER", &format!("Ends: {}  ({}m left)", market.end_date, secs_left / 60.0));
        if secs_left < self.config.min_seconds_to_enter as f64 {
            logger::warn("ENTER", "Too little time left – skipping");
            return Ok(());
        }
        let clob = self.clob.lock().await;
        let price_up = clob.get_price(&token_ids[0], "buy").await.ok().flatten();
        let price_down = clob.get_price(&token_ids[1], "buy").await.ok().flatten();
        drop(clob);
        let up_ok = price_up.map(|p| p <= self.config.target_price_up).unwrap_or(false);
        let down_ok = price_down.map(|p| p <= self.config.target_price_down).unwrap_or(false);
        if !up_ok && !down_ok {
            logger::log("ENTER", "Prices not at target – skipping");
            return Ok(());
        }
        let bought = self.bought_outcomes.entry(market_key.clone()).or_default();
        let do_up = up_ok && !bought.contains(&Outcome::Up);
        let do_down = down_ok && !bought.contains(&Outcome::Down);
        if !do_up && !do_down {
            logger::log("ENTER", "No new BUYs to place (already bought)");
            return Ok(());
        }
        let size = self.config.order_amount_token.max(MIN_SHARE_SIZE);
        let clob = self.clob.lock().await;
        if do_up {
            match clob.place_limit_order(&token_ids[0], "BUY", self.config.target_price_up, size).await {
                Ok(res) => {
                    if let Some(oid) = res.order_id() {
                        self.tracked_buys.insert(
                            oid.to_string(),
                            TrackedOrder {
                                token_id: token_ids[0].clone(),
                                outcome: Outcome::Up,
                                market_id: market.market_id.clone(),
                                market_key: market_key.clone(),
                                end_date: market.end_date.clone(),
                                size,
                            },
                        );
                        self.bought_outcomes.entry(market_key.clone()).or_default().insert(Outcome::Up);
                        logger::log("ORDER", &format!("BUY Up placed orderId={}", oid));
                    }
                }
                Err(e) => logger::err("ORDER", &format!("BUY Up failed: {}", e)),
            }
        }
        if do_down {
            match clob.place_limit_order(&token_ids[1], "BUY", self.config.target_price_down, size).await {
                Ok(res) => {
                    if let Some(oid) = res.order_id() {
                        self.tracked_buys.insert(
                            oid.to_string(),
                            TrackedOrder {
                                token_id: token_ids[1].clone(),
                                outcome: Outcome::Down,
                                market_id: market.market_id.clone(),
                                market_key: market_key.clone(),
                                end_date: market.end_date.clone(),
                                size,
                            },
                        );
                        self.bought_outcomes.entry(market_key.clone()).or_default().insert(Outcome::Down);
                        logger::log("ORDER", &format!("BUY Down placed orderId={}", oid));
                    }
                }
                Err(e) => logger::err("ORDER", &format!("BUY Down failed: {}", e)),
            }
        }
        drop(clob);
        self.monitored_markets.insert(market.market_id.clone(), market.end_date.clone());
        self.market_id_to_key.insert(market.market_id.clone(), market_key);
        self.once_mode_entered = true;
        logger::log("ENTER", "Market entered ✓");
        Ok(())
    }
}
