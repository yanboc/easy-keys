# AGENTS.md

## 项目简介

tokey（原名 easy-keys，v0.4.2 更名）：完全本地的 AI API Key 管理工具。Tauri 2（Rust 后端）+ React 18 + Vite + TypeScript（前端）。应用自身**零联网**——无遥测、无更新检查、无第三方 SDK，唯一联网路径是用户主动点击「测速」。

更名后为兼容老用户数据**有意保持不变**的内部标识：bundle identifier `com.easykeys.app`、数据目录 `easy-keys/`、Keychain service、保险库加密 AAD、env 标记块前缀、`EASY_KEYS_DATA_DIR`。改这些等于清空老用户数据，禁止顺手「改名」。

## 常用命令

```bash
./scripts/run.sh               # 完整自回归：类型检查 + 前端测试 + Rust 测试 + 构建验证
./scripts/run.sh --skip-build  # 跳过构建验证（更快）
./scripts/run.sh --e2e         # 追加真机 E2E（可选步骤）

npm run typecheck              # 前端类型检查
npm test                       # 前端单元 + 组件测试（Vitest, jsdom）
cd src-tauri && cargo test     # Rust 集成测试（需 export PATH="$HOME/.cargo/bin:$PATH"）
npm run test:e2e               # 真机 E2E（WebdriverIO + 内嵌 WebDriver，会打开真实窗口）
npm run tauri dev              # 本地开发窗口
```

## 规格管理（OpenSpec）

本项目本机使用 OpenSpec 管理规格，现有行为的权威描述在 `openspec/specs/`（**仅本机维护，不入库**，已被 .gitignore 排除）：

- `vault-crypto` / `key-management` / `speedtest` / `export-import` / `env-vars` / `biometric-unlock` / `installer-cleanup` / `ui-style` / `docs-conventions`

工作流约定：

1. 新需求 / 行为变更：先建 change proposal（`openspec/changes/<name>/`：proposal + tasks + spec deltas），实施完成后 archive 回主规格。
2. 纯 bug 修复、重构、测试加固可直接改，无需 proposal。
3. 改了行为就必须同步对应 spec；提交前跑 `openspec validate --strict`。
4. 版本发布前更新 `CHANGELOG.md`（Keep a Changelog 格式）。

## 提交纪律

- **提交前检查文档同步**：README（功能表/命令/安全模型/测试跑法）必须与代码实际行为一致；版本发布提交同步 README 受影响章节与 CHANGELOG。
- **保持仓库整洁**：本机工具配置、临时脚本、构建产物、截图等及时加入 `.gitignore`；发现误入库的文件在最近提交中移除并补规则。
- README 写作风格遵循 `docs-conventions` 规格（居中头部 + badges、目录、大节分隔线、表格清单、示例驱动、不用 emoji 装饰）。

## 测试约定

- 分层：前端纯逻辑单测（`src/*.test.ts`）、前端组件测试（`src/**/*.test.tsx`，mock `src/api.ts` 与 Tauri 插件，不碰真后端）、Rust 集成测试（`src-tauri/tests/`）、真机 E2E（`e2e/`）。
- 隔离红线：Rust 测试必须经 `EASY_KEYS_DATA_DIR` 指向临时目录，**绝不触碰真实保险库**；文件系统类测试走全局 Mutex 串行。E2E 同样用独立临时数据目录。
- 新增行为必须带测试；测试代码不进入发布包。

## 安全红线

- 保持零联网：不得引入遥测/上报/自动更新；新增网络请求必须走 OpenSpec proposal 并在 README 安全模型中说明。
- WebDriver server（`tauri-plugin-wdio-webdriver`）只允许在 `e2e` cargo feature 下编译，**release 构建严禁包含**。
- 密钥默认遮蔽；明文导出必须二次确认；剪贴板 30 秒自动清除。

## 代码结构

- `src/`：React 前端（`api.ts` 是唯一的 Tauri invoke 封装层，前端不直接 import `@tauri-apps/api`）
- `src-tauri/src/`：Rust 后端（crypto / vault / env / export_import / speedtest / installer_cleanup / biometric / models / error / lib）
- `openspec/`：规格与变更提案
- `scripts/run.sh`：一键自回归入口
- `scripts/make-dmg.sh`：CI macOS dmg 打包（内嵌已验证的 DS_Store 布局 + ad-hoc 深签名；tauri 自带 dmg bundler 在无头 CI 上布局会丢失）
