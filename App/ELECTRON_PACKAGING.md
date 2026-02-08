# CLAUDE PUNK - macOS App 打包指南

本文件說明如何將 CLAUDE PUNK 打包成獨立的 macOS 應用程式 (.dmg)。

---

## 📋 目錄

1. [打包概述](#打包概述)
2. [系統需求](#系統需求)
3. [依賴安裝](#依賴安裝)
4. [版號機制](#版號機制)
5. [打包流程](#打包流程)
6. [安裝與使用](#安裝與使用)
7. [問題排除](#問題排除)
8. [進階設定](#進階設定)

---

## 打包概述

CLAUDE PUNK 使用 Electron 將前後端服務包裝成原生 macOS 應用程式。

### 核心特性

- ✅ **自動啟動服務** - App 啟動時自動 spawn 後端和前端子程序
- ✅ **智能 Port 檢測** - 自動偵測 port 是否已被佔用，避免重複啟動
- ✅ **程序管理** - 完整的服務生命週期管理（start/stop/restart）
- ✅ **優雅關閉** - App 退出時自動清理所有子程序
- ✅ **版號自動生成** - 根據 Git commit 時間自動生成版號

### 架構說明

```
┌─────────────────────────────────────────────────┐
│         Electron Main Process                   │
│  ┌──────────────┐      ┌──────────────┐        │
│  │ Backend Fork │      │ Frontend Fork│        │
│  │ (server.js)  │      │ (Vite dev)   │        │
│  │ Port: 3000   │      │ Port: 5173   │        │
│  └──────────────┘      └──────────────┘        │
└─────────────────────────────────────────────────┘
         ↓                       ↓
┌────────────────────┐  ┌────────────────────┐
│  BrowserWindow     │  │  External Browser  │
│  (Electron)        │  │  (Optional)        │
│  http://127.0.0.1: │  │  http://127.0.0.1: │
│  5173              │  │  5173              │
└────────────────────┘  └────────────────────┘
```

---

## 系統需求

### 開發環境

- **macOS**: 12.0+ (Monterey 或更新版本)
- **Node.js**: 18.x 或更新版本
- **npm**: 8.x 或更新版本
- **Git**: 任何版本
- **Xcode Command Line Tools**: 用於 iconutil（製作圖示時需要）

### 驗證安裝

```bash
node --version    # 應顯示 v18.x.x 或更新
npm --version     # 應顯示 8.x.x 或更新
git --version     # 確認已安裝
```

---

## 依賴安裝

### 1. 安裝專案依賴

```bash
# 安裝根目錄依賴（包含 Electron 和 electron-builder）
npm install

# 安裝後端依賴
cd backend && npm install && cd ..

# 安裝前端依賴
cd frontend && npm install && cd ..
```

### 2. 關鍵依賴說明

#### 根目錄 (package.json)

```json
{
  "dependencies": {
    "electron-store": "^8.1.0",    // 配置管理
    "electron-log": "^5.0.0"       // 日誌記錄
  },
  "devDependencies": {
    "electron": "^28.0.0",         // Electron 框架
    "electron-builder": "^24.9.1", // 打包工具
    "concurrently": "^9.0.0"       // 開發用（並行啟動）
  }
}
```

#### macOS 特定依賴

- **node-pty**: 終端模擬（需要 JIT 權限）
- **entitlements.mac.plist**: macOS 權限設定

---

## 版號機制

### 自動版號生成

版號自動從 Git commit 時間生成，格式：`YYYY.MM.DD.HHMM`

#### 版號生成腳本

`scripts/generate-version.sh`:

```bash
#!/bin/bash
# 從最新 commit 時間生成版號
COMMIT_DATE=$(git log -1 --format="%ci")
YEAR=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%Y")
MONTH=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%m")
DAY=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%d")
HOUR=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%H")
MINUTE=$(date -j -f "%Y-%m-%d %H:%M:%S %z" "$COMMIT_DATE" "+%M")
VERSION="${YEAR}.${MONTH}.${DAY}.${HOUR}${MINUTE}"
echo "$VERSION"
```

#### 版號使用

- **package.json**: 手動或自動更新 `version` 欄位
- **DMG 檔名**: `CLAUDE PUNK-{version}-arm64.dmg`
- **App 關於頁面**: 顯示當前版本

#### 手動生成版號

```bash
./scripts/generate-version.sh
# 輸出: 2026.02.08.2205
```

---

## 打包流程

### 快速打包（一鍵執行）

```bash
npm run build
```

這會自動執行：
1. `prebuild` - 生成版號
2. `build` - 執行 electron-builder 打包

### 詳細步驟說明

#### Step 1: 準備打包

```bash
# 確保在正確分支
git checkout feature/electron-macos-packaging

# 確保依賴已安裝
npm install

# 確認後端和前端依賴
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

#### Step 2: 生成版號（自動）

打包時會自動執行 `prebuild` hook：

```bash
npm run build:version
# 生成版號並顯示
```

#### Step 3: 執行打包

```bash
npm run build
```

**打包過程**：
1. 下載 Electron 二進位檔（首次約 95 MB）
2. 打包應用程式到 `out/mac-arm64/`
3. 建立 DMG 安裝檔
4. 生成 blockmap 用於增量更新

#### Step 4: 驗證輸出

```bash
ls -lh out/
# 應該看到：
# CLAUDE PUNK-{version}-arm64.dmg      (~123 MB)
# CLAUDE PUNK-{version}-arm64.dmg.blockmap
# builder-debug.yml
# latest-mac.yml
```

---

## 安裝與使用

### 安裝 DMG

1. **掛載 DMG**：
   ```bash
   open "out/CLAUDE PUNK-{version}-arm64.dmg"
   ```

2. **拖曳安裝**：
   - 將 "CLAUDE PUNK.app" 拖曳到 "Applications" 資料夾

3. **首次啟動**：
   - macOS 會提示「從網路下載的應用程式」
   - 右鍵點擊 App → 選擇「開啟」
   - 或在「系統偏好設定 > 安全性與隱私」中允許

### 日常使用

#### 啟動 App

```bash
# 方式 1: 從 Launchpad 或 Applications 資料夾雙擊
# 方式 2: 從終端啟動（開發測試用）
open "/Applications/CLAUDE PUNK.app"
```

**啟動流程**：
1. App 自動檢查 port 3000 和 5173
2. 如果 port 未佔用，自動啟動後端和前端服務
3. 如果 port 已佔用，重用現有服務
4. 開啟遊戲視窗

#### 快捷鍵

- `Cmd+,` - 開啟設定
- `Cmd+Shift+R` - 重啟服務
- `Cmd+R` - 重新載入視窗
- `Cmd+Q` - 退出（自動清理所有服務）

#### 查看日誌

```bash
# 方式 1: 從選單
Help > View Logs

# 方式 2: 直接開啟
open "~/Library/Logs/CLAUDE PUNK/main.log"
```

### 解除安裝

```bash
# 1. 刪除應用程式
rm -rf "/Applications/CLAUDE PUNK.app"

# 2. 刪除配置檔案（可選）
rm -rf ~/Library/Application\ Support/CLAUDE\ PUNK

# 3. 刪除日誌檔案（可選）
rm -rf ~/Library/Logs/CLAUDE\ PUNK
```

---

## 問題排除

### 常見問題

#### 1. 打包失敗：「Cannot find module 'electron'」

**原因**: Electron 未安裝

**解決方案**:
```bash
npm install
```

#### 2. 打包失敗：「node-pty 編譯錯誤」

**原因**: node-pty 需要原生編譯

**解決方案**:
```bash
# 重新編譯 native modules
cd backend
npm rebuild node-pty
cd ..
```

#### 3. 啟動失敗：「Services failed to start」

**原因**: Port 被其他程式佔用或依賴未安裝

**診斷步驟**:
```bash
# 檢查 port 是否被佔用
lsof -i :3000
lsof -i :5173

# 查看日誌
tail -50 ~/Library/Logs/CLAUDE\ PUNK/main.log

# 確認依賴已安裝
cd backend && npm list
cd ../frontend && npm list
```

#### 4. 啟動失敗：「Backend port 3000 failed to start」

**可能原因**:
- Port 3000 被其他程式佔用
- Backend 依賴未安裝
- Node.js 版本不相容

**解決方案**:
```bash
# 找出佔用 port 的程式
lsof -i :3000
# 殺掉佔用的程式或在 Preferences 中改 port

# 重新安裝 backend 依賴
cd backend
rm -rf node_modules package-lock.json
npm install
```

#### 5. 啟動失敗：「Frontend port 5173 failed to start」

**可能原因**:
- Port 5173 被佔用
- Vite 依賴未安裝
- npm 版本過舊

**解決方案**:
```bash
# 檢查 npm 版本
npm --version  # 應 >= 8.0.0

# 重新安裝 frontend 依賴
cd frontend
rm -rf node_modules package-lock.json
npm install
```

#### 6. macOS 安全警告：「無法開啟 CLAUDE PUNK.app」

**原因**: App 未簽章

**解決方案**:
```bash
# 方式 1: 右鍵點擊 App → 選擇「開啟」

# 方式 2: 移除隔離屬性
xattr -d com.apple.quarantine "/Applications/CLAUDE PUNK.app"

# 方式 3: 在系統偏好設定中允許
# 系統偏好設定 > 安全性與隱私 > 一般 > 點擊「仍要開啟」
```

#### 7. 視窗空白或無法載入

**可能原因**:
- Frontend 尚未完全啟動
- 網路連線問題

**解決方案**:
```bash
# 等待 2-3 秒後重新載入
# 或按 Cmd+R 重新載入視窗

# 檢查 frontend 是否正常啟動
curl http://127.0.0.1:5173
# 應該返回 HTML
```

#### 8. Claude CLI 找不到

**原因**: Claude CLI 未安裝或不在 PATH

**解決方案**:
```bash
# 檢查 Claude CLI 是否已安裝
which claude

# 如果找不到，在 Preferences 中手動設定路徑
# Cmd+, → Open Config File
# 編輯 "claudePath": "/完整/路徑/to/claude"
```

### 開發除錯

#### 啟用開發者工具

```javascript
// electron/main.js
if (process.env.NODE_ENV === 'development') {
  mainWindow.webContents.openDevTools();
}
```

```bash
# 以開發模式啟動
NODE_ENV=development npm run start
```

#### 檢查子程序狀態

```bash
# 查看後端程序
ps aux | grep "node.*server.js"

# 查看前端程序
ps aux | grep "vite"

# 查看所有 Electron 程序
ps aux | grep Electron
```

#### 手動清理殘留程序

```bash
# 停止所有相關程序
pkill -f "electron ."
lsof -ti :3000 :5173 | xargs kill -9
```

---

## 進階設定

### 修改 Port 設定

配置檔案位置：
```
~/Library/Application Support/CLAUDE PUNK/config.json
```

修改範例：
```json
{
  "backend": {
    "port": 3001,  // 改為 3001
    "autoRunClaude": true,
    "claudePath": "/Users/username/.local/bin/claude"
  },
  "frontend": {
    "port": 5174  // 改為 5174
  },
  "app": {
    "openBrowserOnStart": false
  }
}
```

修改後使用 `Cmd+Shift+R` 重啟服務。

### 自訂 App 圖示

1. **準備圖示**：
   - 建立 1024x1024 PNG 圖片
   - 賽博龐克風格（霓虹色、像素藝術）

2. **轉換為 .icns**：
   ```bash
   # 建立 iconset 目錄
   mkdir icon.iconset

   # 生成各種尺寸
   sips -z 16 16     icon-1024.png --out icon.iconset/icon_16x16.png
   sips -z 32 32     icon-1024.png --out icon.iconset/icon_16x16@2x.png
   sips -z 32 32     icon-1024.png --out icon.iconset/icon_32x32.png
   sips -z 64 64     icon-1024.png --out icon.iconset/icon_32x32@2x.png
   sips -z 128 128   icon-1024.png --out icon.iconset/icon_128x128.png
   sips -z 256 256   icon-1024.png --out icon.iconset/icon_128x128@2x.png
   sips -z 256 256   icon-1024.png --out icon.iconset/icon_256x256.png
   sips -z 512 512   icon-1024.png --out icon.iconset/icon_256x256@2x.png
   sips -z 512 512   icon-1024.png --out icon.iconset/icon_512x512.png
   sips -z 1024 1024 icon-1024.png --out icon.iconset/icon_512x512@2x.png

   # 轉換為 icns
   iconutil -c icns icon.iconset -o assets/icon.icns
   ```

3. **更新 package.json**：
   ```json
   "build": {
     "mac": {
       "icon": "assets/icon.icns"
     }
   }
   ```

### 程式碼簽章與公證

需要 **Apple Developer Program** ($99/年)。

1. **取得開發者證書**：
   - 登入 [Apple Developer](https://developer.apple.com)
   - Certificates, Identifiers & Profiles
   - 建立 "Developer ID Application" 證書

2. **更新 package.json**：
   ```json
   "build": {
     "mac": {
       "identity": "Developer ID Application: Your Name (TEAM_ID)",
       "hardenedRuntime": true,
       "gatekeeperAssess": false,
       "entitlements": "entitlements.mac.plist",
       "entitlementsInherit": "entitlements.mac.plist",
       "notarize": {
         "teamId": "TEAM_ID"
       }
     }
   }
   ```

3. **打包並公證**：
   ```bash
   # 設定環境變數
   export APPLE_ID="your-apple-id@email.com"
   export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"

   # 打包（會自動簽章和公證）
   npm run build
   ```

### 自動更新

使用 `electron-updater` 實作自動更新：

1. **安裝依賴**：
   ```bash
   npm install electron-updater
   ```

2. **修改 electron/main.js**：
   ```javascript
   import { autoUpdater } from 'electron-updater';

   app.whenReady().then(() => {
     autoUpdater.checkForUpdatesAndNotify();
   });
   ```

3. **設定更新伺服器**：
   - GitHub Releases（推薦）
   - 自架更新伺服器

4. **發布更新**：
   ```bash
   # 建立新版本
   npm run build

   # 上傳到 GitHub Releases
   gh release create v1.0.1 \
     out/CLAUDE\ PUNK-*.dmg \
     out/latest-mac.yml
   ```

---

## 檔案結構

```
CLAUDE-PUNK/
├── package.json              # Electron 專案配置
├── electron/                 # Electron 相關程式碼
│   ├── main.js              # 主程序（視窗 + 服務管理）
│   ├── process-manager.js   # 程序管理（啟動/停止服務）
│   ├── config-manager.js    # 配置管理
│   ├── menu.js              # 應用選單
│   └── preload.js           # IPC 橋接
├── backend/                  # Node.js 後端
├── frontend/                 # Vite 前端
├── entitlements.mac.plist   # macOS 權限設定
├── scripts/
│   └── generate-version.sh  # 版號生成腳本
├── out/                      # 打包輸出（gitignore）
│   └── CLAUDE PUNK-*.dmg
└── docs/
    └── ELECTRON_PACKAGING.md # 本文件
```

---

## 參考資源

### 官方文件

- [Electron Documentation](https://www.electronjs.org/docs/latest/)
- [electron-builder](https://www.electron.build/)
- [electron-store](https://github.com/sindresorhus/electron-store)
- [electron-log](https://github.com/megahertz/electron-log)

### 相關專案

- [Hyper Terminal](https://github.com/vercel/hyper) - 同樣使用 Electron + node-pty
- [VS Code](https://github.com/microsoft/vscode) - Electron 應用程式範例

---

## 授權

MIT License - 詳見 LICENSE 檔案

---

**最後更新**: 2026-02-08
**版本**: 1.0.0
**維護者**: Paul Huang
