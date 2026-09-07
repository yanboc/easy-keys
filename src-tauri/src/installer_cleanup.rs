//! 旧版本安装包自动清理（installer-cleanup）
//!
//! 应用启动时扫描 macOS `~/Downloads` 中形如 `easy-keys_<版本号>_*.dmg`
//! 的旧版本安装包，移入废纸篓（可恢复，非直接删除）。
//!
//! 设计：文件名解析 / 版本比较 / 目标筛选均为纯函数，文件扫描接受目录参数，
//! 测试不触碰真实 ~/Downloads。

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

/// 简单三段语义化版本号（只为它写比较，不引入 semver 依赖）
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Version(pub u32, pub u32, pub u32);

impl Version {
    pub fn parse(s: &str) -> Option<Version> {
        let mut parts = s.split('.');
        let major = parts.next()?.parse().ok()?;
        let minor = parts.next()?.parse().ok()?;
        let patch = parts.next()?.parse().ok()?;
        if parts.next().is_some() {
            return None; // 多于三段不算
        }
        Some(Version(major, minor, patch))
    }
}

impl std::fmt::Display for Version {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.0, self.1, self.2)
    }
}

/// 当前应用版本（编译期来自 Cargo.toml）
pub fn current_version() -> Version {
    Version::parse(env!("CARGO_PKG_VERSION")).expect("CARGO_PKG_VERSION 必须是 x.y.z 格式")
}

/// 从文件名解析安装包版本号。
///
/// 只认 `easy-keys_<x.y.z>_<任意后缀>.dmg`（如 `easy-keys_0.2.0_aarch64.dmg`），
/// 其余一律返回 None。
pub fn parse_installer_version(file_name: &str) -> Option<Version> {
    let stem = file_name.strip_prefix("easy-keys_")?.strip_suffix(".dmg")?;
    // stem 形如 "0.2.0_aarch64"，版本号在第一个 '_' 之前
    let version_part = stem.split('_').next()?;
    Version::parse(version_part)
}

/// 扫描目录，返回版本低于 `current` 的安装包完整路径（不递归子目录）。
pub fn find_outdated_installers(dir: &Path, current: Version) -> AppResult<Vec<PathBuf>> {
    let mut out = Vec::new();
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(out),
        Err(e) => return Err(e.into()),
    };
    for entry in entries {
        let entry = entry?;
        let path = entry.path();
        // 绝不碰目录和符号链接以外的特殊项，只处理普通文件
        if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if let Some(v) = parse_installer_version(name) {
            if v < current {
                out.push(path);
            }
        }
    }
    Ok(out)
}

/// 把扫描到的旧安装包移入废纸篓，返回成功移除的数量。
/// 单个文件失败不中断后续，错误汇总后随结果返回。
pub fn trash_files(files: &[PathBuf]) -> (usize, Vec<String>) {
    let mut ok = 0;
    let mut errors = Vec::new();
    for f in files {
        match trash::delete(f) {
            Ok(()) => ok += 1,
            Err(e) => errors.push(format!("{}: {e}", f.display())),
        }
    }
    (ok, errors)
}

/// 完整流程：扫描 `dir` 并把旧安装包移入废纸篓。
pub fn cleanup_dir(dir: &Path) -> AppResult<usize> {
    let targets = find_outdated_installers(dir, current_version())?;
    if targets.is_empty() {
        return Ok(0);
    }
    let (ok, errors) = trash_files(&targets);
    if !errors.is_empty() {
        return Err(AppError::new(format!(
            "部分旧安装包未能移入废纸篓: {}",
            errors.join("; ")
        )));
    }
    Ok(ok)
}

/// 默认入口：清理当前用户的 ~/Downloads。
pub fn cleanup_downloads() -> AppResult<usize> {
    // dirs::download_dir 在 macOS 即 ~/Downloads；拿不到时退回 home/Downloads
    let dir = dirs::download_dir().or_else(|| dirs::home_dir().map(|h| h.join("Downloads")));
    match dir {
        Some(d) => cleanup_dir(&d),
        None => Ok(0), // 拿不到 home 就静默跳过
    }
}

