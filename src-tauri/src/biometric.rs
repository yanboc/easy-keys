//! 生物识别解锁：主密码托管于操作系统安全存储，应用自身不落盘。
//!
//! - macOS：主密码存入 Keychain 通用密码项（WhenUnlockedThisDeviceOnly），
//!   读取前先经 LAContext 系统身份验证（DeviceOwnerAuthentication：Touch ID，
//!   可回退登录密码）。注意不能用 kSecAttrAccessControl 绑定钥匙串项——
//!   它需要 keychain-access-groups 授权，ad-hoc 签名携带该授权会被系统
//!   直接杀进程（Killed: 9），因此身份验证做在应用侧（LAContext），
//!   钥匙串项本身仅创建者应用可读（由系统按代码签名约束）。
//! - Windows：主密码存入 Credential Locker（PasswordVault），
//!   读取前先经 UserConsentVerifier.RequestVerificationAsync（Windows Hello，
//!   自动涵盖指纹 / 面容 / PIN）验证。
//! - Linux 等其他平台：不可用，前端隐藏入口。
//!
//! 存在性检查一律走非交互路径（不带 kSecReturnData 的元数据查询 /
//! Credential Locker 直接查询），不会触发生物识别弹窗。

use crate::error::AppResult;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BiometricStatus {
    pub available: bool,
    pub enabled: bool,
    pub label: String,
}

// ---------- 纯逻辑（跨平台可测） ----------

// SecBase.h 错误码（本地定义以保持映射逻辑跨平台可测；
// macOS 下有测试断言与 objc2_security 常量一致）
#[cfg(any(target_os = "macos", test))]
const ERR_SEC_USER_CANCELED: i32 = -128;
#[cfg(any(target_os = "macos", test))]
const ERR_SEC_AUTH_FAILED: i32 = -25293;
#[cfg(any(target_os = "macos", test))]
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;
#[cfg(any(target_os = "macos", test))]
const ERR_SEC_INTERACTION_NOT_ALLOWED: i32 = -25308;
#[cfg(any(target_os = "macos", test))]
const ERR_SEC_MISSING_ENTITLEMENT: i32 = -34018;

/// macOS Keychain OSStatus → 用户可读信息
#[cfg(any(target_os = "macos", test))]
fn sec_error_message(code: i32) -> String {
    match code {
        ERR_SEC_USER_CANCELED => "已取消身份验证".to_string(),
        ERR_SEC_AUTH_FAILED => "生物识别验证失败".to_string(),
        ERR_SEC_ITEM_NOT_FOUND => "尚未启用生物识别解锁".to_string(),
        ERR_SEC_INTERACTION_NOT_ALLOWED => "系统当前不允许进行身份验证".to_string(),
        ERR_SEC_MISSING_ENTITLEMENT => "缺少钥匙串访问权限（应用签名问题）".to_string(),
        _ => format!("系统安全存储错误（{code}）"),
    }
}

// Windows UserConsentVerificationResult 取值
#[cfg(any(target_os = "windows", test))]
const CONSENT_DEVICE_NOT_PRESENT: i32 = 1;
#[cfg(any(target_os = "windows", test))]
const CONSENT_NOT_CONFIGURED: i32 = 2;
#[cfg(any(target_os = "windows", test))]
const CONSENT_DISABLED_BY_POLICY: i32 = 3;
#[cfg(any(target_os = "windows", test))]
const CONSENT_DEVICE_BUSY: i32 = 4;
#[cfg(any(target_os = "windows", test))]
const CONSENT_RETRIES_EXHAUSTED: i32 = 5;
#[cfg(any(target_os = "windows", test))]
const CONSENT_CANCELED: i32 = 6;

/// Windows Hello 验证结果 → 用户可读信息
#[cfg(any(target_os = "windows", test))]
fn consent_error_message(code: i32) -> String {
    match code {
        CONSENT_DEVICE_NOT_PRESENT => "设备不支持生物识别".to_string(),
        CONSENT_NOT_CONFIGURED => "尚未配置 Windows Hello".to_string(),
        CONSENT_DISABLED_BY_POLICY => "Windows Hello 已被策略禁用".to_string(),
        CONSENT_DEVICE_BUSY => "设备忙，请稍后重试".to_string(),
        CONSENT_RETRIES_EXHAUSTED => "验证失败次数过多，请稍后重试".to_string(),
        CONSENT_CANCELED => "已取消身份验证".to_string(),
        _ => format!("Windows Hello 验证失败（{code}）"),
    }
}

// ---------- macOS：LAContext 系统验证 + 普通 Keychain 项 ----------

