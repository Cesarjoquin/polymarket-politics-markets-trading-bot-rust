//! Configuration loaded from environment.

use anyhow::{Context, Result};

const DEFAULT_CLOB_HOST: &str = "https://clob.polymarket.com";
const DEFAULT_CHAIN_ID: u64 = 137;
const DEFAULT_GAMMA_HOST: &str = "https://gamma-api.polymarket.com";
const DEFAULT_TARGET_UP: &str = "0.45";
const DEFAULT_SELL_UP: &str = "0.55";
const DEFAULT_TARGET_DOWN: &str = "0.45";
const DEFAULT_SELL_DOWN: &str = "0.55";
const DEFAULT_ORDER_AMOUNT: &str = "5";
const DEFAULT_CHECK_INTERVAL_MS: u64 = 10_000;
const DEFAULT_SELL_DELAY_MS: u64 = 10_000;
const DEFAULT_MIN_SECONDS_TO_ENTER: u64 = 20;
const DEFAULT_MIN_SECONDS_BEFORE_EXPIRY: u64 = 299;
const DEFAULT_EXIT_BEFORE_CLOSE_SECONDS: u64 = 20;
const DEFAULT_AGGRESSIVE_EXIT_PRICE: f64 = 0.4;

#[derive(Clone, Debug)]
pub struct Config {
    pub private_key: String,
    pub clob_host: String,
    pub chain_id: u64,
    pub gamma_host: String,
    pub target_price_up: f64,
    pub sell_price_up: f64,
    pub target_price_down: f64,
    pub sell_price_down: f64,
    pub order_amount_token: f64,
    pub check_interval_ms: u64,
    pub sell_delay_ms: u64,
    pub min_seconds_to_enter: u64,
    pub min_seconds_before_expiry: u64,
    pub exit_before_close_seconds: u64,
    pub aggressive_exit_price: f64,
    pub trading_mode: TradingMode,
    pub log_file: Option<String>,
    pub funder_address: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TradingMode {
    Once,
    Continuous,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        let private_key = std::env::var("PRIVATE_KEY")
            .context("PRIVATE_KEY is required")?;

        let clob_host = std::env::var("CLOB_HOST").unwrap_or_else(|_| DEFAULT_CLOB_HOST.to_string());
        let chain_id: u64 = std::env::var("CHAIN_ID")
            .unwrap_or_else(|_| DEFAULT_CHAIN_ID.to_string())
            .parse()
            .context("CHAIN_ID must be a positive integer")?;
        let gamma_host = std::env::var("GAMMA_HOST").unwrap_or_else(|_| DEFAULT_GAMMA_HOST.to_string());

        let target_price_up: f64 = std::env::var("TARGET_PRICE_UP")
            .or_else(|_| std::env::var("TARGET_PRICE"))
            .unwrap_or_else(|_| DEFAULT_TARGET_UP.to_string())
            .parse()
            .context("TARGET_PRICE_UP must be a number in (0,1)")?;
        let sell_price_up: f64 = std::env::var("SELL_PRICE_UP")
            .or_else(|_| std::env::var("SELL_PRICE"))
            .unwrap_or_else(|_| DEFAULT_SELL_UP.to_string())
            .parse()
            .context("SELL_PRICE_UP must be a number in (0,1)")?;
        let target_price_down: f64 = std::env::var("TARGET_PRICE_DOWN")
            .or_else(|_| std::env::var("TARGET_PRICE"))
            .unwrap_or_else(|_| DEFAULT_TARGET_DOWN.to_string())
            .parse()
            .context("TARGET_PRICE_DOWN must be a number in (0,1)")?;
        let sell_price_down: f64 = std::env::var("SELL_PRICE_DOWN")
            .or_else(|_| std::env::var("SELL_PRICE"))
            .unwrap_or_else(|_| DEFAULT_SELL_DOWN.to_string())
            .parse()
            .context("SELL_PRICE_DOWN must be a number in (0,1)")?;

        let order_amount_token: f64 = std::env::var("ORDER_AMOUNT_TOKEN")
            .unwrap_or_else(|_| DEFAULT_ORDER_AMOUNT.to_string())
            .parse()
            .context("ORDER_AMOUNT_TOKEN must be a number >= 5")?;
        let check_interval_ms: u64 = std::env::var("CHECK_INTERVAL")
            .unwrap_or_else(|_| DEFAULT_CHECK_INTERVAL_MS.to_string())
            .parse()
            .context("CHECK_INTERVAL must be a positive integer (ms)")?;
        let sell_delay_ms: u64 = std::env::var("SELL_DELAY_MS")
            .unwrap_or_else(|_| DEFAULT_SELL_DELAY_MS.to_string())
            .parse()
            .context("SELL_DELAY_MS must be a non-negative integer")?;
        let min_seconds_to_enter: u64 = std::env::var("MIN_SECONDS_TO_ENTER")
            .unwrap_or_else(|_| DEFAULT_MIN_SECONDS_TO_ENTER.to_string())
            .parse()
            .unwrap_or(DEFAULT_MIN_SECONDS_TO_ENTER);
        let min_seconds_before_expiry: u64 = std::env::var("MIN_SECONDS_BEFORE_EXPIRY")
            .unwrap_or_else(|_| DEFAULT_MIN_SECONDS_BEFORE_EXPIRY.to_string())
            .parse()
            .unwrap_or(DEFAULT_MIN_SECONDS_BEFORE_EXPIRY);
        let exit_before_close_seconds: u64 = std::env::var("EXIT_BEFORE_CLOSE_SECONDS")
            .unwrap_or_else(|_| DEFAULT_EXIT_BEFORE_CLOSE_SECONDS.to_string())
            .parse()
            .unwrap_or(DEFAULT_EXIT_BEFORE_CLOSE_SECONDS);
        let aggressive_exit_price: f64 = std::env::var("AGGRESSIVE_EXIT_PRICE")
            .unwrap_or_else(|_| DEFAULT_AGGRESSIVE_EXIT_PRICE.to_string())
            .parse()
            .unwrap_or(DEFAULT_AGGRESSIVE_EXIT_PRICE);

        let trading_mode = match std::env::var("TRADING_MODE").unwrap_or_else(|_| "continuous".into()).to_lowercase().as_str() {
            "once" => TradingMode::Once,
            _ => TradingMode::Continuous,
        };
        let log_file = std::env::var("LOG_FILE").ok();
        let funder_address = std::env::var("FUNDER_ADDRESS").ok();

        let config = Self {
            private_key,
            clob_host,
            chain_id,
            gamma_host,
            target_price_up,
            sell_price_up,
            target_price_down,
            sell_price_down,
            order_amount_token,
            check_interval_ms,
            sell_delay_ms,
            min_seconds_to_enter,
            min_seconds_before_expiry,
            exit_before_close_seconds,
            aggressive_exit_price,
            trading_mode,
            log_file,
            funder_address,
        };

        config.validate()?;
        Ok(config)
    }

