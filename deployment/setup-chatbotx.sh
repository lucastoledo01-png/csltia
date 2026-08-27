#!/bin/bash
set -e

# ChatbotX setup script for VPS deployment
# Usage: bash setup-chatbotx.sh

DEPLOY_DIR="/opt/chatbotx"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================="
echo "ChatbotX VPS Deployment Setup"
echo "========================================="
echo ""

# Check if already deployed
if [ -d "$DEPLOY_DIR" ] && [ -f "$DEPLOY_DIR/.env" ]; then
  echo "⚠️  ChatbotX already deployed at $DEPLOY_DIR"
  echo "To reinstall, run:"
  echo "  rm -rf $DEPLOY_DIR"
  echo "  bash $0"
  exit 1
fi

# Create directory
echo "📁 Creating deployment directory at $DEPLOY_DIR..."
mkdir -p "$DEPLOY_DIR"
cd "$DEPLOY_DIR"

# Clone ChatbotX
echo "📥 Cloning ChatbotX repository..."
if git clone https://github.com/ChatbotXIO/ChatbotX.git .; then
  echo "✅ Repository cloned"
else
  echo "❌ Failed to clone ChatbotX"
  exit 1
fi

# Copy docker-compose file
if [ -f "$SCRIPT_DIR/docker-compose.chatbotx.yml" ]; then
  cp "$SCRIPT_DIR/docker-compose.chatbotx.yml" "$DEPLOY_DIR/docker-compose.yml"
  echo "✅ Docker-compose file copied"
fi

# Create .env from template
if [ -f "$SCRIPT_DIR/.env.chatbotx.template" ]; then
  cp "$SCRIPT_DIR/.env.chatbotx.template" "$DEPLOY_DIR/.env"
  echo "✅ Environment template copied"

  # Generate secure values
  SECURE_PASS=$(openssl rand -base64 20 | tr -d '=+/' | cut -c1-20)
  NEXTAUTH_SECRET=$(openssl rand -base64 32)
  JS_EXECUTOR_TOKEN=$(openssl rand -base64 32)

  # Update .env with generated values
  sed -i "s/CHANGE_ME_STRONG_PASSWORD_REQUIRED/$SECURE_PASS/g" "$DEPLOY_DIR/.env"
  sed -i "s/CHANGE_ME_GENERATE_WITH_openssl_rand_base64_32/$NEXTAUTH_SECRET/g" "$DEPLOY_DIR/.env"
  sed -i "s/CHANGE_ME_MIN_32_RANDOM_CHARACTERS_SECURE_TOKEN/$JS_EXECUTOR_TOKEN/g" "$DEPLOY_DIR/.env"

  echo "✅ Generated secure passwords"
fi

echo ""
echo "========================================="
echo "✅ Setup complete! Next steps:"
echo "========================================="
echo ""
echo "1️⃣  Edit environment configuration:"
echo "   nano $DEPLOY_DIR/.env"
echo ""
echo "   Required updates:"
echo "   - INSTAGRAM_BUSINESS_ACCOUNT_ID (your Instagram ID)"
echo "   - INSTAGRAM_ACCESS_TOKEN (Meta API token)"
echo "   - ADMIN_EMAIL (login email)"
echo ""
echo "2️⃣  Start ChatbotX services (takes 2-3 minutes):"
echo "   cd $DEPLOY_DIR"
echo "   docker-compose -f docker-compose.yml up -d"
echo ""
echo "3️⃣  Verify services are running:"
echo "   docker-compose -f $DEPLOY_DIR/docker-compose.yml ps"
echo ""
echo "4️⃣  Check logs for startup:"
echo "   docker-compose -f $DEPLOY_DIR/docker-compose.yml logs -f builder"
echo ""
echo "5️⃣  Once ready, access:"
echo "   https://chatbotx.casaloti.ia.br"
echo ""
echo "For more information:"
echo "   cat $SCRIPT_DIR/../docs/CHATBOTX_DEPLOYMENT.md"
echo "========================================="
