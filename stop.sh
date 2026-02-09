#!/bin/bash
# CLAUDE-PUNK - Stop Script
# Stops backend and frontend processes

PID_FILE="/tmp/claudepunk.pid"

echo "🛑 Stopping CLAUDE-PUNK..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "$PID_FILE" ]; then
    echo "⚠️  No PID file found at $PID_FILE"
    echo "   Attempting to kill processes on ports 3000 and 5173..."

    if lsof -ti:3000 > /dev/null 2>&1; then
        echo "   Killing processes on port 3000..."
        lsof -ti:3000 | xargs kill 2>/dev/null || true
    fi

    if lsof -ti:5173 > /dev/null 2>&1; then
        echo "   Killing processes on port 5173..."
        lsof -ti:5173 | xargs kill 2>/dev/null || true
    fi
else
    while IFS= read -r pid; do
        if ps -p "$pid" > /dev/null 2>&1; then
            echo "   Stopping PID $pid..."
            kill "$pid" 2>/dev/null || true
        else
            echo "   PID $pid already stopped"
        fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
fi

sleep 1

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ CLAUDE-PUNK stopped"
