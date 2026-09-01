use serde::{Deserialize, Serialize};

/// 单条 API Key 记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyRecord {
    pub id: String,
    /// 显示名称，如 "我的 OpenAI 主号"
    pub name: String,
    /// provider 标识，如 "openai"
    pub provider: String,
    /// 请求 base url，如 "https://api.openai.com/v1"
    pub base_url: String,
    /// 认证方式：bearer / x-api-key / query
    pub auth_type: String,
    /// API Key 明文
    pub api_key: String,
    /// 可选的模型列表
    pub models: Vec<String>,
    /// 备注
    pub notes: String,
    /// 环境变量名（如 OPENAI_API_KEY），空则自动生成
    pub env_name: String,
    pub created_at: i64,
    pub updated_at: i64,
}

impl ApiKeyRecord {
    /// 生成环境变量名：优先自定义，否则 {PROVIDER_UPPER}_API_KEY
    pub fn effective_env_name(&self) -> String {
        let trimmed = self.env_name.trim().to_string();
        if !trimmed.is_empty() {
            return sanitize_env_name(&trimmed);
        }
        let provider = self.provider.trim().to_uppercase();
        let provider = provider.replace(['-', ' ', '.'], "_");
        format!("{}_API_KEY", provider)
    }
}

/// 去掉环境变量名中的非法字符
pub fn sanitize_env_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' })
        .collect()
}

/// 内置 provider 模板
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTemplate {
    pub id: String,
    pub label: String,
    pub default_base_url: String,
    /// 测速相对路径（拼在 base_url 后）
    pub speedtest_path: String,
    pub auth_type: String,
    pub default_env_name: String,
    pub hint: String,
}

/// 内置 provider 模板列表
pub fn default_providers() -> Vec<ProviderTemplate> {
    vec![
        ProviderTemplate {
            id: "openai".into(),
            label: "OpenAI".into(),
            default_base_url: "https://api.openai.com/v1".into(),
            speedtest_path: "/models".into(),
            auth_type: "bearer".into(),
            default_env_name: "OPENAI_API_KEY".into(),
            hint: "Authorization: Bearer".into(),
        },
        ProviderTemplate {
            id: "anthropic".into(),
            label: "Anthropic".into(),
            default_base_url: "https://api.anthropic.com".into(),
            speedtest_path: "/v1/models".into(),
            auth_type: "x-api-key".into(),
            default_env_name: "ANTHROPIC_API_KEY".into(),
            hint: "x-api-key + anthropic-version".into(),
        },
        ProviderTemplate {
            id: "gemini".into(),
            label: "Google Gemini".into(),
            default_base_url: "https://generativelanguage.googleapis.com".into(),
            speedtest_path: "/v1beta/models".into(),
            auth_type: "query".into(),
            default_env_name: "GEMINI_API_KEY".into(),
            hint: "?key=...".into(),
        },
        ProviderTemplate {
            id: "deepseek".into(),
            label: "DeepSeek".into(),
            default_base_url: "https://api.deepseek.com".into(),
            speedtest_path: "/models".into(),
            auth_type: "bearer".into(),
            default_env_name: "DEEPSEEK_API_KEY".into(),
            hint: "OpenAI 兼容".into(),
        },
        ProviderTemplate {
            id: "moonshot".into(),
            label: "Moonshot (Kimi)".into(),
            default_base_url: "https://api.moonshot.cn/v1".into(),
            speedtest_path: "/models".into(),
            auth_type: "bearer".into(),
            default_env_name: "MOONSHOT_API_KEY".into(),
            hint: "OpenAI 兼容".into(),
        },
        ProviderTemplate {
            id: "groq".into(),
            label: "Groq".into(),
            default_base_url: "https://api.groq.com/openai/v1".into(),
            speedtest_path: "/models".into(),
            auth_type: "bearer".into(),
            default_env_name: "GROQ_API_KEY".into(),
            hint: "OpenAI 兼容".into(),
        },
        ProviderTemplate {
            id: "ollama".into(),
            label: "Ollama (本地)".into(),
            default_base_url: "http://localhost:11434".into(),
            speedtest_path: "/api/tags".into(),
            auth_type: "none".into(),
            default_env_name: "OLLAMA_API_KEY".into(),
            hint: "本地模型，无需 Key".into(),
        },
        ProviderTemplate {
            id: "custom".into(),
            label: "自定义 (OpenAI 兼容)".into(),
            default_base_url: "https://your-endpoint.example.com/v1".into(),
            speedtest_path: "/models".into(),
            auth_type: "bearer".into(),
            default_env_name: "CUSTOM_API_KEY".into(),
            hint: "任意 OpenAI 兼容端点".into(),
        },
    ]
}

/// 加密保险库文件结构（落盘格式）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFile {
    /// 格式版本
    pub version: u32,
    /// Argon2id 参数 + salt
    pub kdf: KdfParams,
    /// AES-256-GCM nonce
    pub nonce: String,
    /// 密文（base64），内部是 RecordsFile JSON
    pub ciphertext: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KdfParams {
    pub algo: String,
    pub m_cost: u32,
    pub t_cost: u32,
    pub p_cost: u32,
    /// base64 salt
    pub salt: String,
}

/// 明文记录容器（加密前的载荷）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordsFile {
    pub version: u32,
    pub records: Vec<ApiKeyRecord>,
}

/// 测速结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeedTestResult {
    pub id: String,
    pub name: String,
    pub ok: bool,
    /// 总耗时毫秒
    pub latency_ms: Option<u64>,
    pub status_code: Option<u16>,
    pub error: Option<String>,
}

/// 环境变量写入结果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvWriteResult {
    pub written: Vec<String>,
    pub skipped: Vec<String>,
    pub target_file: Option<String>,
    pub instructions: Option<String>,
}
