#!/bin/bash

# Deployment Management Script
# Usage: ./scripts/deploy.sh [staging|production] [project_path]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ENVIRONMENT=${1:-staging}
PROJECT_PATH=${2:-$(pwd)}

echo -e "${BLUE}🚀 Starting deployment to ${ENVIRONMENT}...${NC}"

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    echo -e "${RED}❌ Error: Environment must be 'staging' or 'production'${NC}"
    exit 1
fi

# Change to project directory
cd "$PROJECT_PATH"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Get project name
PROJECT_NAME=$(basename "$PROJECT_PATH")
echo -e "${BLUE}Project: ${PROJECT_NAME}${NC}"
echo -e "${BLUE}Environment: ${ENVIRONMENT}${NC}"

# Load environment variables
ENV_FILE=".env.${ENVIRONMENT}"
if [[ -f "$ENV_FILE" ]]; then
    echo -e "${YELLOW}📄 Loading environment variables from ${ENV_FILE}${NC}"
    set -a
    source "$ENV_FILE"
    set +a
else
    echo -e "${YELLOW}⚠️ No environment file found: ${ENV_FILE}${NC}"
fi

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)
REQUIRED_BRANCH="dev"

if [[ "$ENVIRONMENT" == "production" ]]; then
    REQUIRED_BRANCH="production"
fi

if [[ "$CURRENT_BRANCH" != "$REQUIRED_BRANCH" ]]; then
    echo -e "${YELLOW}⚠️ Warning: Current branch is '${CURRENT_BRANCH}', but ${ENVIRONMENT} deploys from '${REQUIRED_BRANCH}'${NC}"
    echo -e "${BLUE}Switching to ${REQUIRED_BRANCH} branch...${NC}"
    git checkout "$REQUIRED_BRANCH"
    git pull origin "$REQUIRED_BRANCH"
fi

# Check if working directory is clean
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}❌ Error: Working directory is not clean${NC}"
    echo "Please commit or stash your changes before deploying"
    exit 1
fi

# Pre-deployment checks
echo -e "${YELLOW}🔍 Running pre-deployment checks...${NC}"

# Check if package.json exists (Node.js project)
if [[ -f "package.json" ]]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm ci

    echo -e "${YELLOW}🧪 Running tests...${NC}"
    npm test || {
        echo -e "${RED}❌ Tests failed! Deployment aborted.${NC}"
        exit 1
    }

    echo -e "${YELLOW}🔍 Running linting...${NC}"
    npm run lint --if-present || echo "No linting configured"

    echo -e "${YELLOW}🔒 Running security audit...${NC}"
    npm audit --audit-level high || {
        if [[ "$ENVIRONMENT" == "production" ]]; then
            echo -e "${RED}❌ Security vulnerabilities found! Production deployment aborted.${NC}"
            exit 1
        else
            echo -e "${YELLOW}⚠️ Security vulnerabilities found but continuing with staging deployment${NC}"
        fi
    }

    echo -e "${YELLOW}🏗️ Building project...${NC}"
    npm run build --if-present || echo "No build script configured"
fi

# Get deployment information
COMMIT_SHA=$(git rev-parse HEAD)
COMMIT_SHORT_SHA=${COMMIT_SHA:0:7}
DEPLOY_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
VERSION=$(cat package.json 2>/dev/null | grep '"version"' | cut -d'"' -f4 || git describe --tags --abbrev=0 2>/dev/null || echo "unknown")

echo -e "${BLUE}📊 Deployment Information:${NC}"
echo -e "  Version: ${GREEN}${VERSION}${NC}"
echo -e "  Commit: ${GREEN}${COMMIT_SHORT_SHA}${NC}"
echo -e "  Branch: ${GREEN}${CURRENT_BRANCH}${NC}"
echo -e "  Time: ${GREEN}${DEPLOY_TIME}${NC}"

# Create deployment manifest
MANIFEST_FILE="deployment-manifest.json"
cat > "$MANIFEST_FILE" << EOF
{
  "project": "$PROJECT_NAME",
  "environment": "$ENVIRONMENT",
  "version": "$VERSION",
  "commit": "$COMMIT_SHA",
  "commitShort": "$COMMIT_SHORT_SHA",
  "branch": "$CURRENT_BRANCH",
  "deployTime": "$DEPLOY_TIME",
  "deployedBy": "$(git config user.name)",
  "nodeVersion": "$(node --version 2>/dev/null || echo 'N/A')",
  "npmVersion": "$(npm --version 2>/dev/null || echo 'N/A')"
}
EOF

echo -e "${YELLOW}📋 Created deployment manifest${NC}"

