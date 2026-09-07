#!/usr/bin/env bash
# ============================================================
# easy-keys macOS dmg 打包（供 CI 使用）
#
# 为什么不用 tauri 自带的 dmg bundler：
# 1. 布局失效 —— bundle_dmg.sh 的窗口布局依赖 Finder AppleScript，
#    无头 CI 上静默失败，产物里没有 .DS_Store，窗口布局丢失。
#    本脚本内嵌一个本地验证过的 DS_Store（src-tauri/dmg/DS_Store）。
# 2. 「已损坏」 —— 无签名身份时 tauri 产物只有 linker 级 adhoc 签名，
#    资源未封装（Sealed Resources=none），Gatekeeper 报「已损坏」。
#    本脚本先对 .app 做干净的 ad-hoc 深签名（codesign --force --deep --sign -）。
#
# 用法: scripts/make-dmg.sh <easy-keys.app 路径> <输出 dmg 路径>
# ============================================================
set -euo pipefail

APP="$1"
OUT="$2"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VOL="easy-keys"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 干净的 ad-hoc 签名（封装资源），修复 Gatekeeper「已损坏」；
# 注意这只是让系统正确识别应用，不等于公证——首次打开仍需
# 「系统设置 → 隐私与安全性 → 仍要打开」或 xattr -cr。
codesign --force --deep --sign - "$APP"

SIZE_MB=$(( $(du -sm "$APP" | cut -f1) + 20 ))
hdiutil create -size "${SIZE_MB}m" -fs HFS+ -volname "$VOL" -ov "$TMP/rw.dmg" -quiet
hdiutil attach "$TMP/rw.dmg" -mountpoint "$TMP/mnt" -nobrowse -quiet

cp -R "$APP" "$TMP/mnt/"
ln -s /Applications "$TMP/mnt/Applications"
cp "$ROOT/src-tauri/dmg/DS_Store" "$TMP/mnt/.DS_Store"
cp "$ROOT/src-tauri/icons/icon.icns" "$TMP/mnt/.VolumeIcon.icns"
SetFile -a C "$TMP/mnt" 2>/dev/null || true

hdiutil detach "$TMP/mnt" -quiet
mkdir -p "$(dirname "$OUT")"
hdiutil convert "$TMP/rw.dmg" -format UDZO -o "$OUT" -ov -quiet
echo "dmg -> $OUT"
