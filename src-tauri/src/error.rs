use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct AppError {
    pub message: String,
}

impl AppError {
    pub fn new(msg: impl Into<String>) -> Self {
        Self {
            message: msg.into(),
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::new(format!("IO 错误: {e}"))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::new(format!("JSON 解析错误: {e}"))
    }
}

impl From<argon2::password_hash::Error> for AppError {
    fn from(e: argon2::password_hash::Error) -> Self {
        Self::new(format!("密码哈希错误: {e}"))
    }
}

impl From<aes_gcm::Error> for AppError {
    fn from(e: aes_gcm::Error) -> Self {
        Self::new(format!("加密解密错误: {e}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
