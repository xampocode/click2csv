#!/bin/bash

# Release Management Script
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default version bump
VERSION_TYPE=${1:-patch}

echo -e "${BLUE}🚀 Starting release process...${NC}"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not in a git repository${NC}"
    exit 1
fi

# Check if working directory is clean
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}❌ Error: Working directory is not clean${NC}"
    echo "Please commit or stash your changes before releasing"
    exit 1
fi

# Check if we're on the dev branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "dev" ]]; then
    echo -e "${RED}❌ Error: Must be on 'dev' branch to create a release${NC}"
    echo "Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Pull latest changes
echo -e "${YELLOW}📥 Pulling latest changes...${NC}"
git pull origin dev

# Run tests if package.json exists
if [[ -f "package.json" ]]; then
    echo -e "${YELLOW}🧪 Running tests...${NC}"
    npm test || {
        echo -e "${RED}❌ Tests failed! Cannot proceed with release.${NC}"
        exit 1
    }

    echo -e "${YELLOW}🔍 Running security audit...${NC}"
    npm audit --audit-level high || {
        echo -e "${RED}❌ Security vulnerabilities found! Please fix before releasing.${NC}"
        exit 1
    }
fi

# Get current version
if [[ -f "package.json" ]]; then
    CURRENT_VERSION=$(node -p "require('./package.json').version")
else
    # Try to get version from git tags
    CURRENT_VERSION=$(git describe --tags --abbrev=0 2>/dev/null | sed 's/v//' || echo "0.0.0")
fi

echo -e "${BLUE}Current version: ${CURRENT_VERSION}${NC}"

# Bump version
if [[ -f "package.json" ]]; then
    echo -e "${YELLOW}📦 Bumping version (${VERSION_TYPE})...${NC}"
    npm version $VERSION_TYPE --no-git-tag-version
    NEW_VERSION=$(node -p "require('./package.json').version")
else
    # Manual version calculation for non-Node.js projects
    IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
    MAJOR=${VERSION_PARTS[0]}
    MINOR=${VERSION_PARTS[1]}
    PATCH=${VERSION_PARTS[2]}

    case $VERSION_TYPE in
        major)
            MAJOR=$((MAJOR + 1))
            MINOR=0
            PATCH=0
            ;;
        minor)
            MINOR=$((MINOR + 1))
            PATCH=0
            ;;
        patch)
            PATCH=$((PATCH + 1))
            ;;
    esac

    NEW_VERSION="$MAJOR.$MINOR.$PATCH"
fi

echo -e "${GREEN}New version: ${NEW_VERSION}${NC}"

# Update CHANGELOG.md
CHANGELOG_FILE="CHANGELOG.md"
if [[ ! -f "$CHANGELOG_FILE" ]]; then
    echo "# Changelog" > "$CHANGELOG_FILE"
    echo "" >> "$CHANGELOG_FILE"
    echo "All notable changes to this project will be documented in this file." >> "$CHANGELOG_FILE"
    echo "" >> "$CHANGELOG_FILE"
fi

# Add new version entry to changelog
DATE=$(date +"%Y-%m-%d")
TEMP_CHANGELOG=$(mktemp)

echo "## [${NEW_VERSION}] - ${DATE}" > "$TEMP_CHANGELOG"
echo "" >> "$TEMP_CHANGELOG"
echo "### Added" >> "$TEMP_CHANGELOG"
echo "- " >> "$TEMP_CHANGELOG"
echo "" >> "$TEMP_CHANGELOG"
echo "### Changed" >> "$TEMP_CHANGELOG"
echo "- " >> "$TEMP_CHANGELOG"
echo "" >> "$TEMP_CHANGELOG"
echo "### Fixed" >> "$TEMP_CHANGELOG"
echo "- " >> "$TEMP_CHANGELOG"
echo "" >> "$TEMP_CHANGELOG"

# Insert new entry at the top of existing changelog
if [[ -f "$CHANGELOG_FILE" ]]; then
    cat "$CHANGELOG_FILE" >> "$TEMP_CHANGELOG"
fi

mv "$TEMP_CHANGELOG" "$CHANGELOG_FILE"

echo -e "${YELLOW}📝 Please edit CHANGELOG.md to add release notes...${NC}"
echo "Press Enter when you're done editing the changelog..."

# Open changelog in default editor
if command -v code > /dev/null; then
    code "$CHANGELOG_FILE"
elif command -v nano > /dev/null; then
    nano "$CHANGELOG_FILE"
elif command -v vim > /dev/null; then
    vim "$CHANGELOG_FILE"
fi

read -p "Press Enter to continue..."

# Commit version bump and changelog
git add .
git commit -m "chore: bump version to v${NEW_VERSION}"

# Switch to production branch
echo -e "${YELLOW}🔄 Switching to production branch...${NC}"
git checkout production
git pull origin production

# Merge dev into production
echo -e "${YELLOW}🔀 Merging dev into production...${NC}"
git merge dev --no-ff -m "release: merge dev for v${NEW_VERSION}"

# Push to production (this triggers deployment)
echo -e "${YELLOW}🚀 Pushing to production...${NC}"
git push origin production

# Switch to main branch
echo -e "${YELLOW}🔄 Switching to main branch...${NC}"
git checkout main
git pull origin main

# Merge production into main
echo -e "${YELLOW}🔀 Merging production into main...${NC}"
git merge production --no-ff -m "release: v${NEW_VERSION}"

# Create and push tag
echo -e "${YELLOW}🏷️ Creating release tag...${NC}"
git tag -a "v${NEW_VERSION}" -m "Release v${NEW_VERSION}"
git push origin main --tags

# Create GitHub release
if command -v gh > /dev/null; then
    echo -e "${YELLOW}📋 Creating GitHub release...${NC}"

    # Extract changelog for this version
    RELEASE_NOTES=$(awk "/## \[${NEW_VERSION}\]/,/## \[/{if(/## \[${NEW_VERSION}\]/) found=1; else if(/## \[/ && found) exit; else if(found) print}" "$CHANGELOG_FILE" | sed '1d' | sed '$d')

    gh release create "v${NEW_VERSION}" \
        --title "Release v${NEW_VERSION}" \
        --notes "$RELEASE_NOTES" \
        --latest

    echo -e "${GREEN}✅ GitHub release created successfully!${NC}"
else
    echo -e "${YELLOW}⚠️ GitHub CLI not found. Please create the release manually at:${NC}"
    echo "https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^/]*\/[^/]*\).*/\1/' | sed 's/\.git$//')/releases/new?tag=v${NEW_VERSION}"
fi

# Switch back to dev branch
echo -e "${YELLOW}🔄 Switching back to dev branch...${NC}"
git checkout dev

# Merge main back to dev to sync version changes
git merge main --no-ff -m "chore: sync version changes from main"
git push origin dev

echo -e "${GREEN}🎉 Release v${NEW_VERSION} completed successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Release Summary:${NC}"
echo -e "  Version: ${GREEN}v${NEW_VERSION}${NC}"
echo -e "  Branch: ${GREEN}production${NC} (deployed)"
echo -e "  Tag: ${GREEN}v${NEW_VERSION}${NC} (created)"
echo -e "  Changelog: ${GREEN}Updated${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Monitor deployment status"
echo "2. Verify the release in production"
echo "3. Update documentation if needed"
echo "4. Notify team about the release"