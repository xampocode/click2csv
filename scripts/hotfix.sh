#!/bin/bash

# Hotfix Management Script
# Usage: ./scripts/hotfix.sh [patch_version]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${RED}🚨 Starting HOTFIX process...${NC}"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Check if working directory is clean
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}❌ Error: Working directory is not clean${NC}"
    echo "Please commit or stash your changes before creating a hotfix"
    exit 1
fi

# Get current production version
echo -e "${YELLOW}📋 Checking current production version...${NC}"
git checkout production
git pull origin production

# Get current version
if [[ -f "package.json" ]]; then
    CURRENT_VERSION=$(node -p "require('./package.json').version")
else
    CURRENT_VERSION=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/v//' || echo "0.0.0")
fi

echo -e "${BLUE}Current production version: ${CURRENT_VERSION}${NC}"

# Create hotfix branch
HOTFIX_BRANCH="hotfix/v${CURRENT_VERSION}-$(date +%s)"
echo -e "${YELLOW}🌿 Creating hotfix branch: ${HOTFIX_BRANCH}${NC}"
git checkout -b "$HOTFIX_BRANCH"

echo -e "${YELLOW}🛠️ Make your hotfix changes now...${NC}"
echo "When you're done, this script will help you:"
echo "1. Run tests"
echo "2. Bump patch version"
echo "3. Update changelog"
echo "4. Deploy to production"
echo "5. Merge back to dev and main"
echo ""
echo -e "${BLUE}Press Enter when you've completed your hotfix changes...${NC}"
read

# Run tests if package.json exists
if [[ -f "package.json" ]]; then
    echo -e "${YELLOW}🧪 Running tests...${NC}"
    npm test || {
        echo -e "${RED}❌ Tests failed! Cannot proceed with hotfix.${NC}"
        exit 1
    }

    echo -e "${YELLOW}🔍 Running security audit...${NC}"
    npm audit --audit-level high || {
        echo -e "${RED}❌ Security vulnerabilities found! Please fix before deploying hotfix.${NC}"
        exit 1
    }
fi

# Bump patch version
if [[ -f "package.json" ]]; then
    echo -e "${YELLOW}📦 Bumping patch version...${NC}"
    npm version patch --no-git-tag-version
    NEW_VERSION=$(node -p "require('./package.json').version")
else
    # Manual version calculation for non-Node.js projects
    IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
    MAJOR=${VERSION_PARTS[0]}
    MINOR=${VERSION_PARTS[1]}
    PATCH=${VERSION_PARTS[2]}
    PATCH=$((PATCH + 1))
    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi

echo -e "${GREEN}Hotfix version: ${NEW_VERSION}${NC}"

# Update CHANGELOG.md
CHANGELOG_FILE="CHANGELOG.md"
if [[ ! -f "$CHANGELOG_FILE" ]]; then
    echo "# Changelog" > "$CHANGELOG_FILE"
    echo "" >> "$CHANGELOG_FILE"
fi

# Add hotfix entry to changelog
DATE=$(date +"%Y-%m-%d")
TEMP_CHANGELOG=$(mktemp)

echo "## [${NEW_VERSION}] - ${DATE} (HOTFIX)" > "$TEMP_CHANGELOG"
echo "" >> "$TEMP_CHANGELOG"
echo "### Fixed" >> "$TEMP_CHANGELOG"
echo "- " >> "$TEMP_CHANGELOG"
echo "" >> "$TEMP_CHANGELOG"

# Insert new entry at the top of existing changelog
if [[ -f "$CHANGELOG_FILE" ]]; then
    cat "$CHANGELOG_FILE" >> "$TEMP_CHANGELOG"
fi

mv "$TEMP_CHANGELOG" "$CHANGELOG_FILE"

echo -e "${YELLOW}📝 Please edit CHANGELOG.md to describe the hotfix...${NC}"

# Open changelog in default editor
if command -v code > /dev/null; then
    code "$CHANGELOG_FILE"
elif command -v nano > /dev/null; then
    nano "$CHANGELOG_FILE"
elif command -v vim > /dev/null; then
    vim "$CHANGELOG_FILE"
fi

read -p "Press Enter when you're done editing the changelog..."

# Commit hotfix changes
git add .
git commit -m "hotfix: v${NEW_VERSION} - critical production fix"

# Switch to production and merge hotfix
echo -e "${YELLOW}🔄 Switching to production and applying hotfix...${NC}"
git checkout production
git merge "$HOTFIX_BRANCH" --no-ff -m "hotfix: merge ${HOTFIX_BRANCH}"

# Push to production (triggers deployment)
echo -e "${RED}🚀 Deploying hotfix to production...${NC}"
git push origin production

# Switch to main and merge
echo -e "${YELLOW}🔄 Updating main branch...${NC}"
git checkout main
git pull origin main
git merge production --no-ff -m "hotfix: v${NEW_VERSION}"

# Create and push tag
echo -e "${YELLOW}🏷️ Creating hotfix tag...${NC}"
git tag -a "v${NEW_VERSION}" -m "Hotfix v${NEW_VERSION}"
git push origin main --tags

# Create GitHub release
if command -v gh > /dev/null; then
    echo -e "${YELLOW}📋 Creating GitHub release...${NC}"

    # Extract changelog for this version
    RELEASE_NOTES=$(awk "/## \[${NEW_VERSION}\]/,/## \[/{if(/## \[${NEW_VERSION}\]/) found=1; else if(/## \[/ && found) exit; else if(found) print}" "$CHANGELOG_FILE" | sed '1d' | sed '$d')

    gh release create "v${NEW_VERSION}" \
        --title "Hotfix v${NEW_VERSION}" \
        --notes "$RELEASE_NOTES" \
        --latest

    echo -e "${GREEN}✅ GitHub release created successfully!${NC}"
fi

# Switch to dev and merge main to sync changes
echo -e "${YELLOW}🔄 Syncing changes back to dev branch...${NC}"
git checkout dev
git pull origin dev
git merge main --no-ff -m "hotfix: sync v${NEW_VERSION} from main"
git push origin dev

# Clean up hotfix branch
echo -e "${YELLOW}🧹 Cleaning up hotfix branch...${NC}"
git branch -d "$HOTFIX_BRANCH"

echo -e "${GREEN}🎉 Hotfix v${NEW_VERSION} deployed successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Hotfix Summary:${NC}"
echo -e "  Version: ${GREEN}v${NEW_VERSION}${NC}"
echo -e "  Type: ${RED}HOTFIX${NC}"
echo -e "  Deployed to: ${GREEN}production${NC}"
echo -e "  Tag: ${GREEN}v${NEW_VERSION}${NC}"
echo ""
echo -e "${RED}⚠️ IMPORTANT: Monitor production closely!${NC}"
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Verify hotfix is working in production"
echo "2. Monitor error rates and metrics"
echo "3. Notify team about the hotfix deployment"
echo "4. Consider if additional testing is needed"