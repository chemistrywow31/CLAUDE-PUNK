# CLAUDE PUNK - 分發與安裝指南

## 📦 推薦的分發方式

### ✅ 方式 1: 直接分發 DMG（推薦）

**最佳實踐**：直接分發生成的 DMG 檔案

```bash
# DMG 檔案位置
App/out/CLAUDE PUNK-2026.2.0-8.2205-arm64.dmg
```

**優點**：
- DMG 是 macOS 標準的應用分發格式
- 提供更好的用戶體驗（拖曳安裝）
- 避免壓縮/解壓縮帶來的問題
- 檔案完整性更有保障

**安裝步驟**：
1. 雙擊 DMG 檔案
2. 拖曳 CLAUDE PUNK.app 到 Applications 資料夾
3. 彈出 DMG
4. 啟動應用

---

## ⚠️ 關於壓縮 out 目錄的問題

### 問題描述

當您壓縮 `App/out/` 目錄後再解壓縮安裝，macOS 會顯示：

```
「CLAUDE PUNK.app」已損毀，無法打開。您應該將其丟到垃圾桶。
```

### 原因

這是 macOS Gatekeeper 的安全機制：

1. **應用未簽名**：CLAUDE PUNK.app 沒有 Apple Developer 簽名
2. **Quarantine 屬性**：壓縮/解壓縮或從網路下載的檔案會被標記為「隔離」
3. **安全檢查**：macOS 阻止未簽名的「隔離」應用執行

---

## 🔧 解決方案

### 方案 1: 使用 DMG 而非壓縮檔（推薦）

**不要壓縮 `out` 目錄**，直接分發 DMG 檔案：

```bash
# ✅ 正確做法
分發: CLAUDE PUNK-2026.2.0-8.2205-arm64.dmg

# ❌ 不建議
壓縮: out.zip
```

---

### 方案 2: 移除 Quarantine 屬性

如果已經安裝了「損毀」的應用，可以手動移除 quarantine 屬性：

```bash
# 移除 quarantine 屬性
xattr -cr "/Applications/CLAUDE PUNK.app"

# 驗證屬性已移除
xattr -l "/Applications/CLAUDE PUNK.app"
# 應該沒有 com.apple.quarantine 屬性

# 啟動應用
open -a "CLAUDE PUNK"
```

**重要**：
- 需要在終端機執行
- 路徑必須正確（如果安裝在其他位置需調整）
- 這個操作是安全的，只是移除標記

---

### 方案 3: 繞過 Gatekeeper（臨時）

如果移除 quarantine 屬性後仍無法開啟：

1. **右鍵點擊應用**
2. 選擇「打開」（不是雙擊）
3. 在彈出的警告視窗點「打開」

或使用指令：

```bash
# 開啟時繞過 Gatekeeper
open --args -n "/Applications/CLAUDE PUNK.app"

# 或使用 spctl 解除封鎖
sudo spctl --add "/Applications/CLAUDE PUNK.app"
```

---

### 方案 4: 進行 Code Signing（最徹底）

**需求**：
- Apple Developer 帳號（$99/年）
- Developer ID Application Certificate

**步驟**：

