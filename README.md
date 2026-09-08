<div align="center">

# Tokey

[![Build](https://github.com/yanboc/easy-keys/actions/workflows/build.yml/badge.svg)](https://github.com/yanboc/easy-keys/actions/workflows/build.yml)
![Platform: macOS | Windows | Linux](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)
![Stack: Tauri 2 + React 18](https://img.shields.io/badge/Stack-Tauri%202%20%2B%20React%2018-blue)

</div>

完全本地的 AI API Key 管理工具（macOS / Windows / Linux）。Tokey = token + key。原名 easy-keys，v0.4.2 起更名为 Tokey，既有数据自动沿用无需迁移。

加密保险库存储你的所有模型 API Key，支持一键测速、明文/加密导出、一键写入环境变量。应用自身**零联网**——没有遥测、没有更新检查、没有任何第三方连接，唯一可能联网的场景是你主动点击「测速」。

## 目录

- [功能](#功能)
- [安装](#安装)
- [技术栈](#技术栈)
- [开发](#开发)
- [测试与自回归](#测试与自回归)
- [构建安装包](#构建安装包)
- [数据存储位置](#数据存储位置)
- [安全模型](#安全模型)
- [注意事项](#注意事项)

---

## 功能

| 功能 | 说明 |
| --- | --- |
| 加密保险库 | 主密码经 Argon2id 派生密钥，AES-256-GCM 加密存储在本机应用数据目录 |
| 生物识别解锁 | 可选：主密码托管至系统安全存储，Touch ID / Windows Hello（指纹/面容/PIN）一键解锁，可回退主密码 |
| 一键测速 | 并发向各密钥配置的端点发起轻量请求，测量连通性与延迟；已禁用自动重定向防止密钥泄露 |
| 智能表单 | 按 Base URL 自动建议密钥名称（Tab 填入）；表单内一键测速并拉取可用模型勾选保存 |
| 提供商 / URL | 密钥列表的提供商列做成可点击链接，点击即复制该密钥的 BASE URL |
| 导出 / 导入 / 环境变量 | 明文 JSON、加密 `.ekey` 可迁移文件（独立口令，可在另一台机器导入）；一键写入 shell 配置（`~/.zshrc` 等，幂等替换不堆积）或 Windows 用户环境变量，支持仅当前会话脚本与 `.env` 文件 |
| 安全细节 | 密钥默认遮蔽显示；复制到剪贴板 30 秒后自动清除；保险库原子写入防损坏 |
| 安装体验 | macOS dmg 紧凑布局（app 居左、Applications 居右）；启动时自动将下载目录中的旧版安装包移入废纸篓 |
| 界面 | 极简 macOS 原生风格；浅色/深色双主题跟随系统可手动切换；中英文双语跟随系统语言可手动切换 |

---

## 安装

从 [GitHub Releases](https://github.com/yanboc/easy-keys/releases/latest) 下载对应平台的安装包。

1. **macOS**：打开 `.dmg`，将 Tokey 拖入「应用程序」文件夹。应用为 ad-hoc 签名（未做 Apple 公证），首次打开若提示无法验证，在「系统设置 → 隐私与安全性」点击**仍要打开**，或执行：

   ```bash
   xattr -cr /Applications/Tokey.app
   ```

2. **Windows**：运行 `.exe`（NSIS）或 `.msi` 安装程序。
3. **Linux**：使用 `.deb` 或 `.AppImage`。

---

## 技术栈

- [Tauri 2](https://tauri.app)（Rust 后端，体积约 10-20MB，对比 Electron 150-250MB）
- React 18 + Vite + TypeScript（前端全部本地打包，无 CDN 依赖）
- Rust 加密：`argon2` + `aes-gcm`（AES-256-GCM）

---

## 开发

前置要求：[Rust](https://rustup.rs)（stable）、[Node.js](https://nodejs.org) 24+（组件测试依赖 jsdom 30，最低 22.22.2）。

```bash
npm install
npm run tauri dev
```

---

## 测试与自回归

本地测试环境已固化，一条命令跑完全部回归：

```bash
./scripts/run.sh             # 完整：类型检查 + 前端测试 + Rust 测试 + 构建验证
./scripts/run.sh --skip-build # 跳过构建验证（更快）
./scripts/run.sh --e2e        # 常规回归后追加真机 E2E（会打开真实窗口）
```

测试分层：

| 层 | 工具 | 位置 | 覆盖 |
| --- | --- | --- | --- |
| Rust 集成测试 | `cargo test` | `src-tauri/tests/*.rs` | 加密往返、错误密码、保险库 CRUD、改密码、批量导入、env 幂等替换、会话脚本、.ekey 导出/导入、明文 JSON |
| 前端单元测试 | Vitest | `src/*.test.ts` | `maskKey` 遮蔽、provider 默认值填充、env 名生成、URL 推导名称建议、`newEmptyRecord` |
| 类型检查 | `tsc --noEmit` | — | 前端 TS 类型安全 |
| 构建验证 | `vite build` | — | 前端生产构建可通过 |
| 真机 E2E | WebdriverIO + 内嵌 WebDriver | `e2e/*.e2e.ts` | 创建保险库 → 新增密钥 → 列表遮蔽 → 显示切换；视觉截图自查 |

单独跑某一层：

```bash
npm run typecheck       # 前端类型检查
npm run test            # 前端单元测试（Vitest）
npx vitest --watch      # 前端测试 watch 模式
cd src-tauri && cargo test   # Rust 测试
npm run test:e2e        # 真机 E2E（构建 debug+e2e 二进制后驱动真实窗口；脚本内已处理 cargo PATH）
```

真机 E2E 说明：
- 方案：Rust 插件 `tauri-plugin-wdio-webdriver` 在应用内嵌入 WebDriver HTTP server（macOS 上 tauri-driver 无 WKWebView 支持，故用 embedded 方案），npm 侧用 `@wdio/tauri-service`（`driverProvider: 'embedded'`）+ WebdriverIO + Mocha。
- **安全隔离**：该插件只在 cargo feature `e2e` 下编译（`src-tauri/Cargo.toml` 的 optional 依赖 + `src/lib.rs` 条件注册）；`npm run tauri build` 的 release 构建**不含** WebDriver server。
- E2E 二进制必须同时带 `tauri/custom-protocol` feature（`test:e2e:build` 已内置）：裸 `cargo build --features e2e` 在 Tauri 2 里是 dev 模式，窗口会尝试加载 vite dev server（localhost:1420）而白屏；加 `custom-protocol` 才会内嵌 `dist/` 前端资源。
- **数据隔离**：E2E 启动的应用经 `EASY_KEYS_DATA_DIR` 指向 `wdio.conf.ts` onPrepare 创建的临时目录，跑完自动删除，绝不触碰真实保险库。
- `tauri.conf.json` 开启了 `withGlobalTauri`（E2E service 需要通过 `window.__TAURI__` 探测窗口）。

测试隔离设计：
- Rust 测试通过 `EASY_KEYS_DATA_DIR` 指向临时目录，**绝不触碰真实保险库**；文件系统类测试经全局 Mutex 串行执行避免竞态。
- 前端测试只测纯逻辑（无 Tauri/浏览器依赖），秒级完成。
- 测试代码（`#[cfg(test)]` / `*.test.ts`）只存在于开发期，**不进入发布包**——发布体积不受影响（已验证主二进制 14MB、.dmg 4.5MB）。

手动 GUI 测试：`npm run tauri dev` 启动本地窗口，创建保险库 → 添加密钥 → 测速 / 导出 / 环境变量，全流程点点点验证。

---

## 构建安装包

```bash
npm run tauri build
```

产物在 `src-tauri/target/release/bundle/` 下：

- macOS：`.dmg` / `.app`
- Windows：`.msi` / `.exe`（NSIS）
- Linux：`.deb` / `.AppImage`

三平台自动构建见 [`.github/workflows/build.yml`](.github/workflows/build.yml)（push tag `v*` 自动发布 GitHub Release）。

---

## 数据存储位置

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/easy-keys/vault.json` |
| Linux | `~/.local/share/easy-keys/vault.json` |
| Windows | `%APPDATA%\easy-keys\vault.json` |

文件权限为仅当前用户可读写（0600）。加密导出 `.ekey` 文件可在任意平台导入。

> 目录名保持 `easy-keys` 不改是有意为之：v0.4.2 更名后沿用原数据目录与 bundle identifier（`com.easykeys.app`），老用户的保险库与生物识别托管项无损保留。

---

## 安全模型

1. **零联网**：应用不包含任何遥测、崩溃上报、更新检查或第三方 SDK；启动后仅读写本地文件。
2. **加密存储**：主密码永不上传，经 Argon2id（OWASP 推荐参数）派生密钥后以 AES-256-GCM 加密保险库。
3. **测速隔离**：联网路径只有测速与表单里的「测速并获取模型」，均须用户主动点击；请求直连用户配置的端点，禁用重定向，默认 10s 超时。
4. **最小权限**：Tauri capabilities 只开放文件对话框、剪贴板读取/写入与窗口尺寸调整；shell 配置写入在 Rust 侧完成。
5. **明文导出需二次确认**：明文 JSON 导出前会弹出安全警告。
6. **生物识别解锁（可选）**：开启后主密码托管于操作系统安全存储——macOS 为 Keychain 通用密码项（仅本应用可读），Windows 为 Credential Locker；读取前先经系统身份验证（Touch ID，可回退登录密码 / Windows Hello 指纹·面容·PIN），应用自身不落盘主密码。生物识别解锁期间主密码仅驻留 Rust 内存（Zeroizing），锁定即清除；Linux 不提供该入口。

---

## 注意事项

- 主密码丢失后**无法恢复**数据，请务必通过「导出 → 加密 .ekey」定期备份。
- 持久化写入环境变量会把密钥以明文写入 shell 配置文件；若更在意静态安全，推荐「仅当前会话」模式。
- 首次启动时若 macOS 弹出「Tokey 想访问下载文件夹」授权框：这是旧版安装包自动清理功能（仅移入废纸篓、可恢复，同时识别改名前的 `easy-keys_*.dmg`），拒绝授权不影响任何正常使用。
