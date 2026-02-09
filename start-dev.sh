#!/bin/bash
# CLAUDE PUNK Development Server Starter
# Starts backend and frontend in development mode

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Starting CLAUDE PUNK development servers..."
echo "📁 Project root: $PROJECT_ROOT"
echo ""

# Check if backend and frontend directories exist
if [ ! -d "$PROJECT_ROOT/backend" ]; then
  echo "❌ Backend directory not found!"
  exit 1
fi

if [ ! -d "$PROJECT_ROOT/frontend" ]; then
  echo "❌ Frontend directory not found!"
  exit 1
fi

# Kill existing processes on ports 3000 and 5173
echo "🔍 Checking for existing processes..."
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "  ✓ Killed existing backend (port 3000)" || echo "  ✓ Port 3000 is free"
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "  ✓ Killed existing frontend (port 5173)" || echo "  ✓ Port 5173 is free"
echo ""

# Start backend in background
echo "🎯 Starting backend on http://127.0.0.1:3000..."
cd "$PROJECT_ROOT/backend"
npm run dev > /tmp/claude-punk-backend.log 2>&1 &
BACKEND_PID=$!
echo "  ✓ Backend PID: $BACKEND_PID"
echo ""

# Wait a bit for backend to start
sleep 2

# Start frontend in background
echo "🎨 Starting frontend on http://localhost:5173..."
cd "$PROJECT_ROOT/frontend"
npm run dev > /tmp/claude-punk-frontend.log 2>&1 &
FRONTEND_PID=$!
echo "  ✓ Frontend PID: $FRONTEND_PID"
echo ""

# Wait for both to be ready
sleep 3

echo "✅ Both services started!"
echo ""
echo "📊 Status:"
echo "  Backend:  http://127.0.0.1:3000 (PID: $BACKEND_PID)"
echo "  Frontend: http://localhost:5173 (PID: $FRONTEND_PID)"
echo ""
echo "📝 Logs:"
echo "  Backend:  tail -f /tmp/claude-punk-backend.log"
echo "  Frontend: tail -f /tmp/claude-punk-frontend.log"
echo ""
echo "🛑 To stop:"
echo "  kill $BACKEND_PID $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop both services..."
echo ""

# Wait for Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; echo ''; echo '👋 Services stopped'; exit 0" INT TERM

# Keep script running
wait
