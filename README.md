# 故事島

給孩子用的群島學習網站：限時測驗、錯題重練、學習卡、搶答賽、公主更衣室。

## 資料夾

| 資料夾 | 放什麼 |
|---|---|
| `engine/` | 題目解析、計時、判分（不含題目和個人資料） |
| `world/` | three.js 群島場景 |
| `avatar/` | 公主紙娃娃、更衣室、商店 |
| `games/` | 小遊戲（搶答賽） |
| `content/levels/` | 關卡檔 .md（每個家庭自己的題目） |
| `assets/` | 圖片、音樂、字型，每個素材旁邊放授權說明 |
| `config/` | 設定檔：後台網址、歐巴幣數字、主題 |
| `backend/` | Google Apps Script 進度後台 |
| `docs/` | 使用說明、資料格式 |

## 重要

這個 repo 是公開的，只能放程式和題目。考卷掃描檔、作答紀錄、密碼都不要放進來。

第三方元件的授權見 `LICENSES.md`。

## 測試

裝了 Node 的電腦可以在這個資料夾執行：

```
node tests/levels.test.mjs
node tests/quiz.test.mjs
node tests/cloud.test.mjs
node tests/cards.test.mjs
node tests/generate.test.mjs
node tests/phone.test.mjs
```

測驗引擎的說明見 `docs/測驗引擎.md`；登入與雲端進度見 `docs/雲端進度.md`（後台網址填在 `config/backend.json`）；學習屋見 `docs/學習屋.md`（參數在 `config/cards.json`）；出題模組和綜合練習見 `docs/出題模組.md`（數字範圍在 `config/generators/`，綜合練習在 `config/mix.json`）。歐巴幣和寶石見 `docs/資源帳本.md`（數字在 `config/economy.json`，家裡的小孩在 `config/family.json`）。每日登入獎勵和累計登入成就見 `docs/每日登入.md`。
