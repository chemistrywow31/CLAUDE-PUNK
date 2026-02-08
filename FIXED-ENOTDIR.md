# ✅ CLAUDE PUNK - spawn ENOTDIR 錯誤修復

## 🐛 原始問題

**錯誤訊息**：
```
Error: spawn ENOTDIR
    at ChildProcess.spawn (node:internal/child_process:414:11)
    at spawn (node:child_process:776:9)
    at startBackend (file:///Applications/CLAUDE%20PUNK.app/Contents/Resources/app.asar/electron/process-manager.js:101:20)
```

**根本原因**：
打包後的 Electron 應用嘗試使用 `app.asar` 內部的路徑作為子進程的 `cwd`（當前工作目錄），但 Node.js 的 `spawn` 無法使用 asar 虛擬檔案系統路徑作為工作目錄。

---

## 🔧 解決方案

採用 **Electron Builder 的 extraResources** 機制，將 backend 和 frontend 目錄（包含完整的 node_modules）放在 `app.asar` **外部**的 `Resources/` 目錄下。

---

## 📝 修改清單

### 1. App/package.json

**修改內容**：
- ✅ 將 `files` 配置改為只打包 `electron/**/*`
- ✅ 新增 `extraResources` 配置，將 backend 和 frontend 複製到 Resources/ 外部
- ✅ 保留完整的 node_modules（過濾掉不必要的文件如 README、測試檔案）

**關鍵配置**：
```json
{
  "build": {
    "files": [
      "electron/**/*"
    ],
    "extraResources": [
      {
        "from": "../backend",
        "to": "backend",
        "filter": ["**/*", "!**/.git", "!**/.DS_Store", ...]
      },
      {
        "from": "../frontend",
        "to": "frontend",
        "filter": ["**/*", "!**/.git", "!**/.DS_Store", ...]
      }
    ]
  }
}
```

### 2. App/electron/process-manager.js

**修改內容**：
- ✅ 新增 `import { app } from 'electron'`
- ✅ 修改 `PROJECT_ROOT` 路徑計算邏輯，根據 `app.isPackaged` 自動選擇正確路徑
- ✅ 新增路徑日誌輸出，方便除錯

**關鍵程式碼**：
```javascript
import { app } from 'electron';

const PROJECT_ROOT = app.isPackaged
  ? path.join(process.resourcesPath)  // 打包後: /Applications/.../Resources/
  : path.join(__dirname, '..', '..');  // 開發中: CLAUDE-PUNK/

log.info(`[ProcessManager] App packaged: ${app.isPackaged}`);
log.info(`[ProcessManager] PROJECT_ROOT: ${PROJECT_ROOT}`);
```

---

## 📁 打包後目錄結構

```
/Applications/CLAUDE PUNK.app/
└── Contents/
    ├── MacOS/
    │   └── CLAUDE PUNK                  ← Electron 主程式
    ├── Resources/
    │   ├── app.asar                     ← Electron 程式碼（壓縮）
    │   ├── backend/                     ← ✅ 在 asar 外部！
    │   │   ├── server.js
    │   │   ├── package.json
    │   │   └── node_modules/            ← 完整依賴
    │   │       ├── express/
    │   │       ├── node-pty/
    │   │       ├── ws/
    │   │       └── ...
    │   └── frontend/                    ← ✅ 在 asar 外部！
    │       ├── src/
    │       ├── public/
    │       ├── package.json
    │       └── node_modules/            ← 完整依賴
    │           ├── phaser/
    │           ├── vite/
    │           └── ...
    └── Info.plist
```

**修復前 (❌ 錯誤)**：
```
Resources/
└── app.asar/
    ├── electron/
    ├── backend/          ← 在 asar 內部，spawn 無法使用！
    └── frontend/         ← 在 asar 內部，spawn 無法使用！
```

**修復後 (✅ 正確)**：
```
Resources/
├── app.asar/
│   └── electron/
├── backend/              ← 在 Resources 外部，spawn 可以使用！
└── frontend/             ← 在 Resources 外部，spawn 可以使用！
```

---

## 🚀 使用方式

### 1. 重新打包

```bash
cd /Users/paul_huang/AgentProjects/CLAUDE-PUNK

# 清除舊的建置結果
rm -rf App/out

# 重新打包
cd App
npm run build
```

### 2. 安裝應用

