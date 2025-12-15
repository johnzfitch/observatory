#!/bin/bash
# ========================================
# Phase 1 Deploy Script
# look.definitelynot.ai
# ========================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Phase 1 Deployment - look.definitelynot.ai${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ----------------------------------------
# Configuration
# ----------------------------------------

PROJECT_DIR="${PROJECT_DIR:-/home/zack/dev/observatory}"
REMOTE_HOST="${REMOTE_HOST:-adept}"
REMOTE_PATH="${REMOTE_PATH:-/var/www/definitelynot.ai/look}"

# ----------------------------------------
# Pre-flight checks
# ----------------------------------------

echo -e "${YELLOW}🔍 Pre-flight checks...${NC}"

# Check if project directory exists
if [ ! -d "$PROJECT_DIR" ]; then
    echo -e "${RED}ERROR: Project directory not found: $PROJECT_DIR${NC}"
    exit 1
fi
echo -e "   ${GREEN}✓${NC} Project directory exists"

# Check if ONNX Runtime files exist
ONNX_DIR="$PROJECT_DIR/vendor/onnxruntime-1.17.0"
if [ ! -f "$ONNX_DIR/ort-wasm-simd.wasm" ]; then
    echo -e "${RED}ERROR: ONNX Runtime files not found. Run setup-phase1.sh first.${NC}"
    exit 1
fi
echo -e "   ${GREEN}✓${NC} ONNX Runtime files present"

# Check if patch files exist
if [ ! -f "$PROJECT_DIR/patches/001-cache-nuclear.js" ]; then
    echo -e "${RED}ERROR: Patch files not found. Copy from delivery scaffold.${NC}"
    exit 1
fi
echo -e "   ${GREEN}✓${NC} Patch files present"

# Check if we can reach the remote host
if ! ssh -o BatchMode=yes -o ConnectTimeout=5 "$REMOTE_HOST" exit 2>/dev/null; then
    echo -e "${RED}ERROR: Cannot connect to $REMOTE_HOST${NC}"
    exit 1
fi
echo -e "   ${GREEN}✓${NC} Remote host reachable"

# ----------------------------------------
# Deploy
# ----------------------------------------

echo ""
echo -e "${YELLOW}📤 Deploying to $REMOTE_HOST:$REMOTE_PATH...${NC}"

cd "$PROJECT_DIR"

# Rsync with progress
# Note: Using --no-perms --no-owner --no-group because files are owned by caddy
# Permissions are fixed afterwards with sudo chown/chmod
rsync -rltvz --progress \
    --no-perms --no-owner --no-group \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='.DS_Store' \
    --exclude='__pycache__' \
    --exclude='test-results' \
    --exclude='playwright-report' \
    --exclude='screenshots' \
    --exclude='tests' \
    --exclude='archived' \
    --exclude='archive' \
    --exclude='*.md' \
    . "$REMOTE_HOST:$REMOTE_PATH/"

echo ""
echo -e "${GREEN}✓ Files synced${NC}"

# ----------------------------------------
# Fix permissions
# ----------------------------------------

echo ""
echo -e "${YELLOW}🔐 Fixing permissions...${NC}"

ssh "$REMOTE_HOST" "sudo chown -R caddy:caddy $REMOTE_PATH && sudo chmod -R 755 $REMOTE_PATH"

echo -e "${GREEN}✓ Permissions fixed${NC}"

# ----------------------------------------
# Verify critical files
# ----------------------------------------

echo ""
echo -e "${YELLOW}🔍 Verifying deployment...${NC}"

CRITICAL_FILES=(
    "patches/001-cache-nuclear.js"
    "src/config/onnx-init.js"
    "src/ui/InferenceEngine.js"
    "vendor/onnxruntime-1.17.0/ort-wasm-simd.wasm"
    "test/verify-phase1.html"
    "index.html"
)

for file in "${CRITICAL_FILES[@]}"; do
    if ssh "$REMOTE_HOST" "[ -f '$REMOTE_PATH/$file' ]"; then
        echo -e "   ${GREEN}✓${NC} $file"
    else
        echo -e "   ${RED}✗${NC} MISSING: $file"
    fi
done

# ----------------------------------------
# Quick URL tests
# ----------------------------------------

echo ""
echo -e "${YELLOW}🌐 Testing URLs...${NC}"

SITE_URL="https://look.definitelynot.ai"

# Test main page
if curl -s -o /dev/null -w "%{http_code}" "$SITE_URL" | grep -q "200"; then
    echo -e "   ${GREEN}✓${NC} Main page accessible"
else
    echo -e "   ${RED}✗${NC} Main page not accessible"
fi

# Test WASM file
if curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/vendor/onnxruntime-1.17.0/ort-wasm-simd.wasm" | grep -q "200"; then
    echo -e "   ${GREEN}✓${NC} WASM files accessible"
else
    echo -e "   ${RED}✗${NC} WASM files not accessible"
fi

# Test verification page
if curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/test/verify-phase1.html" | grep -q "200"; then
    echo -e "   ${GREEN}✓${NC} Verification page accessible"
else
    echo -e "   ${RED}✗${NC} Verification page not accessible"
fi

# ----------------------------------------
# Done
# ----------------------------------------

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}✅ Phase 1 Deployment Complete!${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "1. Open: ${CYAN}$SITE_URL/test/verify-phase1.html${NC}"
echo -e "2. Click 'Run All Tests'"
echo -e "3. Verify 8/8 tests pass"
echo ""
echo -e "4. Then test main site: ${CYAN}$SITE_URL${NC}"
echo -e "5. Check console for [ONNX-Init] and [InferenceEngine] logs"
echo ""
echo -e "${YELLOW}If tests fail:${NC}"
echo -e "• Check browser console for specific errors"
echo -e "• Verify service worker updated (check version in DevTools)"
echo -e "• Force hard refresh: Ctrl+Shift+R"
echo ""