#[cfg(target_os = "macos")]
mod imp {
    use super::{sec_error_message, BiometricStatus};
    use crate::error::{AppError, AppResult};
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_core_foundation::{
        kCFBooleanTrue, CFData, CFDictionary, CFRetained, CFString, CFType,
    };
    use objc2_foundation::{NSError, NSString};
    use objc2_local_authentication::{LAContext, LAPolicy};
    use objc2_security::{
        errSecItemNotFound, errSecSuccess, kSecAttrAccessible, kSecAttrAccount,
        kSecAttrAccessibleWhenUnlockedThisDeviceOnly, kSecAttrService, kSecClass,
        kSecClassGenericPassword, kSecReturnData, kSecValueData, SecItemAdd,
        SecItemCopyMatching, SecItemDelete,
    };
    use std::ptr::NonNull;
    use std::time::Duration;

    const SERVICE: &str = "com.easykeys.app";
    const ACCOUNT: &str = "vault-master";
    /// 系统验证弹窗的说明文字（用户可见）
    const AUTH_REASON: &str = "解锁 Tokey 保险库";

    /// SecItem* 函数接受未参数化的 CFDictionary（Opaque 键值）
    type Query = CFRetained<CFDictionary>;

    /// 读取 SecItem 键常量（extern static，读取需 unsafe；拷出的引用是 'static）
    unsafe fn sec_keys() -> (
        &'static CFString,
        &'static CFString,
        &'static CFString,
        &'static CFString,
    ) {
        (kSecClass, kSecAttrService, kSecAttrAccount, kSecClassGenericPassword)
    }

    fn build_query(keys: &[&CFString], values: &[&CFType]) -> Query {
        let typed = CFDictionary::from_slices(keys, values);
        // 键值均为合法 CFType，擦除泛型参数安全
        unsafe { CFRetained::cast_unchecked(typed) }
    }

    /// 定位托管项的基础查询（class + service + account）
    fn base_query() -> Query {
        let (k_class, k_service, k_account, v_class) = unsafe { sec_keys() };
        let service = CFString::from_static_str(SERVICE);
        let account = CFString::from_static_str(ACCOUNT);
        build_query(
            &[k_class, k_service, k_account],
            &[v_class, &service, &account],
        )
    }

    fn can_evaluate(policy: LAPolicy) -> bool {
        let ctx = unsafe { LAContext::new() };
        unsafe { ctx.canEvaluatePolicy_error(policy) }.is_ok()
    }

    /// 生物识别 / 系统密码验证是否可用。DeviceOwnerAuthentication 涵盖
    /// Touch ID，无 Touch ID 的机器回退登录密码（macOS 的“PIN”等价物）。
    fn is_available() -> bool {
        can_evaluate(LAPolicy::DeviceOwnerAuthentication)
    }

    /// 托管项是否存在。不带 kSecReturnData 的查询只探测元数据，不弹窗。
    pub fn is_enabled() -> bool {
        let status = unsafe { SecItemCopyMatching(&base_query(), std::ptr::null_mut()) };
        status == errSecSuccess
    }

    pub fn status() -> BiometricStatus {
        let available = is_available();
        let label = if can_evaluate(LAPolicy::DeviceOwnerAuthenticationWithBiometrics) {
            "Touch ID"
        } else {
            "登录密码"
        };
        BiometricStatus {
            available,
            enabled: available && is_enabled(),
            label: label.to_string(),
        }
    }

    /// 写入 / 覆盖托管项：普通通用密码项（ThisDeviceOnly，不随备份迁移），
    /// 访问范围由系统按应用签名约束；身份验证在读取前由 LAContext 完成。
    pub fn enable(password: &str) -> AppResult<()> {
        let (k_class, k_service, k_account, v_class) = unsafe { sec_keys() };
        let k_accessible = unsafe { kSecAttrAccessible };
        let k_value = unsafe { kSecValueData };
        let accessible: &CFType = unsafe { kSecAttrAccessibleWhenUnlockedThisDeviceOnly };

        // 覆盖式启用：先删旧项（不存在不算错误）
        let status = unsafe { SecItemDelete(&base_query()) };
        if status != errSecSuccess && status != errSecItemNotFound {
            return Err(AppError::new(sec_error_message(status)));
        }

        let service = CFString::from_static_str(SERVICE);
        let account = CFString::from_static_str(ACCOUNT);
        let secret = CFData::from_bytes(password.as_bytes());
        let query = build_query(
            &[k_class, k_service, k_account, k_accessible, k_value],
            &[v_class, &service, &account, accessible, &secret],
        );
        let status = unsafe { SecItemAdd(&query, std::ptr::null_mut()) };
        if status != errSecSuccess {
            return Err(AppError::new(sec_error_message(status)));
        }
        Ok(())
    }

