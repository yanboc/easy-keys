use crate::error::{AppError, AppResult};
use crate::models::{ApiKeyRecord, FetchModelsResult, SpeedTestResult};
use reqwest::{Client, RequestBuilder};
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

/// 按认证方式给请求附加凭据（测速与获取模型共用）
fn apply_auth(req: RequestBuilder, auth_type: &str, api_key: &str) -> RequestBuilder {
    match auth_type {
        "x-api-key" => req
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        "query" => req.query(&[("key", api_key)]),
        "none" => req, // 无认证（本地 Ollama 等）
        _ => req.bearer_auth(api_key),
    }
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
    let req = apply_auth(client.get(&url), &record.auth_type, &record.api_key);

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

/// 「测速并获取模型」：GET {base_url}/models，解析 OpenAI 兼容响应。
/// 与测速同一安全约束：禁重定向、全局超时、仅用户主动点击触发；
/// 单次请求同时充当连通性测速，返回耗时毫秒数。
pub async fn fetch_models(
    base_url: &str,
    auth_type: &str,
    api_key: &str,
    timeout_ms: u64,
) -> AppResult<FetchModelsResult> {
    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err(AppError::new("Base URL 为空"));
    }
    let client = build_client(timeout_ms)?;
    let url = format!("{base}/models");
    let req = apply_auth(client.get(&url), auth_type, api_key);

    let started = Instant::now();
    let resp = req
        .send()
        .await
        .map_err(|e| AppError::new(normalize_network_error(&e)))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(AppError::new(format!("HTTP {}", status.as_u16())));
    }
    let body = resp
        .text()
        .await
        .map_err(|e| AppError::new(format!("读取响应失败: {e}")))?;
    let latency_ms = started.elapsed().as_millis() as u64;
    let models = parse_models_response(&body)?;
    Ok(FetchModelsResult { models, latency_ms })
}

/// 解析 OpenAI 兼容的 /models 响应：{"data":[{"id":"..."},...]}
/// 非字符串 / 缺 id 的条目跳过；缺少 data 数组或非 JSON 视为错误。
pub fn parse_models_response(body: &str) -> AppResult<Vec<String>> {
    let value: serde_json::Value =
        serde_json::from_str(body).map_err(|e| AppError::new(format!("响应不是合法 JSON: {e}")))?;
    let data = value
        .get("data")
        .and_then(|d| d.as_array())
        .ok_or_else(|| AppError::new("响应缺少 data 数组"))?;
    let models = data
        .iter()
        .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(String::from))
        .collect();
    Ok(models)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_openai_compatible_response() {
        let body = r#"{"object":"list","data":[{"id":"gpt-4o"},{"id":"gpt-4o-mini"}]}"#;
        let models = parse_models_response(body).unwrap();
        assert_eq!(models, vec!["gpt-4o", "gpt-4o-mini"]);
    }

    #[test]
    fn parse_empty_data_returns_empty() {
        let models = parse_models_response(r#"{"data":[]}"#).unwrap();
        assert!(models.is_empty());
    }

    #[test]
    fn parse_non_json_is_error() {
        assert!(parse_models_response("not json").is_err());
    }

    #[test]
    fn parse_missing_data_is_error() {
        assert!(parse_models_response(r#"{"object":"list"}"#).is_err());
    }

    #[test]
    fn parse_skips_entries_without_string_id() {
        let body = r#"{"data":[{"id":"a"},{"name":"b"},123]}"#;
        assert_eq!(parse_models_response(body).unwrap(), vec!["a"]);
    }
}
