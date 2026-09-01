# easy-keys

完全本地的 AI API Key 管理工具（macOS / Windows / Linux）。

加密保险库存储你的所有模型 API Key，支持一键测速、明文/加密导出、一键写入环境变量。应用自身**零联网**——没有遥测、没有更新检查、没有任何第三方连接，唯一可能联网的场景是你主动点击「测速」。

## 功能

| 功能 | 说明 |
| --- | --- |
| 🔐 加密保险库 | 主密码经 Argon2id 派生密钥，AES-256-GCM 加密存储在本机应用数据目录 |
| ⚡ 一键测速 | 并发向各密钥配置的端点发起轻量请求，测量连通性与延迟；已禁用自动重定向防止密钥泄露 |
| 📦 导出 / 导入 | 明文 JSON、加密 `.ekey` 可迁移文件（独立口令，可在另一台机器导入） |
| 🌱 环境变量 | 一键写入 shell 配置（`~/.zshrc` 等，幂等替换不堆积）或 Windows 用户环境变量；支持仅当前会话脚本与 `.env` 文件 |
| 🔒 安全细节 | 密钥默认遮蔽显示；复制到剪贴板 30 秒后自动清除；保险库原子写入防损坏 |

## 技术栈

- [Tauri 2](https://tauri.app)（Rust 后端，体积约 10-20MB，对比 Electron 150-250MB）
- React 18 + Vite + TypeScript（前端全部本地打包，无 CDN 依赖）
- Rust 加密：`argon2` + `aes-gcm`（AES-256-GCM）

## 开发

前置要求：[Rust](https://rustup.rs)（stable）、[Node.js](https://nodejs.org) 18+。

```bash
npm install
npm run tauri dev
```

## 构建安装包

```bash
npm run tauri build
```

产物在 `src-tauri/target/release/bundle/` 下：

- macOS：`.dmg` / `.app`
- Windows：`.msi` / `.exe`（NSIS）
- Linux：`.deb` / `.AppImage`

三平台自动构建见 [`.github/workflows/build.yml`](.github/workflows/build.yml)（push tag `v*` 自动发布 GitHub Release）。

## 数据存储位置

| 平台 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/easy-keys/vault.json` |
| Linux | `~/.local/share/easy-keys/vault.json` |
| Windows | `%APPDATA%\easy-keys\vault.json` |

文件权限为仅当前用户可读写（0600）。加密导出 `.ekey` 文件可在任意平台导入。

## 安全模型

1. **零联网**：应用不包含任何遥测、崩溃上报、更新检查或第三方 SDK；启动后仅读写本地文件。
2. **加密存储**：主密码永不上传，经 Argon2id（OWASP 推荐参数）派生密钥后以 AES-256-GCM 加密保险库。
3. **测速隔离**：唯一联网路径是测速，必须用户主动点击；请求直连用户配置的端点，禁用重定向，默认 10s 超时。
4. **最小权限**：Tauri capabilities 只开放文件对话框与剪贴板读取/写入；shell 配置写入在 Rust 侧完成。
5. **明文导出需二次确认**：明文 JSON 导出前会弹出安全警告。

## 注意事项

- 主密码丢失后**无法恢复**数据，请务必通过「导出 → 加密 .ekey」定期备份。
- 持久化写入环境变量会把密钥以明文写入 shell 配置文件；若更在意静态安全，推荐「仅当前会话」模式。
