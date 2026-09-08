# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.5.0] - 2026-09-09

里程碑版本：内部标识全面更名 tokey（**不兼容旧版数据**，需重新创建保险库）。

### Changed

- **BREAKING**：全部内部标识更名——bundle identifier `com.tokey.app`、数据目录 `~/Library/Application Support/tokey/`（Linux `~/.local/share/tokey/`、Windows `%APPDATA%\tokey\`）、保险库加密 AAD `tokey-vault-v1`、Keychain service、环境变量标记块 `# >>> tokey start/end <<<`、`.ekey` 文件魔数 `TOKEY-EKEY`、测试注入环境变量 `TOKEY_DATA_DIR`；仓库与本地目录统一为 tokey
- 旧版保险库不会被读取：升级后相当于全新安装，请提前用旧版「导出 → 加密 .ekey」备份再导入

## [0.4.5] - 2026-09-09

### Removed

- 移除「锁定应用」功能及全部锁定相关逻辑（锁定按钮、锁定退后台、焦点触发验证、会话恢复）；macOS 关窗改为退出进程，重开需重新输入主密码或完成生物识别
- 移除旧版安装包自动清理（启动时扫描下载目录移入废纸篓）：该功能会触发 macOS「访问下载文件夹」授权框；应用不再访问 ~/Downloads

### Changed

- 密钥管理与连通性测速页内容列收窄至 560px，与导出/设置页一致，不再随窗口铺满
- 解锁页去掉 LOGO，仅保留一个输入控件；启动进入解锁页自动触发一次系统验证（取消后回退主密码输入，不再自动重弹）

## [0.4.4] - 2026-09-08

### Fixed

- 修复锁定后需要按多次指纹才能解锁：系统验证弹窗会抢占窗口焦点，其出现/关闭触发的焦点事件与并发触发造成重复弹窗；现在同一时刻只允许一次验证在途，冷却从验证结束（而非开始）时计时，按一次指纹即可解锁

### Changed

- 锁定后应用自动退至后台（macOS NSApplication.hide，焦点交还之前的应用），锁屏不再立即弹验证；下次聚焦时自动触发一次系统验证
- 失焦/关窗不再重新锁定：macOS 关窗改为隐藏（Dock 图标重开），解锁会话（Zeroizing，仅内存）保持到显式锁定或进程退出，窗口重开自动恢复
- 密钥列表精简：遮蔽改为前 4 位 + 固定 4 个占位符 + 后 4 位；移除「环境变量」列；名称列限 12 字符、超长省略号
- 密钥操作列新增「导出」：弹窗内可复制 API Key（默认打码、可切换显示）、Base URL、环境变量名

## [0.4.3] - 2026-09-08

### Fixed

- 修复生物识别解锁完全不可用：macOS 侧原实现把主密码写入带 userPresence ACL 的 Keychain 项，而 ACL 项需要 `keychain-access-groups` 授权——ad-hoc 签名携带该授权会被系统直接杀进程、无授权则启用时报 errSecMissingEntitlement（-34018）。改为普通 Keychain 项 + 读取前 LAContext 系统验证（Touch ID，可回退登录密码），无 Touch ID 的机器也可凭登录密码使用
- 修复窗口默认尺寸偏大：收窄至 960×590（最小 760×520）

### Changed

- 锁屏窗口改为刚好包裹 LOGO + 输入控件的小窗（360×250），解锁后恢复主界面尺寸（960×590），锁定自动缩回并退回密钥管理页
- 锁屏生物识别已启用时只显示「使用 Touch ID 解锁」一个按钮，失败/取消后替换为主密码输入框
- 锁定状态下焦点每次切回应用自动触发一次系统验证（5 秒冷却防弹窗循环）
- 显示名改为首字母大写 Tokey（.app 名、窗口标题、关于页；制品文件名保持 `tokey_*` 小写不变）
- 锁屏与「关于」页图标直接内嵌应用图标 PNG（与 .app 图标逐像素一致）；锁屏无标题/副标题/提交按钮，回车提交
- 侧栏移除品牌区（图标 + 名称），只保留导航项
- 侧栏底部图标按钮组（GitHub / 深浅色 / 语言 / 锁定）靠左排列，GitHub 去掉文字只留图标
- 「环境变量」并入「导出 / 导入」页作为第三个标签页，导航精简为四项
- 设置页「修改主密码」改为折叠面板，默认收起；移除「安全」卡片，「锁定应用」移入侧栏底部图标组
- 整体布局收紧：主区/卡片/弹窗/表格/表单内边距与间距全面调小，侧栏收窄至 180px；字号不变

