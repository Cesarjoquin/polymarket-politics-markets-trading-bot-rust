//! Polymarket Bitcoin 5-Minute Trading Bot (Rust).
//!
//! Trades BTC Up or Down 5-minute markets: both-sided BUY when price at target,
//! SELL when price >= sell target or stop-loss when price <= 67% of target.

mod bot;
mod clob;
mod config;
mod gamma;
mod logger;
mod types;

use anyhow::Result;
use config::Config;
use tokio::signal;

#[tokio::main]
async fn main() -> Result<()> {
    let config = Config::from_env()?;
    let mut bot = bot::Bot::new(config).await?;

    tokio::spawn(async move {
        let _ = signal::ctrl_c().await;
        logger::log("SIG", "Shutting down bot gracefully...");
        std::process::exit(0);
    });

    bot.run().await?;
    Ok(())
}
