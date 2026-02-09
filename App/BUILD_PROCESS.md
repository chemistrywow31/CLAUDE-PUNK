# CLAUDE PUNK - 完整打包流程文件

> 本文件說明如何從零開始建置 CLAUDE PUNK macOS 應用程式

## 📋 目錄

1. [快速開始](#快速開始)
2. [打包流程說明](#打包流程說明)
3. [依賴管理機制](#依賴管理機制)
4. [資源路徑配置](#資源路徑配置)
5. [故障排除](#故障排除)

---

## 快速開始

### 一鍵完整打包

```bash
cd App
./build-complete.sh
```

這將執行：
1. ✅ 安裝所有依賴（App/backend/frontend）
2. ✅ 建置 frontend 生產版本
3. ✅ 產生版本號
4. ✅ 打包 Electron App
5. ✅ 驗證輸出檔案

### 進階選項

```bash
# 跳過依賴安裝（使用現有 node_modules）
./build-complete.sh --skip-deps

# 清潔建置（先刪除所有 node_modules）
./build-complete.sh --clean
```

---

## 打包流程說明

### 架構總覽

```
┌─────────────────────────────────────────────────────────┐
│                   Build Pipeline                        │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Step 1: Environment Check                             │
│  ├─ Node.js version ✓                                  │
│  ├─ npm version ✓                                      │
│  └─ Directory structure ✓                              │
│                                                         │
│  Step 2: Dependency Installation                       │
│  ├─ App/package.json → Electron + builder              │
│  ├─ backend/package.json → Express, ws, node-pty       │
│  └─ frontend/package.json → Phaser, Vite, xterm        │
│                                                         │
│  Step 3: Frontend Build                                │
│  ├─ Vite build → frontend/dist/                        │
│  └─ Assets optimization                                │
│                                                         │
│  Step 4: Version Generation                            │
│  └─ Git-based versioning (YYYY.MM.DD.HHmm)             │
│                                                         │
│  Step 5: Electron Packaging                            │
│  ├─ Copy backend/ → Resources/backend/                 │
│  ├─ Copy frontend/ → Resources/frontend/               │
│  ├─ Copy electron/ → CLAUDE PUNK.app/Contents/         │
│  └─ Create DMG installer                               │
│                                                         │
│  Step 6: Verification                                  │
│  ├─ DMG file exists ✓                                  │
│  ├─ App bundle exists ✓                                │
│  └─ File sizes logged                                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 輸出檔案位置

```
App/out/
├── CLAUDE PUNK-{version}.dmg          ← 安裝檔（發布用）
└── mac-arm64/
    └── CLAUDE PUNK.app                ← App bundle（可直接執行）
```

---

## 依賴管理機制

### 設計理念

**問題**：打包後的 App 首次啟動時，backend 和 frontend 的 `node_modules` 可能不存在。

**解決方案**：在 App 啟動時自動檢查並安裝缺失的依賴。

### 實作細節

#### 新增模組：`dependency-manager.js`

```javascript
// App/electron/dependency-manager.js

export async function ensureAllDependencies(onProgress) {
  // 1. 檢查 backend/node_modules 是否存在
  // 2. 檢查 frontend/node_modules 是否存在
  // 3. 若缺失，執行 npm install --production
  // 4. 回報安裝進度
}
```

#### 整合至主程序

```javascript
// App/electron/main.js

app.whenReady().then(async () => {
  // Step 1: 確保依賴完整
  const depResult = await ensureAllDependencies(showProgress);

  if (!depResult.backend || !depResult.frontend) {
    // 顯示錯誤對話框並退出
    return;
  }

  // Step 2: 啟動服務
  await startAll(config);

  // Step 3: 建立視窗
  createWindow();
});
```

### 依賴安裝流程

```
App 啟動
  │
  ↓
檢查 backend/node_modules
  │
  ├─ 存在 → 跳過
  │
  └─ 不存在
      │
      ↓
    執行: cd backend && npm install --production
      │
      ↓
    進度回報: "Installing backend dependencies..."
      │
      ↓
    完成 ✅
  │
  ↓
檢查 frontend/node_modules
  │
  ├─ 存在 → 跳過
  │
  └─ 不存在 → 同上流程
  │
  ↓
所有依賴就緒 → 繼續啟動服務
```

### 優點

- ✅ **獨立運行**：打包後的 App 不依賴外部環境
- ✅ **自動修復**：使用者不小心刪除 node_modules 也能自動恢復
- ✅ **首次體驗**：首次啟動會自動下載依賴，使用者無需手動操作
- ✅ **離線準備**：開發者可在打包時預裝依賴，減少使用者等待時間

---

## 資源路徑配置

### Frontend Assets 結構

```
frontend/
├── public/
│   └── assets/
│       ├── backgrounds/     ← 背景圖片
│       ├── sprites/         ← 角色、物件 sprite sheets
│       └── audio/           ← BGM、音效
├── src/
│   └── scenes/
│       └── BarScene.js      ← 載入 assets
└── vite.config.js           ← publicDir 設定
```

### Vite 配置

```javascript
// frontend/vite.config.js

export default defineConfig({
  publicDir: 'public',  // public/ 下的檔案會被複製到 dist/
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
```

### 打包時的資源複製

```json
// App/package.json

{
  "build": {
    "extraResources": [
      {
        "from": "../frontend",
        "to": "frontend",
        "filter": ["**/*"]
      },
      {
        "from": "../frontend/public",
        "to": "frontend/public",
        "filter": ["**/*"]
      }
    ]
  }
}
```

### 打包後的資源路徑

```
CLAUDE PUNK.app/Contents/
├── Resources/
│   ├── backend/
│   │   ├── server.js
│   │   └── node_modules/
│   └── frontend/
│       ├── src/
│       ├── public/
│       │   └── assets/          ← 這裡！
│       ├── dist/                ← Vite 建置輸出
│       ├── vite.config.js
│       └── node_modules/
└── ...
```

### 程式碼中的資源載入

```javascript
// frontend/src/scenes/BarScene.js

preload() {
  // 使用絕對路徑（相對於 Vite dev server 根目錄）
  this.load.image('bar-bg', '/assets/backgrounds/bar-interior.png');
  this.load.atlas('character-0', '/assets/sprites/characters/character-0.png',
                                 '/assets/sprites/characters/character-0.json');
}
```

**為什麼這樣可以運作？**

- **開發模式**：Vite dev server 會將 `public/` 映射到 `/`
- **生產模式**：`npm run build` 會將 `public/` 複製到 `dist/`
- **打包後**：Electron 的 process-manager 啟動 Vite dev server，讀取 `frontend/public/`

---

## 故障排除

### 問題 1: 依賴安裝失敗

**症狀**：App 啟動時顯示「Failed to install required dependencies」

**原因**：
- 沒有網路連線
- npm 權限問題
- 磁碟空間不足

**解決方式**：
```bash
# 手動安裝依賴
cd /Applications/CLAUDE\ PUNK.app/Contents/Resources/backend
npm install

cd /Applications/CLAUDE\ PUNK.app/Contents/Resources/frontend
npm install
```

### 問題 2: Assets 載入失敗（404）

**症狀**：遊戲畫面空白，Console 顯示 404 錯誤

**原因**：
- `frontend/public/assets/` 未被正確打包

**檢查方式**：
```bash
# 確認 DMG 內容
hdiutil attach "App/out/CLAUDE PUNK-*.dmg"
cd "/Volumes/CLAUDE PUNK"
# 拖曳 CLAUDE PUNK.app 到桌面
cd ~/Desktop
# 右鍵 → 顯示套件內容
open CLAUDE\ PUNK.app/Contents/Resources/frontend/public/assets/
```

**解決方式**：
確認 `App/package.json` 中 `extraResources` 包含：
```json
{
  "from": "../frontend/public",
  "to": "frontend/public",
  "filter": ["**/*"]
}
```

### 問題 3: 服務啟動失敗

**症狀**：App 顯示「Failed to start services」

**查看日誌**：
```bash
# macOS 日誌位置
~/Library/Logs/CLAUDE PUNK/main.log
```

或在 App 選單：**Help > View Logs**

**常見原因**：
- Port 3000/5173 被佔用
- Node.js 版本不相容
- 缺少執行權限

**解決方式**：
```bash
# 檢查 port
lsof -i :3000
lsof -i :5173

# 修改 port（編輯 config.json）
open ~/Library/Application\ Support/CLAUDE\ PUNK/config.json
```

---

## 版本管理

### 自動版本號

版本號格式：`YYYY.MM.DD.HHmm`

範例：`2026.02.09.1430`（2026年2月9日 14:30）

**產生方式**：
```bash
# App/scripts/generate-version.sh
git log -1 --format=%ct | xargs -I {} date -r {} +"%Y.%m.%d.%H%M"
```

**整合至建置**：
```json
// App/package.json
{
  "scripts": {
    "prebuild": "npm run build:version"
  }
}
```

---

## 手動建置步驟（不使用腳本）

如果想要逐步理解每個階段：

```bash
# 1. 安裝 App 依賴
cd App
npm install

# 2. 安裝 backend 依賴
cd ../backend
npm install

# 3. 安裝 frontend 依賴
cd ../frontend
npm install

# 4. 建置 frontend
npm run build

# 5. 產生版本號
cd ../App
./scripts/generate-version.sh

# 6. 打包 Electron App
npm run build

# 7. 檢查輸出
ls -lh out/*.dmg
```

---

## 進階主題

### 自訂建置配置

編輯 `App/package.json` 中的 `build` 區塊：

```json
{
  "build": {
    "appId": "com.claudepunk.app",
    "productName": "CLAUDE PUNK",
    "mac": {
      "category": "public.app-category.developer-tools",
      "target": ["dmg", "zip"]  // 可加入 "zip"
    }
  }
}
```

### 程式碼簽署（Code Signing）

若要發布到 App Store 或避免 Gatekeeper 警告：

```bash
# 設定開發者憑證
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="app-specific-password"

# 修改 package.json
{
  "build": {
    "mac": {
      "identity": "Developer ID Application: Your Name (TEAM_ID)"
    }
  }
}
```

### 縮小 App 大小

```json
{
  "build": {
    "asar": true,  // 啟用 ASAR 打包
    "compression": "maximum",
    "files": [
      "electron/**/*",
      "!electron/**/*.map"
    ]
  }
}
```

---

## 相關文件

- [ELECTRON_PACKAGING.md](./ELECTRON_PACKAGING.md) - Electron 打包詳細說明
- [BUILD.md](./BUILD.md) - 原始建置文件
- [DISTRIBUTION.md](./DISTRIBUTION.md) - 發布與分發指南

---

**版本**：v1.0
**更新日期**：2026-02-09
**維護者**：Paul Huang