    fn validate(&self) -> Result<()> {
        let in_01 = |p: f64, name: &str| {
            if !p.is_finite() || p <= 0.0 || p >= 1.0 {
                anyhow::bail!("{} must be in (0, 1), got {}", name, p);
            }
            Ok(())
        };
        in_01(self.target_price_up, "TARGET_PRICE_UP")?;
        in_01(self.sell_price_up, "SELL_PRICE_UP")?;
        in_01(self.target_price_down, "TARGET_PRICE_DOWN")?;
        in_01(self.sell_price_down, "SELL_PRICE_DOWN")?;
        if self.target_price_up >= self.sell_price_up {
            anyhow::bail!(
                "TARGET_PRICE_UP ({}) must be strictly less than SELL_PRICE_UP ({})",
                self.target_price_up,
                self.sell_price_up
            );
        }
        if self.target_price_down >= self.sell_price_down {
            anyhow::bail!(
                "TARGET_PRICE_DOWN ({}) must be strictly less than SELL_PRICE_DOWN ({})",
                self.target_price_down,
                self.sell_price_down
            );
        }
        if self.order_amount_token < 5.0 {
            anyhow::bail!("ORDER_AMOUNT_TOKEN must be >= 5 (min share size), got {}", self.order_amount_token);
        }
        if self.check_interval_ms < 500 {
            anyhow::bail!("CHECK_INTERVAL must be >= 500 ms, got {}", self.check_interval_ms);
        }
        if self.aggressive_exit_price <= 0.0 || self.aggressive_exit_price >= 1.0 {
            anyhow::bail!("AGGRESSIVE_EXIT_PRICE must be in (0, 1), got {}", self.aggressive_exit_price);
        }
        Ok(())
    }

    pub fn stop_loss_price_up(&self) -> f64 {
        self.target_price_up * 0.67
    }

    pub fn stop_loss_price_down(&self) -> f64 {
        self.target_price_down * 0.67
    }
}
