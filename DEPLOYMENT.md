# Observatory Deployment Guide

## Manual Deployment to look.definitelynot.ai

The Observatory site is deployed **manually** to maintain full control over when updates go live.

### Quick Deploy

```bash
cd /home/zack/dev/observatory
./deploy.sh
```

This will:
1. Ask for confirmation
2. Rsync files to the server (excluding dev files)
3. Fix permissions for Caddy
4. Verify the deployment

### Manual Deployment (without script)

```bash
# Sync files to server
rsync -avz --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude '*.log' \
  --exclude '*.md' \
  /home/zack/dev/observatory/ \
  adept:/var/www/definitelynot.ai/look/

# Fix permissions
ssh adept 'sudo chown -R caddy:caddy /var/www/definitelynot.ai/look/'
```

### Server Configuration

- **Server**: adept.internetuniverse.org (66.235.173.197)
- **Path**: `/var/www/definitelynot.ai/look/`
- **URL**: https://look.definitelynot.ai/
- **Managed by**: Caddy (reverse proxy with SSL)
- **NixOS module**: Disabled (manual management preferred)

### Caddy Configuration

The Caddy virtualhost is defined in `/home/zack/dev/digitaldelusion/nixos/modules/caddy-wildcard.nix`:

```nix
"look.definitelynot.ai" = {
  extraConfig = ''
    root * /var/www/definitelynot.ai/look
    file_server
    # COOP/COEP headers for SharedArrayBuffer/WASM threads
  '';
};
```

### Important Notes

- The site requires **manual deployment** - NixOS does not auto-manage these files
- ONNX models should be placed in `models/*/onnx/` directories
- Multi-threaded WASM requires COOP/COEP headers (already configured in Caddy)
- Service worker caching is enabled for offline functionality

### Troubleshooting

```bash
# Check if site is accessible
curl -I https://look.definitelynot.ai/

# Check Caddy logs
ssh adept 'sudo journalctl -u caddy -f'

# View deployed files
ssh adept 'ls -la /var/www/definitelynot.ai/look/'

# Check permissions
ssh adept 'sudo ls -la /var/www/definitelynot.ai/look/ | head -20'
```

### Model Deployment

ONNX models are too large for git. Deploy manually:

```bash
# Copy models to server
rsync -avz --progress \
  /home/zack/dev/observatory/models/ \
  adept:/var/www/definitelynot.ai/look/models/
```
