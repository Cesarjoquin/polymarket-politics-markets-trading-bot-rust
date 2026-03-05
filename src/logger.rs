//! Logging to console and optional file; per-market log files.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::sync::Mutex;

static LOG_FILE: Mutex<Option<std::fs::File>> = Mutex::new(None);
const MARKET_LOGS_DIR: &str = "logs/markets";

pub fn init_global_log_file(path: Option<&str>) {
    if let Some(p) = path {
        if let Some(dir) = Path::new(p).parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(f) = OpenOptions::new().create(true).append(true).open(p) {
            *LOG_FILE.lock().unwrap() = Some(f);
        }
    }
}

pub fn ts() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub fn log(section: &str, msg: &str) {
    let line = format!("[{}] [{}] {}", ts(), section, msg);
    println!("{}", line);
    if let Ok(mut g) = LOG_FILE.lock() {
        if let Some(f) = g.as_mut() {
            let _ = writeln!(f, "{}", line);
        }
    }
}

pub fn warn(section: &str, msg: &str) {
    let line = format!("[{}] [{}] ⚠️  {}", ts(), section, msg);
    eprintln!("{}", line);
    if let Ok(mut g) = LOG_FILE.lock() {
        if let Some(f) = g.as_mut() {
            let _ = writeln!(f, "{}", line);
        }
    }
}

pub fn err(section: &str, msg: &str) {
    let line = format!("[{}] [{}] ❌ {}", ts(), section, msg);
    eprintln!("{}", line);
    if let Ok(mut g) = LOG_FILE.lock() {
        if let Some(f) = g.as_mut() {
            let _ = writeln!(f, "{}", line);
        }
    }
}

pub fn divider() {
    let line = "─".repeat(70);
    println!("{}", line);
    if let Ok(mut g) = LOG_FILE.lock() {
        if let Some(f) = g.as_mut() {
            let _ = writeln!(f, "{}", line);
        }
    }
}

pub fn market_key_to_safe_filename(market_key: &str) -> String {
    market_key
        .replace('|', "_")
        .chars()
        .map(|c| if "/:?*\"<>".contains(c) { '_' } else { c })
        .take(120)
        .collect()
}

pub fn get_market_log_path(market_key: &str) -> std::path::PathBuf {
    let dir = std::path::Path::new(MARKET_LOGS_DIR);
    let _ = std::fs::create_dir_all(dir);
    dir.join(format!("{}.log", market_key_to_safe_filename(market_key)))
}

pub fn log_market(market_key: &str, section: &str, msg: &str) {
    let line = format!("[{}] [{}] [{}] {}", ts(), section, market_key, msg);
    println!("{}", line);
    let path = get_market_log_path(market_key);
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "[{}] [INFO] [{}] {}", ts(), section, msg);
    }
}
