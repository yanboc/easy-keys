//! 手动诊断用（不进 CI）：验证 macOS Keychain ACL 托管项的写入/探测/删除。
//! 运行：cargo test --test bio_manual -- --ignored --nocapture
//! bio_read 会真实弹出系统 Touch ID / 密码验证框。

#[test]
#[ignore]
fn bio_write_probe_delete() {
    // 写入（不弹窗）
    tokey_lib::biometric::enable("bio-manual-test-pwd").expect("enable 失败");
    assert!(tokey_lib::biometric::is_enabled(), "写入后探测不到托管项");
    let status = tokey_lib::biometric::status();
    eprintln!("status = {status:?}");
    assert!(status.enabled);
    // 删除（不弹窗）
    tokey_lib::biometric::disable().expect("disable 失败");
    assert!(!tokey_lib::biometric::is_enabled(), "删除后仍能探测到托管项");
}

#[test]
#[ignore]
fn bio_read_interactive() {
    tokey_lib::biometric::enable("bio-manual-test-pwd").expect("enable 失败");
    let pwd = tokey_lib::biometric::read_password().expect("read_password 失败");
    assert_eq!(pwd, "bio-manual-test-pwd");
    tokey_lib::biometric::disable().expect("disable 失败");
}
