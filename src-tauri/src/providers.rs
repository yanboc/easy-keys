//! 提供商模板更新：从仓库 raw URL 拉取 providers.json，缓存到数据目录。
//!
//! 这是除测速外唯一的联网路径，仅由用户在设置页主动点击触发；
//! 只下载提供商模板（名称 / base_url / 模型相关元数据），不上传任何数据。

use crate::error::{AppError, AppResult};
use crate::models::{default_providers, ProviderTemplate};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// providers.json 的远端地址（仓库 main 分支）
const PROVIDERS_URL: &str =
    "https://raw.githubusercontent.com/yanboc/tokey/main/providers.json";

/// 编译期内置模板的版本（与仓库 providers.json 同步维护）
pub const BUILTIN_VERSION: &str = "2026-09-09";

/// providers.json 文件格式
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvidersFile {
    pub version: String,
    pub providers: Vec<ProviderTemplate>,
}

/// 设置页展示用：当前生效的模板版本与来源
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProvidersInfo {
    pub version: String,
    /// "builtin" / "cached"
    pub source: String,
    pub count: usize,
}

fn cached_path() -> AppResult<PathBuf> {
    Ok(crate::vault::app_data_dir()?.join("providers.json"))
}

/// 读取缓存的 providers.json（损坏/不存在返回 None，绝不报错）
fn read_cached() -> Option<ProvidersFile> {
    let path = cached_path().ok()?;
    let content = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

/// 校验模板文件：版本为日期形字符串、列表非空、每条都有 id 和 base_url
fn validate(file: &ProvidersFile) -> AppResult<()> {
    if file.version.trim().is_empty() {
        return Err(AppError::new("providers.json 缺少版本号"));
    }
    if file.providers.is_empty() {
        return Err(AppError::new("providers.json 中没有提供商"));
    }
    for p in &file.providers {
        if p.id.trim().is_empty() || p.default_base_url.trim().is_empty() {
            return Err(AppError::new("providers.json 中存在缺字段的提供商条目"));
        }
    }
    Ok(())
}

/// 当前生效的提供商模板：缓存版本新于内置则用缓存，否则用内置
pub fn effective_providers() -> Vec<ProviderTemplate> {
    if let Some(f) = read_cached() {
        if validate(&f).is_ok() && f.version.as_str() > BUILTIN_VERSION {
            return f.providers;
        }
    }
    default_providers()
}

/// 当前生效版本信息（供设置页展示）
pub fn info() -> ProvidersInfo {
    if let Some(f) = read_cached() {
        if validate(&f).is_ok() && f.version.as_str() > BUILTIN_VERSION {
            return ProvidersInfo {
                version: f.version.clone(),
                source: "cached".into(),
                count: f.providers.len(),
            };
        }
    }
    ProvidersInfo {
        version: BUILTIN_VERSION.into(),
        source: "builtin".into(),
        count: default_providers().len(),
    }
}

/// 联网拉取最新 providers.json 并缓存（10s 超时，禁重定向）
pub async fn update() -> AppResult<ProvidersInfo> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_millis(10_000))
        .build()
        .map_err(|e| AppError::new(format!("HTTP 客户端初始化失败: {e}")))?;
    let resp = client
        .get(PROVIDERS_URL)
        .send()
        .await
        .map_err(|e| AppError::new(format!("下载失败: {e}")))?;
    if !resp.status().is_success() {
        return Err(AppError::new(format!("下载失败: HTTP {}", resp.status())));
    }
    let file: ProvidersFile = resp
        .json()
        .await
        .map_err(|e| AppError::new(format!("providers.json 解析失败: {e}")))?;
    validate(&file)?;
    if file.version.as_str() <= BUILTIN_VERSION {
        // 远端不比内置新：不覆盖缓存，直接返回当前生效信息
        return Ok(info());
    }
    let path = cached_path()?;
    let json = serde_json::to_string_pretty(&file)?;
    std::fs::write(&path, json)?;
    Ok(info())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_rejects_empty() {
        let f = ProvidersFile { version: "".into(), providers: vec![] };
        assert!(validate(&f).is_err());
        let f = ProvidersFile { version: "2026-01-01".into(), providers: vec![] };
        assert!(validate(&f).is_err());
    }

    #[test]
    fn validate_accepts_builtin_shape() {
        let f = ProvidersFile {
            version: BUILTIN_VERSION.into(),
            providers: default_providers(),
        };
        assert!(validate(&f).is_ok());
    }

    #[test]
    fn version_compare_semantics() {
        // 日期字符串按字典序比较即正确
        assert!("2026-09-10" > BUILTIN_VERSION);
        assert!("2026-09-08" < BUILTIN_VERSION);
    }
}
