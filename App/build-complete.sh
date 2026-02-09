#!/bin/bash
# ════════════════════════════════════════════════════════════════════════════
# CLAUDE PUNK - Complete Build Pipeline
# ════════════════════════════════════════════════════════════════════════════
#
# This script performs a complete build of the CLAUDE PUNK macOS application:
# 1. ✅ Dependency verification & installation
# 2. ✅ Frontend production build
# 3. ✅ Electron app packaging
# 4. ✅ Build verification
#
# Usage:
#   ./build-complete.sh           # Full build
#   ./build-complete.sh --skip-deps   # Skip dependency installation
#   ./build-complete.sh --clean       # Clean build (remove node_modules first)
#
# ════════════════════════════════════════════════════════════════════════════

set -e  # Exit on error

# ──── Color Codes ───────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ──── Helper Functions ──────────────────────────────────────────────────────

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[⚠]${NC} $1"
}

log_error() {
  echo -e "${RED}[✗]${NC} $1"
}

log_section() {
  echo ""
  echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE} $1${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
  echo ""
}

# ──── Parse Arguments ───────────────────────────────────────────────────────

SKIP_DEPS=false
CLEAN_BUILD=false

for arg in "$@"; do
  case $arg in
    --skip-deps)
      SKIP_DEPS=true
      shift
      ;;
    --clean)
      CLEAN_BUILD=true
      shift
      ;;
    *)
      log_error "Unknown argument: $arg"
      echo "Usage: ./build-complete.sh [--skip-deps] [--clean]"
      exit 1
      ;;
  esac
done

# ──── Project Paths ─────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$SCRIPT_DIR"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

log_info "Project root: $PROJECT_ROOT"
log_info "App directory: $APP_DIR"

# ──── Verification ──────────────────────────────────────────────────────────

log_section "Step 0: Environment Verification"

# Check Node.js
if ! command -v node &> /dev/null; then
  log_error "Node.js not found! Please install Node.js 18+ first."
  exit 1
fi

NODE_VERSION=$(node --version)
log_success "Node.js $NODE_VERSION"

# Check npm
if ! command -v npm &> /dev/null; then
  log_error "npm not found! Please install npm first."
  exit 1
fi

NPM_VERSION=$(npm --version)
log_success "npm $NPM_VERSION"

# Verify directories
if [ ! -d "$BACKEND_DIR" ]; then
  log_error "Backend directory not found: $BACKEND_DIR"
  exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
  log_error "Frontend directory not found: $FRONTEND_DIR"
  exit 1
fi

log_success "All directories verified"

# ──── Clean Build (Optional) ────────────────────────────────────────────────

if [ "$CLEAN_BUILD" = true ]; then
  log_section "Clean Build: Removing node_modules"

  log_info "Removing App/node_modules..."
  rm -rf "$APP_DIR/node_modules"

  log_info "Removing backend/node_modules..."
  rm -rf "$BACKEND_DIR/node_modules"

  log_info "Removing frontend/node_modules..."
  rm -rf "$FRONTEND_DIR/node_modules"

  log_info "Removing frontend/dist..."
  rm -rf "$FRONTEND_DIR/dist"

  log_success "Clean complete"
fi

# ──── Step 1: Install Dependencies ──────────────────────────────────────────

if [ "$SKIP_DEPS" = false ]; then
  log_section "Step 1: Installing Dependencies"

  # Install App dependencies (Electron + electron-builder)
  log_info "Installing App dependencies..."
  cd "$APP_DIR"
  npm install
  log_success "App dependencies installed"

  # Install backend dependencies
  log_info "Installing backend dependencies..."
  cd "$BACKEND_DIR"
  npm install
  log_success "Backend dependencies installed"

  # Install frontend dependencies
  log_info "Installing frontend dependencies..."
  cd "$FRONTEND_DIR"
  npm install
  log_success "Frontend dependencies installed"

else
  log_section "Step 1: Skipping Dependency Installation"
  log_warning "Using existing node_modules (--skip-deps flag)"
fi

# ──── Step 2: Build Frontend ────────────────────────────────────────────────

log_section "Step 2: Building Frontend (Production)"

cd "$FRONTEND_DIR"

log_info "Running: npm run build"
npm run build

if [ ! -d "$FRONTEND_DIR/dist" ]; then
  log_error "Frontend build failed! dist/ directory not found."
  exit 1
fi

log_success "Frontend built successfully"
log_info "Output: $FRONTEND_DIR/dist"

# ──── Step 3: Generate Version ──────────────────────────────────────────────

log_section "Step 3: Generating Version Number"

cd "$APP_DIR"

if [ -f "./scripts/generate-version.sh" ]; then
  ./scripts/generate-version.sh
  VERSION=$(cat electron/version.js 2>/dev/null | grep -oE '[0-9]{4}\.[0-9]{2}\.[0-9]{2}\.[0-9]{4}' || echo "unknown")
  log_success "Version: $VERSION"
else
  log_warning "Version script not found, using package.json version"
fi

# ──── Step 4: Package Electron App ──────────────────────────────────────────

log_section "Step 4: Packaging Electron App"

cd "$APP_DIR"

log_info "Running: npm run build (electron-builder)"
npm run build

# ──── Step 5: Verify Build ──────────────────────────────────────────────────

log_section "Step 5: Build Verification"

OUT_DIR="$APP_DIR/out"

if [ ! -d "$OUT_DIR" ]; then
  log_error "Build output directory not found: $OUT_DIR"
  exit 1
fi

# Find .dmg file
DMG_FILE=$(find "$OUT_DIR" -name "*.dmg" -type f | head -1)

if [ -z "$DMG_FILE" ]; then
  log_error "No .dmg file found in $OUT_DIR"
  exit 1
fi

DMG_SIZE=$(du -h "$DMG_FILE" | cut -f1)
log_success "DMG created: $(basename "$DMG_FILE") ($DMG_SIZE)"

# Find .app bundle
APP_BUNDLE=$(find "$OUT_DIR" -name "*.app" -type d | head -1)

if [ -n "$APP_BUNDLE" ]; then
  APP_SIZE=$(du -sh "$APP_BUNDLE" | cut -f1)
  log_success "App bundle: $(basename "$APP_BUNDLE") ($APP_SIZE)"
fi

# ──── Summary ───────────────────────────────────────────────────────────────

log_section "✅ Build Complete!"

echo "Output files:"
echo "  DMG: $DMG_FILE"
if [ -n "$APP_BUNDLE" ]; then
  echo "  App: $APP_BUNDLE"
fi
echo ""
echo "Next steps:"
echo "  1. Test the app: open \"$DMG_FILE\""
echo "  2. Install: Drag CLAUDE PUNK.app to /Applications"
echo "  3. Run: Double-click CLAUDE PUNK in Applications"
echo ""
log_success "All done! 🎉"
