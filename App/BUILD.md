# CLAUDE PUNK - 打包建置指南

## 📦 打包流程

### 前置準備

1. **確保所有依賴已安裝**
   ```bash
   cd /Users/paul_huang/AgentProjects/CLAUDE-PUNK

   # 安裝 App (Electron) 依賴
   cd App
   npm install

   # 安裝 Backend 依賴（會自動執行，或手動執行）
   cd ../backend
   npm install

   # 安裝 Frontend 依賴（會自動執行，或手動執行）
   cd ../frontend
   npm install
   ```

2. **驗證環境**
   ```bash
   # 檢查 Node.js 版本
   node -v  # 建議 v20+

   # 檢查 npm 版本
   npm -v
   ```

---

## 🚀 打包步驟

### 方式 1: 使用 App 目錄的腳本

```bash
cd /Users/paul_huang/AgentProjects/CLAUDE-PUNK/App
./build-app.sh
```

### 方式 2: 手動打包

```bash
cd /Users/paul_huang/AgentProjects/CLAUDE-PUNK/App

# 執行打包
npm run build
```

---

## 📁 打包產出結構

打包完成後，檔案結構如下：

```
CLAUDE PUNK.app/
└── Contents/
    ├── MacOS/
    │   └── CLAUDE PUNK          ← Electron 執行檔
    ├── Resources/
    │   ├── app.asar              ← Electron 主程式（已壓縮）
    │   ├── backend/              ← 後端完整環境 ✅
    │   │   ├── server.js
    │   │   ├── package.json
    │   │   └── node_modules/     ← 包含所有依賴
    │   └── frontend/             ← 前端完整環境 ✅
    │       ├── src/
    │       ├── public/
    │       ├── package.json
    │       └── node_modules/     ← 包含所有依賴
    └── Info.plist
```

**重點說明**：
- ✅ `backend/` 和 `frontend/` 在 `app.asar` **外部**，位於 `Resources/` 目錄
- ✅ 包含完整的 `node_modules`，應用可獨立運行
- ✅ 啟動時會自動執行：
  - `node backend/server.js` (後端 API)
  - `npm run dev` in `frontend/` (Vite dev server)

---

## 🔍 路徑解析機制

修改後的 `process-manager.js` 會根據環境自動選擇正確的路徑：

```javascript
// 打包後（app.isPackaged = true）
PROJECT_ROOT = /Applications/CLAUDE PUNK.app/Contents/Resources/

// 開發中（app.isPackaged = false）
PROJECT_ROOT = /Users/paul_huang/AgentProjects/CLAUDE-PUNK/
```

因此：
- **打包後**：`backendDir = Resources/backend` ✅ 真實目錄
- **開發中**：`backendDir = CLAUDE-PUNK/backend` ✅ 真實目錄

---

## 🧪 驗證打包結果

### 1. 檢查打包產出

```bash
cd /Users/paul_huang/AgentProjects/CLAUDE-PUNK/App/out

# 查看 DMG 檔案
ls -lh *.dmg

# 掛載 DMG 並檢查內容
open "CLAUDE PUNK-2026.02.08.2205.dmg"
```

### 2. 檢查 Resources 目錄結構

```bash
# 方式 1: 直接查看已安裝的應用
ls -la "/Applications/CLAUDE PUNK.app/Contents/Resources/"

# 方式 2: 查看 DMG 中的內容（需先掛載）
ls -la "/Volumes/CLAUDE PUNK 2026.02.08.2205/CLAUDE PUNK.app/Contents/Resources/"
```

應該要看到：
```
Resources/
├── app.asar
├── backend/
│   ├── node_modules/
│   ├── package.json
│   └── server.js
└── frontend/
    ├── node_modules/
    ├── package.json
    └── src/
```

### 3. 測試執行

```bash
# 安裝應用
open "CLAUDE PUNK-2026.02.08.2205.dmg"
# 拖曳到 Applications

# 啟動應用
open -a "CLAUDE PUNK"

# 查看日誌
tail -f ~/Library/Logs/CLAUDE\ PUNK/main.log
```

**預期看到的日誌**：
```
[info]  [ProcessManager] App packaged: true
[info]  [ProcessManager] PROJECT_ROOT: /Applications/CLAUDE PUNK.app/Contents/Resources
[info]  🚀 Starting backend on port 3000...
[info]  ✅ Backend started successfully (PID: 12345)
[info]  🚀 Starting frontend on port 5173...
[info]  ✅ Frontend started successfully (PID: 12346)
```

**不應該看到的錯誤**：
```
❌ spawn ENOTDIR  ← 這個錯誤應該已經消失！
```

---

## 🐛 問題排查

### 問題 1: 仍然出現 `spawn ENOTDIR`

**原因**：backend/frontend 路徑仍然在 asar 內部

**檢查**：
```bash
ls -la "/Applications/CLAUDE PUNK.app/Contents/Resources/backend"
```

如果顯示 "No such file or directory"，表示沒有正確打包。

**解決方式**：
1. 刪除舊的建置結果：`rm -rf App/out`
2. 重新打包：`cd App && npm run build`

---

### 問題 2: node_modules 沒有被打包

**原因**：`extraResources` 的 filter 太嚴格

**檢查**：
```bash
du -sh "/Applications/CLAUDE PUNK.app/Contents/Resources/backend/node_modules"
du -sh "/Applications/CLAUDE PUNK.app/Contents/Resources/frontend/node_modules"
```

應該要有幾十 MB 的大小。如果太小或不存在，表示沒打包完整。

**解決方式**：
確認 `App/package.json` 中的 `extraResources` 配置正確（已修改）。

---

### 問題 3: Frontend 啟動失敗

**可能原因**：
- npm 指令找不到
- Vite 依賴缺失

**檢查日誌**：
```bash
tail -100 ~/Library/Logs/CLAUDE\ PUNK/main.log | grep -A 5 "Frontend"
```

**解決方式**：
確認 frontend/node_modules 完整打包。

---

## 📊 打包大小參考

完整打包後的應用大小約：
- **App 主體**（app.asar + Electron）：~150-200 MB
- **Backend node_modules**：~20-50 MB
- **Frontend node_modules**：~100-200 MB
- **總計 DMG**：~300-500 MB

如果 DMG 太小（< 200 MB），可能依賴沒有完整打包。

---

## ✅ 打包檢查清單

在發布前，確認：

- [ ] 所有依賴已安裝（backend, frontend, App）
- [ ] 打包成功完成（無錯誤）
- [ ] DMG 檔案生成（在 `App/out/` 目錄）
- [ ] 安裝後可正常啟動
- [ ] 日誌顯示 backend 和 frontend 都成功啟動
- [ ] 無 `spawn ENOTDIR` 錯誤
- [ ] 可正常建立 Claude CLI 會話
- [ ] 終端機可正常互動

---

**最後更新**：2026-02-08
**版本**：2026.02.08.2205