    /// 同步执行系统身份验证（Touch ID，可回退登录密码）。
    /// evaluatePolicy 的回调由系统在内部队列触发，用 channel 阻塞等待。
    fn authenticate() -> AppResult<()> {
        let ctx = unsafe { LAContext::new() };
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let reason = NSString::from_str(AUTH_REASON);
        let block = RcBlock::new(move |success: Bool, err: *mut NSError| {
            let result = if success.as_bool() {
                Ok(())
            } else {
                // LAError 的用户可读描述（如“已取消”），取不到则用通用文案
                let msg = unsafe { err.as_ref() }
                    .map(|e| e.localizedDescription().to_string())
                    .unwrap_or_else(|| "身份验证失败".to_string());
                Err(msg)
            };
            let _ = tx.send(result);
        });
        unsafe {
            ctx.evaluatePolicy_localizedReason_reply(
                LAPolicy::DeviceOwnerAuthentication,
                &reason,
                &block,
            );
        }
        // 兜底超时：回调万一丢失，命令线程不能永久挂起
        rx.recv_timeout(Duration::from_secs(120))
            .map_err(|_| AppError::new("身份验证超时"))?
            .map_err(AppError::new)
    }

    /// 先经系统身份验证（Touch ID / 登录密码），再读取托管的主密码。
    /// 密码不出 Rust 层。
    pub fn read_password() -> AppResult<String> {
        authenticate()?;
        let (k_class, k_service, k_account, v_class) = unsafe { sec_keys() };
        let k_return_data = unsafe { kSecReturnData };
        let yes: &CFType = unsafe { kCFBooleanTrue }.expect("kCFBooleanTrue 不可用");
        let service = CFString::from_static_str(SERVICE);
        let account = CFString::from_static_str(ACCOUNT);
        let query = build_query(
            &[k_class, k_service, k_account, k_return_data],
            &[v_class, &service, &account, yes],
        );
        let mut result: *const CFType = std::ptr::null();
        let status = unsafe { SecItemCopyMatching(&query, &mut result) };
        if status != errSecSuccess {
            return Err(AppError::new(sec_error_message(status)));
        }
        let ptr = NonNull::new(result as *mut CFData)
            .ok_or_else(|| AppError::new("读取托管主密码失败"))?;
        // Copy 语义：结果由我们持有，from_raw 接管所有权
        let data = unsafe { CFRetained::from_raw(ptr) };
        String::from_utf8(data.to_vec()).map_err(|_| AppError::new("托管主密码数据损坏"))
    }

    pub fn disable() -> AppResult<()> {
        let status = unsafe { SecItemDelete(&base_query()) };
        if status != errSecSuccess && status != errSecItemNotFound {
            return Err(AppError::new(sec_error_message(status)));
        }
        Ok(())
    }
}

// ---------- Windows：Credential Locker + Windows Hello ----------

#[cfg(target_os = "windows")]
mod imp {
    use super::{consent_error_message, BiometricStatus};
    use crate::error::{AppError, AppResult};
    use windows::core::HSTRING;
    use windows::Security::Credentials::UI::{
        UserConsentVerifier, UserConsentVerifierAvailability, UserConsentVerificationResult,
    };
    use windows::Security::Credentials::{PasswordCredential, PasswordVault};
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    const RESOURCE: &str = "easy-keys";
    const USER_NAME: &str = "vault-master";

    /// Tauri 命令运行在线程池上，线程未必初始化过 COM 单元；
    /// RoInitialize 已初始化时返回错误码，忽略即可。
    fn ensure_ro_initialized() {
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
    }

    fn vault() -> AppResult<PasswordVault> {
        PasswordVault::new().map_err(|e| AppError::new(format!("无法访问凭据锁：{e}")))
    }

    fn resource() -> HSTRING {
        HSTRING::from(RESOURCE)
    }

    fn user_name() -> HSTRING {
        HSTRING::from(USER_NAME)
    }

    fn is_available() -> bool {
        ensure_ro_initialized();
        UserConsentVerifier::CheckAvailabilityAsync()
            .and_then(|op| op.get())
            .map(|a| a == UserConsentVerifierAvailability::Available)
            .unwrap_or(false)
    }

    /// 托管项是否存在。Credential Locker 查询不触发 Windows Hello 弹窗。
    pub fn is_enabled() -> bool {
        ensure_ro_initialized();
        PasswordVault::new()
            .and_then(|v| v.Retrieve(&resource(), &user_name()))
            .is_ok()
    }

    pub fn status() -> BiometricStatus {
        let available = is_available();
        BiometricStatus {
            available,
            enabled: available && is_enabled(),
            label: "Windows Hello".to_string(),
        }
    }

    /// 写入 / 覆盖托管项（Add 会替换同名 resource+user 的既有凭据）。
    pub fn enable(password: &str) -> AppResult<()> {
        ensure_ro_initialized();
        let cred = PasswordCredential::CreatePasswordCredential(
            &resource(),
            &user_name(),
            &HSTRING::from(password),
        )
        .map_err(|e| AppError::new(format!("无法创建凭据：{e}")))?;
        vault()?
            .Add(&cred)
            .map_err(|e| AppError::new(format!("无法写入凭据锁：{e}")))?;
        Ok(())
    }

