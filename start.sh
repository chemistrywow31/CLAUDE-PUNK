#!/bin/bash
# CLAUDE-PUNK - One-click Startup Script
# Starts backend, frontend, and opens browser

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"
BACKEND_LOG="/tmp/claudepunk-backend.log"
FRONTEND_LOG="/tmp/claudepunk-frontend.log"
PID_FILE="/tmp/claudepunk.pid"

echo "🎮 CLAUDE-PUNK - Starting up..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    if [ -f "$PID_FILE" ]; then
        while IFS= read -r pid; do
            if ps -p "$pid" > /dev/null 2>&1; then
                kill "$pid" 2>/dev/null || true
            fi
        done < "$PID_FILE"
        rm -f "$PID_FILE"
    fi
    echo "✅ Cleanup complete"
}

trap cleanup EXIT INT TERM

# Step 1: Check and kill processes using ports 3000 and 5173
echo "🔍 Checking ports..."
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "   Killing processes on port 3000..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

if lsof -ti:5173 > /dev/null 2>&1; then
    echo "   Killing processes on port 5173..."
    lsof -ti:5173 | xargs kill -9 2>/dev/null || true
    sleep 1
fi

# Step 2: Start backend
echo "🚀 Starting backend..."
cd "$BACKEND_DIR"
npm run dev > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$PID_FILE"
echo "   Backend PID: $BACKEND_PID"
echo "   Log: $BACKEND_LOG"

# Step 3: Wait for backend to start
echo "⏳ Waiting for backend..."
for i in {1..10}; do
    if curl -s http://localhost:3000/api/sessions > /dev/null 2>&1; then
        echo "   ✅ Backend ready on http://127.0.0.1:3000"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "   ❌ Backend failed to start. Check logs:"
        tail -20 "$BACKEND_LOG"
        exit 1
    fi
    sleep 1
done

# Step 4: Start frontend
echo "🎨 Starting frontend..."
cd "$FRONTEND_DIR"
npm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" >> "$PID_FILE"
echo "   Frontend PID: $FRONTEND_PID"
echo "   Log: $FRONTEND_LOG"

# Step 5: Wait for frontend to start
echo "⏳ Waiting for frontend..."
for i in {1..15}; do
    if curl -s http://localhost:5173 > /dev/null 2>&1; then
        echo "   ✅ Frontend ready on http://localhost:5173"
        break
    fi
    if [ $i -eq 15 ]; then
        echo "   ❌ Frontend failed to start. Check logs:"
        tail -20 "$FRONTEND_LOG"
        exit 1
    fi
    sleep 1
done

# Step 6: Open browser
echo "🌐 Opening browser..."
sleep 1
if command -v open > /dev/null 2>&1; then
    open http://localhost:5173
elif command -v xdg-open > /dev/null 2>&1; then
    xdg-open http://localhost:5173
else
    echo "   ⚠️  Could not detect browser command"
    echo "   Please open http://localhost:5173 manually"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ CLAUDE-PUNK is running!"
echo ""
echo "📍 Backend:  http://127.0.0.1:3000"
echo "📍 Frontend: http://localhost:5173"
echo "📍 WebSocket: ws://127.0.0.1:3000/ws"
echo ""
echo "📋 Logs:"
echo "   Backend:  tail -f $BACKEND_LOG"
echo "   Frontend: tail -f $FRONTEND_LOG"
echo ""
echo "🛑 To stop: Ctrl+C or run ./stop.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Keep script running
wait
