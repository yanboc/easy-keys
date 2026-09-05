#!/usr/bin/env bash
# ============================================================
# easy-keys 一键自回归测试
# 用法:
#   ./run.sh                # 完整回归（类型+前端+Rust+构建）
#   ./run.sh --skip-build   # 跳过构建验证（更快）
#   ./run.sh --fast         # 等价 --skip-build
# 前置: node/npm, Rust toolchain (cargo), 无需网络（Rust 依赖已缓存）
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build|--fast) SKIP_BUILD=1 ;;
    *) echo "未知参数: $arg (支持 --skip-build/--fast)" >&2; exit 1 ;;
  esac
done

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS() { echo -e "${GREEN}✔ $1${NC}"; }
FAIL() { echo -e "${RED}✘ $1${NC}"; }
INFO() { echo -e "${BLUE}── $1 ──${NC}"; }
WARN() { echo -e "${YELLOW}! $1${NC}"; }

STEP=0
run_step() { # run_step <名称> <命令...>
  STEP=$((STEP+1))
  INFO "步骤 $STEP: $1"
  local start=$(date +%s)
  if "${@:2}"; then
    local end=$(date +%s)
    PASS "$1 通过 ($((end-start))s)"
  else
    local end=$(date +%s)
    FAIL "$1 失败 ($((end-start))s)"
    exit 1
  fi
}

echo -e "${BLUE}========== easy-keys 自回归测试 ==========${NC}"
echo "工作目录: $ROOT"
echo "开始时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ---------- 前置检查 ----------
command -v cargo >/dev/null 2>&1 || { FAIL "未找到 cargo，请先安装 Rust: https://rustup.rs"; exit 1; }
command -v node >/dev/null 2>&1 || { FAIL "未找到 node，请先安装 Node.js"; exit 1; }
command -v npm  >/dev/null 2>&1 || { FAIL "未找到 npm"; exit 1; }

# ---------- 前端依赖 ----------
if [ ! -d node_modules ]; then
  run_step "安装前端依赖 (npm install)" npm install
else
  INFO "步骤 $((STEP+1)): 前端依赖已存在，跳过 npm install"
  STEP=$((STEP+1))
fi

# ---------- 前端类型检查 ----------
run_step "前端类型检查 (tsc --noEmit)" npm run typecheck

# ---------- 前端单元测试 ----------
run_step "前端单元测试 (Vitest)" npx vitest run

# ---------- Rust 测试 ----------
run_step "Rust 测试 (cargo test)" bash -c 'cd src-tauri && cargo test'

# ---------- 前端构建验证 ----------
if [ "$SKIP_BUILD" -eq 0 ]; then
  run_step "前端构建验证 (vite build)" npm run build
else
  INFO "步骤 $((STEP+1)): 已跳过构建验证 (--skip-build)"
  STEP=$((STEP+1))
fi

echo ""
echo -e "${GREEN}========== 全部通过 ✅ (${STEP} 步) ==========${NC}"
echo ""
echo "快速手动验证 GUI：npm run tauri dev"
echo "查看测试详情：      README.md 的「测试」章节"