## [0.4.2] - 2026-09-08

### Added

- 浅色 / 深色双主题：默认跟随系统，侧栏底部按钮手动切换（选择会记住）
- 界面中英文双语：默认跟随系统语言，侧栏底部菜单手动切换（简体中文 / English）

### Changed

- 应用更名为 tokey（token + key），界面品牌图标与应用图标统一为白底 squircle + 黑钥匙
- 侧栏底部移除状态文案，改为 GitHub 项目页链接（点击用系统浏览器打开）
- 密钥列表「服务商」列改为「提供商/URL」：显示提供商小写名（自定义提供商显示主机名），点击即复制 BASE URL
- 设置页「关于」版本号改为直接读取 package.json，不再出现版本号滞后

### Compatibility

- 内部标识（数据目录、bundle identifier、加密 AAD、环境变量标记块、Keychain 托管项）保持不变，升级后数据与生物识别解锁无损沿用

### Notes

- Release 产物文件名改为 `tokey_*`

## [0.4.1] - 2026-09-07

### Fixed

- macOS dmg 安装窗口布局在 CI 构建中丢失：tauri 的 dmg bundler 依赖 Finder AppleScript，无头 CI 上静默失败导致产物缺少 `.DS_Store`；改为 `scripts/make-dmg.sh` 手动打包，内嵌本地验证过的布局（窗口 540x360、app 居左、Applications 居右）
- macOS 打开报「已损坏，无法打开」：产物此前仅为 linker 级 adhoc 签名且资源未封装；CI 现在对 .app 执行干净的 ad-hoc 深签名（`codesign --force --deep --sign -`），Gatekeeper 恢复为正常的「无法验证开发者」流程（隐私与安全性 → 仍要打开，或 `xattr -cr`）

### Added

- README 新增「安装」章节（各平台安装方式与 macOS Gatekeeper 说明）

## [0.4.0] - 2026-09-07

### Added

- 生物识别解锁：主密码可托管至系统安全存储（macOS Keychain 访问控制项 / Windows Credential Locker），解锁由系统强制 Touch ID / Windows Hello（指纹/面容/PIN）验证，失败可回退主密码；Linux 不显示入口
- 密钥表单智能命名：按 Base URL 自动推导名称（如 deepseek/openai），Tab 一键填入，手动输入不被覆盖
- 表单内「测速并获取模型」：一键请求 `/models`，显示延迟并勾选可用模型保存到记录（默认全不选）
- 旧版本安装包自动清理：启动时将下载目录中低版本的安装包 dmg 移入废纸篓（不触碰用户数据）

### Changed

- 应用图标改为白底 squircle + 黑色极简钥匙
- macOS dmg 安装窗口缩小并收紧留白：app 图标居左、Applications 快捷方式居右

## [0.3.0] - 2026-09-07

### Changed

- UI 重设计：极简 macOS 原生风格（浅灰分层背景、白卡片细边框、原生分段控件、`#007AFF` 单一强调色）
- 界面 emoji 全部替换为本地内联 SVG 图标（新增 `src/components/icons.tsx`，零第三方依赖）；状态符号改用图标 + 语义色
- 新应用图标：纯色蓝 squircle + 极简钥匙图形，macOS `.icns` / Windows `.ico` 全尺寸更新

### Added

- E2E 视觉截图用例（`e2e/screenshot.e2e.ts`），用于 UI 回归自查

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
- Tauri capabilities 最小权限：仅开放文件对话框、剪贴板读写与窗口尺寸调整

[Unreleased]: https://github.com/yanboc/tokey/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/yanboc/tokey/compare/v0.4.5...v0.5.0
[0.4.5]: https://github.com/yanboc/tokey/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/yanboc/tokey/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/yanboc/tokey/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/yanboc/tokey/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/yanboc/tokey/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/yanboc/tokey/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/yanboc/tokey/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/yanboc/tokey/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/yanboc/tokey/releases/tag/v0.1.0