    /// 先经 Windows Hello（指纹 / 面容 / PIN）验证，再读取托管的主密码。
    pub fn read_password() -> AppResult<String> {
        ensure_ro_initialized();
        let consent =
            UserConsentVerifier::RequestVerificationAsync(&HSTRING::from("解锁 Tokey 保险库"))
                .and_then(|op| op.get())
                .map_err(|e| AppError::new(format!("Windows Hello 验证失败：{e}")))?;
        if consent != UserConsentVerificationResult::Verified {
            return Err(AppError::new(consent_error_message(consent.0)));
        }
        let cred = vault()?
            .Retrieve(&resource(), &user_name())
            .map_err(|_| AppError::new("尚未启用生物识别解锁"))?;
        let password = cred
            .Password()
            .map_err(|e| AppError::new(format!("读取托管主密码失败：{e}")))?;
        Ok(password.to_string_lossy())
    }

    pub fn disable() -> AppResult<()> {
        ensure_ro_initialized();
        let vault = vault()?;
        // 不存在视为已禁用
        if let Ok(cred) = vault.Retrieve(&resource(), &user_name()) {
            vault
                .Remove(&cred)
                .map_err(|e| AppError::new(format!("无法删除凭据：{e}")))?;
        }
        Ok(())
    }
}

// ---------- 其他平台（Linux 等）：不支持 ----------

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod imp {
    use super::BiometricStatus;
    use crate::error::{AppError, AppResult};

    pub fn is_enabled() -> bool {
        false
    }

    pub fn status() -> BiometricStatus {
        BiometricStatus {
            available: false,
            enabled: false,
            label: String::new(),
        }
    }

    pub fn enable(_password: &str) -> AppResult<()> {
        Err(AppError::new("当前系统不支持生物识别解锁"))
    }

    pub fn read_password() -> AppResult<String> {
        Err(AppError::new("当前系统不支持生物识别解锁"))
    }

    pub fn disable() -> AppResult<()> {
        Ok(())
    }
}

// ---------- 对外门面 ----------

pub fn status() -> BiometricStatus {
    imp::status()
}

/// 托管项是否存在（非交互，不触发弹窗）
pub fn is_enabled() -> bool {
    imp::is_enabled()
}

/// 写入 / 覆盖托管项。调用方需先验证密码正确性。
pub fn enable(password: &str) -> AppResult<()> {
    imp::enable(password)
}

/// 弹出系统生物识别验证并读取托管的主密码（密码不出 Rust 层）。
pub fn read_password() -> AppResult<String> {
    imp::read_password()
}

/// 删除托管项。
pub fn disable() -> AppResult<()> {
    imp::disable()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sec_error_maps_known_codes() {
        assert_eq!(sec_error_message(-128), "已取消身份验证");
        assert_eq!(sec_error_message(-25293), "生物识别验证失败");
        assert_eq!(sec_error_message(-25300), "尚未启用生物识别解锁");
        assert_eq!(sec_error_message(-25308), "系统当前不允许进行身份验证");
        assert_eq!(sec_error_message(-34018), "缺少钥匙串访问权限（应用签名问题）");
        assert!(sec_error_message(-99999).contains("-99999"));
    }

    #[test]
    fn consent_error_maps_known_codes() {
        assert_eq!(consent_error_message(1), "设备不支持生物识别");
        assert_eq!(consent_error_message(2), "尚未配置 Windows Hello");
        assert_eq!(consent_error_message(3), "Windows Hello 已被策略禁用");
        assert_eq!(consent_error_message(4), "设备忙，请稍后重试");
        assert_eq!(consent_error_message(5), "验证失败次数过多，请稍后重试");
        assert_eq!(consent_error_message(6), "已取消身份验证");
        assert!(consent_error_message(42).contains("42"));
    }

    /// 本地错误码常量必须与 SDK 头文件一致，防止映射漂移
    #[cfg(target_os = "macos")]
    #[test]
    fn sec_error_constants_match_sdk() {
        assert_eq!(ERR_SEC_USER_CANCELED, objc2_security::errSecUserCanceled);
        assert_eq!(ERR_SEC_AUTH_FAILED, objc2_security::errSecAuthFailed);
        assert_eq!(ERR_SEC_ITEM_NOT_FOUND, objc2_security::errSecItemNotFound);
        assert_eq!(
            ERR_SEC_INTERACTION_NOT_ALLOWED,
            objc2_security::errSecInteractionNotAllowed
        );
        assert_eq!(
            ERR_SEC_MISSING_ENTITLEMENT,
            objc2_security::errSecMissingEntitlement
        );
    }
}
