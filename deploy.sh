#!/usr/bin/env bash
# Manual deployment script for look.definitelynot.ai
# Syncs local observatory files to the NixOS server

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Server details
SERVER="adept"
REMOTE_PATH="/var/www/definitelynot.ai/look/"
LOCAL_PATH="/home/zack/dev/observatory/"

echo -e "${YELLOW}Deploying Observatory to look.definitelynot.ai...${NC}"
echo ""

# Confirm deployment
read -p "Deploy to production? (yes/no): " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo -e "${RED}Deployment cancelled${NC}"
    exit 1
fi

# Rsync with careful exclusions
rsync -avz --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'test-images/' \
  --exclude 'test/2/' \
  --exclude 'transformers.js/' \
  --exclude '*.log' \
  --exclude '*.md' \
  --exclude 'debug-*' \
  --exclude 'diagnose-*' \
  --exclude 'local-test-server.mjs' \
  --exclude 'run-optimization-tests.mjs' \
  --exclude 'verify-optimizations.mjs' \
  --exclude 'webgpu-debugger.html' \
  --exclude 'LOCAL_TESTING_*.md' \
  --exclude 'deploy.sh' \
  "${LOCAL_PATH}" "${SERVER}:${REMOTE_PATH}"

# Fix permissions on server (Caddy runs as caddy user)
ssh "${SERVER}" "sudo chown -R caddy:caddy ${REMOTE_PATH} && sudo chmod -R 755 ${REMOTE_PATH}"

echo ""
echo -e "${GREEN}Deployment complete!${NC}"
echo -e "Site: https://look.definitelynot.ai/"
echo ""
echo "Verifying deployment..."
curl -sI https://look.definitelynot.ai/ | head -3
