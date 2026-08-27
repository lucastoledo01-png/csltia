# ChatbotX Deployment Guide

## Problem Resolved

The `chatbotxio/chatbotx:latest` Docker image doesn't exist on Docker Hub. ChatbotX is a complex monorepo with multiple microservices that must be built from source using docker-compose.

## Solution

Deploy ChatbotX directly on your VPS using docker-compose, similar to how Listmonk is deployed. This approach:
- ✅ Avoids Docker Hub image availability issues
- ✅ Builds from latest source code
- ✅ Integrates with Easypanel's Traefik proxy automatically
- ✅ Uses dedicated Postgres + Redis instances for ChatbotX
- ✅ Runs background workers for automation

## Quick Start (5 minutes)

### 1. SSH into your VPS
```bash
ssh root@76.13.126.243
```

### 2. Setup ChatbotX directory
```bash
mkdir -p /opt/chatbotx
cd /opt/chatbotx
git clone https://github.com/ChatbotXIO/ChatbotX.git .
```

### 3. Configure environment
```bash
# Copy the template
cp /path/to/deployment/.env.chatbotx .env

# Edit with your secrets
nano .env
```

Update these values:
- `POSTGRES_PASSWORD` → Strong random password
- `NEXTAUTH_SECRET` → Generate with: `openssl rand -base64 32`
- `JAVASCRIPT_EXECUTOR_TOKEN` → Min 32 random characters  
- `INSTAGRAM_BUSINESS_ACCOUNT_ID` → Your Instagram account ID
- `INSTAGRAM_ACCESS_TOKEN` → Your Meta Graph API token
- `ADMIN_PASSWORD` → Admin login password

### 4. Start services
```bash
cd /opt/chatbotx
docker-compose -f docker-compose.yml up -d
```

Waits ~2-3 minutes for database migrations to complete.

### 5. Verify
```bash
# Check all services are running
docker-compose -f /opt/chatbotx/docker-compose.yml ps

# View logs
docker-compose -f /opt/chatbotx/docker-compose.yml logs -f builder
```

## Access ChatbotX

Once running:
- **URL**: https://chatbotx.casaloti.ia.br
- **Login**: Use admin email and password from `.env`

## Services Started

| Service | Purpose | Status |
|---------|---------|--------|
| **postgres** | Database | Internal, no external port |
| **redis** | Cache & job queue | Internal |
| **filesystem** | File storage (RustFS) | Internal |
| **builder** | Main Next.js UI | Public via Traefik at 3000 |
| **worker** | Background jobs (BullMQ) | Internal |
| **javascript-executor** | Secure script execution | Internal |

## Integration with Desbuguei

Your workflow:
1. **Your app** (`/api/cron/newsroom`): Schedules posts to Instagram ✅ (already working)
2. **ChatbotX**: Automates comment/DM responses to those posts 🚀 (now deployed)
3. **Engagement**: Comments and DMs are collected and processed

## File Locations

- **Main config**: `/opt/chatbotx/.env`
- **Compose file**: `/opt/chatbotx/docker-compose.yml` (from ChatbotX repo)
- **Data volumes**: 
  - Postgres data: `chatbotx-db-data`
  - Redis data: `chatbotx-redis-data`
  - Files: `chatbotx-filesystem-data`

## Troubleshooting

### Services won't start
```bash
docker-compose -f /opt/chatbotx/docker-compose.yml logs
```

### Rebuild (slow, 5-10 min)
```bash
cd /opt/chatbotx
docker-compose -f docker-compose.yml down
docker-compose -f docker-compose.yml build --no-cache
docker-compose -f docker-compose.yml up -d
```

### Update to latest
```bash
cd /opt/chatbotx
git pull origin main
docker-compose -f docker-compose.yml down
docker-compose -f docker-compose.yml build --no-cache
docker-compose -f docker-compose.yml up -d
```

### Completely remove
```bash
cd /opt/chatbotx
docker-compose -f docker-compose.yml down -v  # includes data volumes
rm -rf /opt/chatbotx
```

## Easypanel Cleanup

Remove the old Easypanel ChatbotX services to free resources:
1. In Easypanel UI, delete: `chatbotx-db`, `chatbotx-redis`, `chatbotx`
2. Keep your main `core/web` and `core/worker` services running

## Next Steps

After ChatbotX is running:
1. ✅ Login to https://chatbotx.casaloti.ia.br
2. ✅ Connect your Instagram business account
3. ✅ Set up automation rules (respond to comments/DMs)
4. ✅ Test with a post comment
5. ✅ Monitor logs: `docker-compose -f /opt/chatbotx/docker-compose.yml logs -f worker`
