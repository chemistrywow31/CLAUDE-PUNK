#!/bin/bash
# CLAUDE PUNK - 建置驗證腳本
# 檢查打包後的應用結構是否正確

set -e

APP_PATH="/Applications/CLAUDE PUNK.app"
RESOURCES_PATH="$APP_PATH/Contents/Resources"

echo "🔍 驗證 CLAUDE PUNK 打包結果..."
echo ""

# 檢查應用是否安裝
if [ ! -d "$APP_PATH" ]; then
    echo "❌ 應用未安裝在 /Applications/"
    echo "   請先安裝 DMG"
    exit 1
fi

echo "✅ 應用已安裝: $APP_PATH"
echo ""

# 檢查 Resources 目錄
echo "📁 檢查 Resources 目錄結構..."
if [ ! -d "$RESOURCES_PATH" ]; then
    echo "❌ Resources 目錄不存在"
    exit 1
fi

# 檢查 backend
if [ ! -d "$RESOURCES_PATH/backend" ]; then
    echo "❌ backend 目錄不存在"
    echo "   可能仍然在 app.asar 內部！"
    exit 1
else
    echo "✅ backend/ 存在於 Resources 外部"
fi

# 檢查 backend/node_modules
if [ ! -d "$RESOURCES_PATH/backend/node_modules" ]; then
    echo "❌ backend/node_modules 不存在"
    exit 1
else
    BACKEND_SIZE=$(du -sh "$RESOURCES_PATH/backend/node_modules" | awk '{print $1}')
    echo "✅ backend/node_modules 已打包 ($BACKEND_SIZE)"
fi

# 檢查 frontend
if [ ! -d "$RESOURCES_PATH/frontend" ]; then
    echo "❌ frontend 目錄不存在"
    echo "   可能仍然在 app.asar 內部！"
    exit 1
else
    echo "✅ frontend/ 存在於 Resources 外部"
fi

# 檢查 frontend/node_modules
if [ ! -d "$RESOURCES_PATH/frontend/node_modules" ]; then
    echo "❌ frontend/node_modules 不存在"
    exit 1
else
    FRONTEND_SIZE=$(du -sh "$RESOURCES_PATH/frontend/node_modules" | awk '{print $1}')
    echo "✅ frontend/node_modules 已打包 ($FRONTEND_SIZE)"
fi

echo ""
echo "📊 完整結構："
ls -lh "$RESOURCES_PATH" | grep -E "backend|frontend|app.asar"

echo ""
echo "🎉 所有檢查通過！打包結構正確。"
echo ""
echo "💡 接下來："
echo "   1. 啟動應用: open -a 'CLAUDE PUNK'"
echo "   2. 查看日誌: tail -f ~/Library/Logs/CLAUDE\\ PUNK/main.log"
echo "   3. 應該看到 backend 和 frontend 都成功啟動"
echo "   4. 不應該再有 'spawn ENOTDIR' 錯誤"
