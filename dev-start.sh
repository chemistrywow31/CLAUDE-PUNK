#!/bin/bash

echo "🚀 Starting CLAUDE PUNK with dynamic port allocation..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Kill existing processes
echo "🔍 Checking for existing processes..."
if lsof -ti:3000 > /dev/null 2>&1; then
  echo "  ✓ Killed existing backend"
  lsof -ti:3000 | xargs kill -9 2>/dev/null
fi
if lsof -ti:5173 > /dev/null 2>&1; then
  echo "  ✓ Killed existing frontend"
  lsof -ti:5173 | xargs kill -9 2>/dev/null
fi

# Start backend and capture port
echo ""
echo "🎯 Starting backend with dynamic port..."
cd backend
node server.js > /tmp/claude-punk-backend.log 2>&1 &
BACKEND_PID=$!
sleep 2

# Extract port from log
BACKEND_PORT=$(grep "Backend running" /tmp/claude-punk-backend.log | grep -oE '[0-9]+' | tail -1)

if [ -z "$BACKEND_PORT" ]; then
  echo "❌ Failed to start backend"
  exit 1
fi

echo "  ✓ Backend started on port ${BACKEND_PORT} (PID: ${BACKEND_PID})"

# Start frontend with backend URL
echo ""
echo "🎨 Starting frontend..."
cd ../frontend
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}" npm run dev > /tmp/claude-punk-frontend.log 2>&1 &
FRONTEND_PID=$!
sleep 3

echo "  ✓ Frontend started (PID: ${FRONTEND_PID})"

echo ""
echo "✅ Both services started!"
echo ""
echo -e "${BLUE}📊 Status:${NC}"
echo -e "  Backend:  ${GREEN}http://127.0.0.1:${BACKEND_PORT}${NC} (PID: ${BACKEND_PID})"
echo -e "  Frontend: ${GREEN}http://localhost:5173${NC} (PID: ${FRONTEND_PID})"
echo ""
echo -e "${BLUE}📝 Logs:${NC}"
echo "  Backend:  tail -f /tmp/claude-punk-backend.log"
echo "  Frontend: tail -f /tmp/claude-punk-frontend.log"
echo ""
echo -e "${BLUE}🛑 To stop:${NC}"
echo "  kill ${BACKEND_PID} ${FRONTEND_PID}"
echo ""