# Environment-specific deployment
case "$ENVIRONMENT" in
    "staging")
        echo -e "${YELLOW}🚀 Deploying to staging environment...${NC}"

        # Netlify deployment for staging
        if command -v netlify > /dev/null && [[ -n "$NETLIFY_SITE_ID" ]]; then
            echo -e "${YELLOW}📡 Deploying to Netlify staging...${NC}"
            netlify deploy --dir=./web-version --site="$NETLIFY_SITE_ID" --alias="staging-${COMMIT_SHORT_SHA}"

            STAGING_URL="https://staging-${COMMIT_SHORT_SHA}--${NETLIFY_SITE_ID}.netlify.app"
            echo -e "${GREEN}✅ Staging deployed: ${STAGING_URL}${NC}"
        else
            echo -e "${YELLOW}⚠️ Netlify not configured for staging deployment${NC}"
        fi
        ;;

    "production")
        echo -e "${RED}🚨 PRODUCTION DEPLOYMENT${NC}"
        echo -e "${YELLOW}This will deploy to the live production environment${NC}"
        echo -e "${BLUE}Deployment details:${NC}"
        echo -e "  Project: ${PROJECT_NAME}"
        echo -e "  Version: ${VERSION}"
        echo -e "  Commit: ${COMMIT_SHORT_SHA}"
        echo ""
        read -p "Are you sure you want to proceed? (yes/no): " CONFIRM

        if [[ "$CONFIRM" != "yes" ]]; then
            echo -e "${YELLOW}❌ Production deployment cancelled${NC}"
            exit 0
        fi

        echo -e "${RED}🚀 Deploying to production environment...${NC}"

        # Netlify deployment for production
        if command -v netlify > /dev/null && [[ -n "$NETLIFY_SITE_ID" ]]; then
            echo -e "${YELLOW}📡 Deploying to Netlify production...${NC}"
            netlify deploy --dir=./web-version --site="$NETLIFY_SITE_ID" --prod

            echo -e "${GREEN}✅ Production deployment completed${NC}"
        else
            echo -e "${YELLOW}⚠️ Netlify not configured for production deployment${NC}"
        fi

        # Create production deployment tag
        DEPLOY_TAG="deploy-${ENVIRONMENT}-${COMMIT_SHORT_SHA}-$(date +%s)"
        git tag -a "$DEPLOY_TAG" -m "Production deployment: ${VERSION} at ${DEPLOY_TIME}"
        git push origin "$DEPLOY_TAG"

        echo -e "${GREEN}🏷️ Created deployment tag: ${DEPLOY_TAG}${NC}"
        ;;
esac

# Post-deployment checks
echo -e "${YELLOW}🔍 Running post-deployment checks...${NC}"

# Health check (if URL is available)
if [[ -n "$HEALTH_CHECK_URL" ]]; then
    echo -e "${YELLOW}❤️ Checking application health...${NC}"

    # Wait a moment for deployment to stabilize
    sleep 10

    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_CHECK_URL" || echo "000")

    if [[ "$HTTP_STATUS" == "200" ]]; then
        echo -e "${GREEN}✅ Health check passed (HTTP $HTTP_STATUS)${NC}"
    else
        echo -e "${RED}❌ Health check failed (HTTP $HTTP_STATUS)${NC}"

        if [[ "$ENVIRONMENT" == "production" ]]; then
            echo -e "${RED}🚨 Production health check failed! Manual verification required.${NC}"
            exit 1
        fi
    fi
fi

# Update deployment log
DEPLOY_LOG="deployments.log"
echo "${DEPLOY_TIME} | ${ENVIRONMENT} | ${PROJECT_NAME} | ${VERSION} | ${COMMIT_SHORT_SHA} | $(git config user.name)" >> "$DEPLOY_LOG"

# Cleanup
rm -f "$MANIFEST_FILE"

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Deployment Summary:${NC}"
echo -e "  Project: ${GREEN}${PROJECT_NAME}${NC}"
echo -e "  Environment: ${GREEN}${ENVIRONMENT}${NC}"
echo -e "  Version: ${GREEN}${VERSION}${NC}"
echo -e "  Commit: ${GREEN}${COMMIT_SHORT_SHA}${NC}"
echo -e "  Time: ${GREEN}${DEPLOY_TIME}${NC}"
echo ""

if [[ "$ENVIRONMENT" == "staging" && -n "$STAGING_URL" ]]; then
    echo -e "${BLUE}🔗 Staging URL: ${STAGING_URL}${NC}"
fi

echo -e "${YELLOW}Next steps:${NC}"
echo "1. Monitor application metrics"
echo "2. Verify functionality works as expected"
echo "3. Check error logs for any issues"
if [[ "$ENVIRONMENT" == "production" ]]; then
    echo "4. Notify team about production deployment"
    echo "5. Monitor user feedback and support channels"
fi