/// 启动时 fire-and-forget 调用：失败只记日志，绝不 panic。
pub fn run_silent() {
    std::thread::spawn(|| {
        match cleanup_downloads() {
            Ok(0) => {}
            Ok(n) => eprintln!("[installer-cleanup] 已将 {n} 个旧安装包移入废纸篓"),
            Err(e) => eprintln!("[installer-cleanup] 清理失败（已忽略）: {}", e.message),
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn parse_valid_installer_names() {
        assert_eq!(
            parse_installer_version("easy-keys_0.2.0_aarch64.dmg"),
            Some(Version(0, 2, 0))
        );
        assert_eq!(
            parse_installer_version("easy-keys_0.10.0_x64.dmg"),
            Some(Version(0, 10, 0))
        );
        assert_eq!(
            parse_installer_version("easy-keys_1.2.3_universal-apple-darwin.dmg"),
            Some(Version(1, 2, 3))
        );
    }

    #[test]
    fn parse_rejects_non_installer_names() {
        // 非 easy-keys 文件
        assert_eq!(parse_installer_version("other-app_0.1.0_aarch64.dmg"), None);
        assert_eq!(parse_installer_version("easy-keys.dmg"), None);
        assert_eq!(parse_installer_version("readme.txt"), None);
        // 扩展名不对
        assert_eq!(parse_installer_version("easy-keys_0.2.0_aarch64.zip"), None);
        assert_eq!(parse_installer_version("easy-keys_0.2.0_aarch64.DMG"), None);
        // 版本号缺失 / 不合法
        assert_eq!(parse_installer_version("easy-keys__aarch64.dmg"), None);
        assert_eq!(parse_installer_version("easy-keys_0.2_aarch64.dmg"), None);
        assert_eq!(parse_installer_version("easy-keys_0.2.0.1_aarch64.dmg"), None);
        assert_eq!(parse_installer_version("easy-keys_v0.2.0_aarch64.dmg"), None);
        assert_eq!(parse_installer_version("easy-keys_aarch64.dmg"), None);
    }

    #[test]
    fn version_comparison_is_numeric_not_lexicographic() {
        // 0.2.0 < 0.10.0（字符串排序会给出错误结论）
        assert!(Version(0, 2, 0) < Version(0, 10, 0));
        assert!(Version::parse("0.2.0").unwrap() < Version::parse("0.10.0").unwrap());
        assert!(Version(0, 9, 9) < Version(0, 10, 0));
        assert!(Version(1, 0, 0) > Version(0, 99, 99));
        assert_eq!(Version(1, 2, 3), Version(1, 2, 3));
        assert!(Version(1, 2, 3) < Version(1, 2, 4));
    }

    #[test]
    fn version_parse_strictness() {
        assert_eq!(Version::parse("0.3.0"), Some(Version(0, 3, 0)));
        assert_eq!(Version::parse("1.2"), None);
        assert_eq!(Version::parse("1.2.3.4"), None);
        assert_eq!(Version::parse("a.b.c"), None);
        assert_eq!(Version::parse(""), None);
        assert_eq!(Version::parse("0.3.0-beta"), None);
    }

    #[test]
    fn filter_selects_only_outdated_easy_keys_dmgs() {
        let dir = std::env::temp_dir().join(format!("easy-keys-cleanup-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();

        let files = [
            "easy-keys_0.1.0_aarch64.dmg",  // 旧版 → 选中
            "easy-keys_0.2.0_aarch64.dmg",  // 旧版 → 选中
            "easy-keys_0.3.0_aarch64.dmg",  // 当前版本 → 不动
            "easy-keys_0.9.9_aarch64.dmg",  // 比当前新 → 不动
            "easy-keys_0.10.0_aarch64.dmg", // 比当前新 → 不动（0.10 > 0.3 的坑）
            "easy-keys_0.2.0_aarch64.zip",  // 非 dmg → 不动
            "other-tool_0.1.0.dmg",         // 别的应用 → 不动
            "random.dmg",                   // 无名 dmg → 不动
            "笔记.txt",                     // 用户文件 → 不动
        ];
        for f in files {
            fs::write(dir.join(f), b"fake").unwrap();
        }
        // 子目录里的同名文件绝不能被碰（不递归）
        fs::create_dir_all(dir.join("subdir")).unwrap();
        fs::write(dir.join("subdir").join("easy-keys_0.1.0_aarch64.dmg"), b"fake").unwrap();

        let current = Version(0, 3, 0);
        let mut found = find_outdated_installers(&dir, current).unwrap();
        found.sort();
        let names: Vec<_> = found
            .iter()
            .map(|p| p.file_name().unwrap().to_str().unwrap().to_string())
            .collect();
        assert_eq!(
            names,
            vec![
                "easy-keys_0.1.0_aarch64.dmg".to_string(),
                "easy-keys_0.2.0_aarch64.dmg".to_string()
            ]
        );

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_dir_is_noop() {
        let dir = std::env::temp_dir().join(format!("easy-keys-no-such-dir-{}", std::process::id()));
        let found = find_outdated_installers(&dir, Version(0, 3, 0)).unwrap();
        assert!(found.is_empty());
    }
}
