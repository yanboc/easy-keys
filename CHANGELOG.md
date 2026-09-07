# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.2.0] - 2026-09-07

### Added

- 接入 OpenSpec 规格管理（`openspec/`，仅本机维护不入库），回填 5 个能力规格：vault-crypto、key-management、speedtest、export-import、env-vars
- 前端组件测试：Vitest + Testing Library 覆盖页面与组件核心交互
- Rust 集成测试补充边界与异常路径用例（损坏保险库、错误导出/导入口令、env 边界条件）
- 本地真机 E2E 测试：`@wdio/tauri-service` + 内嵌 WebDriver（仅 `e2e` feature 构建，release 不含）
- CI 测试矩阵扩展至 macOS，新增 E2E job

## [0.1.0] - 2026-09-01

首个版本。

### Added

- 🔐 加密保险库：主密码经 Argon2id 派生密钥，AES-256-GCM 加密存储在本机应用数据目录，原子写入防损坏，文件权限 0600
- 🔑 密钥管理：添加 / 编辑 / 删除 API Key，provider 模板默认值填充，密钥默认遮蔽显示，复制到剪贴板 30 秒后自动清除
- ⚡ 一键测速：并发向各密钥配置的端点发起轻量请求，测量连通性与延迟；禁用自动重定向防止密钥泄露，默认 10s 超时
- 📦 导出 / 导入：明文 JSON（二次确认）、加密 `.ekey` 可迁移文件（独立口令，可跨机器导入）
- 🌱 环境变量：一键写入 shell 配置（幂等替换不堆积）、仅当前会话脚本、`.env` 文件、Windows 用户环境变量
- 🖥️ 三平台安装包构建：macOS `.dmg`、Windows `.msi`/`.exe`、Linux `.deb`/`.AppImage`（GitHub Actions，tag `v*` 自动发布 Release）

### Security

- 应用零联网：无遥测、无更新检查、无第三方 SDK，唯一联网路径是用户主动点击测速
- Tauri capabilities 最小权限：仅开放文件对话框与剪贴板读写

[Unreleased]: https://github.com/yanboc/easy-keys/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/yanboc/easy-keys/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/yanboc/easy-keys/releases/tag/v0.1.0
