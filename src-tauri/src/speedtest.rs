use crate::error::{AppError, AppResult};
use crate::models::{ApiKeyRecord, SpeedTestResult};
use reqwest::Client;
use std::time::Instant;

/// 默认超时（毫秒）
pub const DEFAULT_TIMEOUT_MS: u64 = 10_000;

/// 为单个密钥构造测速客户端：
/// - 禁用自动重定向（防止密钥被转发到第三方）
/// - 只允许 http/https
/// - 全局超时
fn build_client(timeout_ms: u64) -> AppResult<Client> {
    let client = Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_millis(timeout_ms))
        .build()
        .map_err(|e| AppError::new(format!("HTTP 客户端初始化失败: {e}")))?;
    Ok(client)
}

/// 对单条记录测速
pub async fn test_one(record: &ApiKeyRecord, timeout_ms: u64) -> SpeedTestResult {
    let mut result = SpeedTestResult {
        id: record.id.clone(),
        name: record.name.clone(),
        ok: false,
        latency_ms: None,
        status_code: None,
        error: None,
    };

    let client = match build_client(timeout_ms) {
        Ok(c) => c,
        Err(e) => {
            result.error = Some(e.message);
            return result;
        }
    };

    // 规范化 base_url（去掉结尾斜杠），拼上测速路径
    let base = record.base_url.trim_end_matches('/').to_string();
    let test_path = match record.provider.as_str() {
        "anthropic" => "/v1/models",
        "gemini" => "/v1beta/models",
        "ollama" => "/api/tags",
        // OpenAI 兼容 / 自定义
        _ => "/models",
    };
    let url = format!("{base}{test_path}");

    // 构造请求
    let mut req = client.get(&url);
    match record.auth_type.as_str() {
        "x-api-key" => {
            req = req
                .header("x-api-key", &record.api_key)
                .header("anthropic-version", "2023-06-01");
        }
        "query" => {
            req = req.query(&[("key", &record.api_key)]);
        }
        "none" => { /* 无认证（本地 Ollama 等） */ }
        _ => {
            req = req.bearer_auth(&record.api_key);
        }
    }

    let started = Instant::now();
    match req.send().await {
        Ok(resp) => {
            let status = resp.status();
            result.status_code = Some(status.as_u16());
            result.latency_ms = Some(started.elapsed().as_millis() as u64);
            // 2xx/3xx 视为连通
            result.ok = status.is_success() || status.is_redirection();
            if !result.ok {
                result.error = Some(format!("HTTP {}", status.as_u16()));
            }
        }
        Err(e) => {
            result.latency_ms = Some(started.elapsed().as_millis() as u64);
            result.error = Some(normalize_network_error(&e));
        }
    }

    result
}

/// 把 reqwest 错误翻译成用户可读信息
fn normalize_network_error(e: &reqwest::Error) -> String {
    if e.is_timeout() {
        return "请求超时".into();
    }
    if e.is_connect() {
        return "连接失败（网络不可达或被墙）".into();
    }
    if e.is_redirect() {
        return "检测到重定向（已禁用，防止密钥泄露）".into();
    }
    if e.is_builder() {
        return format!("请求构造失败: {e}");
    }
    e.to_string()
}

/// 并发测速
pub async fn test_many(records: &[ApiKeyRecord], timeout_ms: u64) -> Vec<SpeedTestResult> {
    let mut tasks = Vec::new();
    for record in records {
        tasks.push(test_one(record, timeout_ms));
    }
    let mut results = futures_util::future::join_all(tasks).await;
    // 失败排后，成功按延迟升序
    results.sort_by_key(|r| (r.ok, r.latency_ms.unwrap_or(u64::MAX)));
    results
}
