# CLAUDE PUNK - Release Notes

## Version 2026.02.09.1326 (Latest)

**Release Date:** 2026-02-09 13:26
**Build Number:** 2026.02.09.1326
**Platform:** macOS (Apple Silicon)
**Package Size:** 214 MB

---

### 🎉 新功能 (New Features)

#### 動態端口配置 (Dynamic Port Allocation)
- 自動掃描可用端口，避免與常見服務衝突
- **Backend 端口範圍**: 13000-13999 (預設 13300)
- **Frontend 端口範圍**: 15000-15999 (預設 15173)
- 智能端口重用策略，確保每次啟動使用相同端口
- 避免與 MySQL (3306)、SQL Server (1433)、Redis (6379)、Vite (5173) 等常見服務衝突

#### 自動依賴安裝 (Auto Dependency Installation)
- 首次啟動自動檢測並安裝缺失的 node_modules
- 支援開發和生產環境
- 啟動時間約 2-3 秒（包含依賴安裝）
- 無需手動執行 npm install

#### 應用程式圖示 (App Icon)
- 採用 CLAUDE PUNK neon sign 霓虹招牌作為應用圖示
- Cyberpunk 風格的視覺設計
- 512x512 高解析度圖示

---

### 🐛 問題修正 (Bug Fixes)

#### Backend 啟動問題修正
- **問題**: 在打包環境中出現 `spawn node ENOENT` 錯誤
- **原因**: 系統 PATH 中找不到 node 命令
- **解決方案**: 使用 `child_process.fork` 代替 `spawn`，直接使用 Electron 內建的 Node.js
- **狀態**: ✅ 已修正

#### Frontend 啟動問題修正
- **問題**: Vite 啟動時出現 `env: node: No such file or directory` (exit code 127)
- **原因**: Vite shell 腳本的 shebang `#!/usr/bin/env node` 無法在打包環境中找到 node
- **解決方案**: 直接 fork vite.js 主入口檔案，繞過 shell 腳本
- **狀態**: ✅ 已修正

#### 資源路徑配置
- 確保所有 assets (sprites, backgrounds, audio) 正確打包
- 修正 frontend/public 路徑配置
- **狀態**: ✅ 已修正

---

### 🔧 技術改進 (Technical Improvements)

#### 進程管理 (Process Management)
```javascript
// Before (不可行於打包環境)
spawn('node', ['server.js'])
spawn(viteExecutable, [])

// After (支援打包環境)
fork(serverPath, [])
fork(vitePath, [])
```

#### 端口管理架構 (Port Management Architecture)
- 新增 `port-manager.js` 模組
- 配置持久化至 `~/Library/Application Support/CLAUDE PUNK/config.json`
- 智能端口分配算法：
  1. 嘗試重用上次的端口
  2. 嘗試使用預設端口
  3. 隨機掃描範圍內可用端口（最多 50 次嘗試）

#### 依賴管理機制 (Dependency Management)
- 新增 `dependency-manager.js` 模組
- 啟動時自動驗證 node_modules 完整性
- 支援增量安裝缺失的依賴
- 提供安裝進度反饋

---

### 📦 打包改進 (Packaging Improvements)

#### Build Pipeline
- 完整的 `build-complete.sh` 腳本
- 支援 `--skip-deps` 和 `--clean` 選項
- 自動版本號生成（格式：YYYY.MM.DD.HHMM）
- Build 驗證檢查

#### 文件結構
```
CLAUDE PUNK.app/
├── Contents/
│   ├── MacOS/
│   │   └── CLAUDE PUNK (Electron 執行檔)
│   ├── Resources/
│   │   ├── backend/ (Node.js 後端 + node_modules)
│   │   ├── frontend/ (Vite 前端 + node_modules)
│   │   └── app.asar (Electron 主程式)
│   └── Info.plist
```

---

### 📊 效能指標 (Performance Metrics)