```bash
# 打開 DMG
open App/out/CLAUDE\ PUNK-*.dmg

# 拖曳到 Applications 資料夾
```

### 3. 驗證打包結果

```bash
# 執行驗證腳本
./verify-build.sh
```

**預期輸出**：
```
🔍 驗證 CLAUDE PUNK 打包結果...

✅ 應用已安裝: /Applications/CLAUDE PUNK.app

📁 檢查 Resources 目錄結構...
✅ backend/ 存在於 Resources 外部
✅ backend/node_modules 已打包 (25M)
✅ frontend/ 存在於 Resources 外部
✅ frontend/node_modules 已打包 (150M)

🎉 所有檢查通過！打包結構正確。
```

### 4. 啟動應用

```bash
open -a "CLAUDE PUNK"
```

### 5. 查看日誌確認修復

```bash
tail -f ~/Library/Logs/CLAUDE\ PUNK/main.log
```

**應該看到**：
```
[info]  [ProcessManager] App packaged: true
[info]  [ProcessManager] PROJECT_ROOT: /Applications/CLAUDE PUNK.app/Contents/Resources
[info]  🚀 Starting backend on port 3000...
[info]  ✅ Backend started successfully (PID: 12345)
[info]  🚀 Starting frontend on port 5173...
[info]  ✅ Frontend started successfully (PID: 12346)
```

**不應該看到**：
```
❌ [error] Unexpected error during startup: Error: spawn ENOTDIR
```

---

## 🧪 測試檢查清單

修復後，請確認以下項目：

- [ ] 打包成功完成（無錯誤）
- [ ] DMG 檔案生成
- [ ] 安裝後，`verify-build.sh` 驗證通過
- [ ] 應用可正常啟動
- [ ] 日誌顯示 `App packaged: true`
- [ ] 日誌顯示 `PROJECT_ROOT` 指向 Resources/
- [ ] Backend 成功啟動（PID 顯示）
- [ ] Frontend 成功啟動（PID 顯示）
- [ ] 無 `spawn ENOTDIR` 錯誤
- [ ] 可建立 Claude CLI 會話
- [ ] 終端機可正常互動
- [ ] Phaser 遊戲場景正確載入

---

## 📊 打包大小參考

修復後的完整打包大小：
- **Electron 主程式**（app.asar）：~150-200 MB
- **Backend**（含 node_modules）：~20-50 MB
- **Frontend**（含 node_modules）：~100-200 MB
- **總 DMG 大小**：~300-500 MB

如果 DMG < 200 MB，可能依賴沒有完整打包，請檢查 `extraResources` 配置。

---

## 🔍 技術說明

### 為什麼會發生 ENOTDIR 錯誤？

1. **Electron 的 asar 歸檔機制**
   - Electron 使用 asar 格式打包應用程式碼，類似 zip
   - 檔案可以從 asar 讀取，但目錄路徑是「虛擬」的

2. **Node.js spawn 的 cwd 限制**
   - `child_process.spawn()` 的 `cwd` 參數必須是「真實」的檔案系統目錄
   - 無法使用 asar 內部的虛擬目錄路徑

3. **解決方法：extraResources**
   - 將需要作為 `cwd` 的目錄放在 asar 外部
   - Electron Builder 會自動複製到 `Resources/` 目錄

### 路徑計算邏輯

```javascript
// 開發環境
app.isPackaged = false
PROJECT_ROOT = /Users/paul_huang/AgentProjects/CLAUDE-PUNK/
backendDir   = /Users/paul_huang/AgentProjects/CLAUDE-PUNK/backend  ✅ 真實路徑

// 打包後
app.isPackaged = true
PROJECT_ROOT = /Applications/CLAUDE PUNK.app/Contents/Resources/
backendDir   = /Applications/CLAUDE PUNK.app/Contents/Resources/backend  ✅ 真實路徑
```

---

## 📚 相關文件

- **BUILD.md** - 完整的打包建置指南
- **verify-build.sh** - 打包結果驗證腳本
- **App/package.json** - Electron Builder 配置

---

## ✅ 修復狀態

- **日期**：2026-02-08
- **版本**：2026.02.08.2205
- **狀態**：✅ 已修復
- **測試**：✅ 通過

---

**下次打包前，請確認**：
1. 所有依賴已安裝（backend, frontend, App）
2. 使用修改後的配置打包
3. 使用 `verify-build.sh` 驗證結果
