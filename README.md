# Phaser Gameplay Prototype

一個用來快速驗證遊戲玩法的極簡 Phaser 3 專案，使用 Vite 與 TypeScript。

## 開始使用

```bash
npm install
npm run dev
```

終端機會顯示本機網址，通常是 <http://localhost:5173>。

## 常用指令

- `npm run dev`：啟動開發伺服器與熱更新
- `npm run build`：檢查型別並建立正式版檔案
- `npm run preview`：預覽正式版

## 從哪裡開始

直接編輯 `src/main.ts` 裡的 `PrototypeScene`。目前已設定：

- 960 × 540 的遊戲畫面，會自動等比例縮放並置中
- Arcade Physics（預設無重力）
- 一個可立即替換的空白原型場景

需要圖片、音效等資源時，可建立 `public/assets/` 並從 `/assets/檔名` 載入。