- **DMG 大小**: 214 MB
- **App bundle 大小**: 625 MB
- **啟動時間**: 2-3 秒（含依賴安裝）
- **記憶體使用**: ~200-300 MB
- **Backend 啟動時間**: < 1 秒
- **Frontend 啟動時間**: < 2 秒

---

### ⚠️ 已知問題 (Known Issues)

1. **缺少 jukebox.json**
   - 影響：前端可能顯示 jukebox atlas 載入失敗警告
   - 狀態：不影響核心功能
   - 計劃：後續版本修正

2. **Code Signing**
   - 影響：首次啟動可能需要系統安全性確認
   - 解決方式：系統偏好設定 → 安全性與隱私權 → 允許執行
   - 計劃：申請 Apple Developer ID 簽名

3. **部分 npm 依賴有安全性警告**
   - frontend: 2 moderate severity vulnerabilities
   - 狀態：非關鍵性問題
   - 計劃：後續版本更新依賴

---

### 📋 完整變更清單 (Full Changelog)

#### Commits
```
c8cbb04 - fix(app): use fork for frontend vite process
4af72e2 - feat(app): add CLAUDE PUNK neon sign as app icon
c4f8e0c - fix(app): use fork instead of spawn for backend process
341a90b - feat(app): add dynamic port allocation and auto dependency installation
```

#### 新增檔案
- `App/electron/port-manager.js` - 端口管理模組
- `App/electron/dependency-manager.js` - 依賴管理模組
- `App/build/icon.png` - 應用程式圖示
- `App/BUILD_PROCESS.md` - 打包流程文件
- `App/DYNAMIC_PORT_GUIDE.md` - 端口配置指南
- `App/PACKAGING_SUMMARY.md` - 打包摘要
- `App/TEST_REPORT.md` - 測試報告
- `App/build-complete.sh` - 完整打包腳本

#### 修改檔案
- `App/electron/main.js` - 整合端口管理和依賴管理
- `App/electron/config-manager.js` - 新增端口配置功能
- `App/electron/process-manager.js` - 修改進程啟動方式
- `App/package.json` - 新增 icon 配置

---

### 🚀 安裝與更新指南 (Installation Guide)

#### 全新安裝
1. 雙擊 `CLAUDE PUNK-2026.02.09.1326-arm64.dmg`
2. 將 CLAUDE PUNK.app 拖曳到 Applications 資料夾
3. 從 Applications 啟動

#### 從舊版更新
1. 刪除 `/Applications/CLAUDE PUNK.app`
2. 按照全新安裝步驟操作

#### 首次啟動
- 系統可能提示「無法驗證開發者」
- 解決方式：系統偏好設定 → 安全性與隱私權 → 「強制打開」
- 後續啟動不會再出現此提示

---

### 🔐 系統需求 (System Requirements)

- **作業系統**: macOS 10.12 (Sierra) 或更新版本
- **架構**: Apple Silicon (M1/M2/M3) 或 Intel x64
- **記憶體**: 最少 4 GB RAM（建議 8 GB）
- **儲存空間**: 最少 1 GB 可用空間
- **網路**: 需要網路連線（用於 Claude API）

---

### 📞 支援與回饋 (Support)

- **問題回報**: GitHub Issues
- **文件**: `/App/BUILD_PROCESS.md`, `/App/DYNAMIC_PORT_GUIDE.md`
- **Log 位置**: `~/Library/Logs/CLAUDE PUNK/main.log`
- **配置檔案**: `~/Library/Application Support/CLAUDE PUNK/config.json`

---

### 🎯 下一個版本計劃 (Next Release)

#### v2026.02.10 (計劃中)
- [ ] Apple Developer ID 代碼簽名
- [ ] 修正 jukebox.json 缺失問題
- [ ] 更新依賴以解決安全性警告
- [ ] 新增自動更新功能
- [ ] 支援自訂端口範圍
- [ ] 新增啟動畫面
- [ ] 優化記憶體使用

---

### 📄 授權與版權 (License)

Copyright © 2026 CLAUDE PUNK Team
All rights reserved.

---

**Built with ❤️ using Electron, Node.js, and Vite**