1. **取得憑證**
   - 登入 [Apple Developer Portal](https://developer.apple.com)
   - 生成 Developer ID Application 憑證
   - 下載並安裝到 Keychain

2. **簽名應用**
   ```bash
   # 簽名 app
   codesign --deep --force --verify --verbose \
     --sign "Developer ID Application: Your Name (TEAM_ID)" \
     "/Applications/CLAUDE PUNK.app"

   # 驗證簽名
   codesign --verify --deep --strict --verbose=2 \
     "/Applications/CLAUDE PUNK.app"

   # 檢查簽名資訊
   codesign -dv --verbose=4 "/Applications/CLAUDE PUNK.app"
   ```

3. **公證（Notarization）**
   ```bash
   # 打包為 zip 準備上傳
   ditto -c -k --keepParent \
     "/Applications/CLAUDE PUNK.app" \
     "CLAUDE-PUNK.zip"

   # 上傳公證（需要 app-specific password）
   xcrun notarytool submit "CLAUDE-PUNK.zip" \
     --apple-id "your@email.com" \
     --password "app-specific-password" \
     --team-id "TEAM_ID" \
     --wait

   # 檢查公證狀態
   xcrun notarytool info <submission-id> \
     --apple-id "your@email.com" \
     --password "app-specific-password"

   # 將公證 ticket 附加到 app
   xcrun stapler staple "/Applications/CLAUDE PUNK.app"

   # 驗證公證
   xcrun stapler validate "/Applications/CLAUDE PUNK.app"
   ```

4. **重新打包 DMG**
   ```bash
   cd App
   npm run build
   ```

**優點**：
- 用戶不會看到任何警告
- 應用可以正常分發
- 更專業的形象

**缺點**：
- 需要付費的 Apple Developer 帳號
- 設定流程較複雜
- 每次更新都需要重新簽名和公證

---

## 📋 分發檢查清單

### 內部測試版（開發團隊）

- [x] 生成 DMG
- [x] 測試安裝流程
- [x] 驗證獨立運作
- [ ] 提供移除 quarantine 的說明
- [ ] 測試在乾淨的 Mac 上安裝

### 公開發布版（外部用戶）

- [ ] 註冊 Apple Developer 帳號
- [ ] 取得 Developer ID Certificate
- [ ] 簽名應用
- [ ] 公證應用
- [ ] 生成簽名過的 DMG
- [ ] 在多台 Mac 上測試
- [ ] 準備 README 和安裝指南
- [ ] 設定 release notes

---

## 🎯 快速參考

### 用戶遇到「已損毀」錯誤時

**立即解決**（1 分鐘）：
```bash
xattr -cr "/Applications/CLAUDE PUNK.app"
open -a "CLAUDE PUNK"
```

### 分發給其他人

**最佳實踐**：
1. 直接分發 DMG（不要壓縮）
2. 附上移除 quarantine 的說明
3. 考慮進行 code signing（如果是正式產品）

### 避免問題

**不要做**：
- ❌ 壓縮 `out` 目錄後分發
- ❌ 透過 cloud storage 下載後直接使用
- ❌ 使用 `cp` 複製應用（會失去某些屬性）

**應該做**：
- ✅ 分發 DMG 檔案
- ✅ 使用 `rsync -a` 複製應用（保留屬性）
- ✅ 提供 quarantine 移除指令

---

## 📊 檔案大小參考

| 項目 | 大小 | 說明 |
|------|------|------|
| DMG 檔案 | 185 MB | 壓縮過的分發檔案 |
| 安裝後大小 | 637 MB | 解壓縮後的完整應用 |
| Backend | 11 MB | 後端環境 |
| Frontend | 401 MB | 前端環境（包含 node_modules） |
| Electron | ~150 MB | Electron runtime |

---

## 🔗 相關文件

- **BUILD.md** - 打包建置指南
- **STANDALONE-TEST-REPORT.md** - 獨立性測試報告
- **FIXED-ENOTDIR.md** - spawn ENOTDIR 錯誤修復

---

## 📞 問題排查

### 問題 1: 「已損毀，無法打開」

**症狀**：雙擊應用時出現「已損毀」錯誤

**解決**：
```bash
xattr -cr "/Applications/CLAUDE PUNK.app"
```

### 問題 2: 「無法驗證開發者」

**症狀**：第一次開啟時出現無法驗證的警告

**解決**：
1. 右鍵點擊應用 → 選「打開」
2. 或：系統偏好設定 → 安全性與隱私 → 點「強制打開」

### 問題 3: DMG 無法掛載

**症狀**：雙擊 DMG 沒有反應或顯示錯誤

**解決**：
```bash
# 驗證 DMG 完整性
hdiutil verify "CLAUDE PUNK-2026.2.0-8.2205-arm64.dmg"

# 手動掛載
hdiutil attach "CLAUDE PUNK-2026.2.0-8.2205-arm64.dmg"
```

---

**版本**：1.0
**更新日期**：2026-02-08
**適用版本**：CLAUDE PUNK 2026.2.0-8.2205
