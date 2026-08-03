<div align="center">
  <h1>agent-sync</h1>
  <p><strong>一個資料夾，搞定你電腦裡所有 AI 助手的設定與技能招式！</strong></p>

  <p>
    <a href="https://github.com/heartpleasure101-stack/agent-sync/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License" /></a>
    <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun%201.3%2B-black.svg" alt="Bun 1.3+" /></a>
  </p>

  <p><em>自動偵測已安裝 AI所需技能與設定 • 免安裝貼上即跑 • 內建一鍵自動備份與還原</em></p>
</div>

---

## 1. Header & Visual Hook (標頭與視覺錨點)

- **Title & Subtitle**：`agent-sync` —— 把所有 AI 助手（Claude, ChatGPT, Cursor 等）的招式與規則通通綁定，再也不用手動複製貼上！
- **Badges**：顯示 MIT 免費開源授權與 Bun 執行環境。
- **Visual Demo**：畫面向導會自動幫你看電腦裡裝了哪些 AI 工具，按空白鍵就能輕鬆勾選要用的技能招式！

```text
┌──────────────────────────────────────────────────────────┐
│  agent-sync — 請選擇要設定的 AI 助手                       │
│  已偵測到電腦已安裝：Claude, Gemini                       │
│                                                          │
│  [ 分頁: 寫程式招式 ]  [ 分頁: 寫文件招式 ]                  │
│  [x] 自動寫 Commit   [ ] 自動寫 PR 描述  [ ] 程式檢查     │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Quick Start (快速上手)

- **Prerequisites（前置要求）**：
  - **使用者**：只要電腦裝有 **Node.js 22+**（`npx` 內建於 Node，不用另外裝）。**不需要 Bun**。
  - **開發者**（想自己改 code、build、發版本）：除了 Node.js 22+，再裝 **Bun 1.3+**（僅用於執行 `bun run build`）。
  - **沒裝 Node.js？** 挑一個平台指令跑：
    - macOS：`brew install node@22`
    - Windows：`winget install OpenJS.NodeJS`
    - Linux（用 nvm）：`nvm install 22`
    - 或到官網下載：<https://nodejs.org>
  - CLI 啟動時會自動檢查 Node 版本；若版本 < 22 會顯示中文提示與對應的安裝指令，不會拋出堆疊錯誤。
- **One-Liner Command（單行執行指令）**：打開終端機 (Terminal)，複製貼上這行指令就能立刻開始：

  ```bash
  npx github:heartpleasure101-stack/agent-sync
  ```

  （如果您是用 Bun 的朋友，也可以跑 `bunx github:heartpleasure101-stack/agent-sync`）

- **Scope Explanation（作用域說明）**：
  - **全域套用 (Global `~`)**：設定一次，電腦裡所有專案的 AI 助手都能一起共享招式與規則！
  - **單一專案套用 (Project)**：只針對您現在開啟的這個專案做設定。本源預設共用 `~/.agents/`（免去對每個新專案手動建立 symlink 的儀式），Client 資料夾落點仍為專案目錄下。
  - **Fallback Prompt**：若 `~/.agents/` 不存在，CLI 啟動時會跳出選單引導您：
    1. 建立空的 `~/.agents/`（預設）
    2. 指定其它資料夾作為 canonical 本源（僅當次 session 有效）
    3. 取消

### 從舊版遷移 (Migration from Older Versions)

若您的既有專案內含有舊版建立的 `專案/.agents/` 實體資料夾（非 symlink），新版 `agent-sync` 預設改讀 `~/.agents/`。您可以將專案內本源遷移至全域：

```bash
rsync -a .agents/ ~/.agents/ && rm -rf .agents
```

*註：若專案內 `.agents` 已經是指向 `~/.agents` 的 symlink，則不需任何處理。*

---

## 3. Features & Architecture (專案重點與架構矩陣)

- **Key Features（核心特色）**：
  - 🎯 **一個地方改，全部一起變 (Single Source of Truth)**：規則與技能統一放在 `.agents` 資料夾，不用每個 AI 工具分開改。
  - 🔍 **聰明自動偵測 (Smart Client Detection)**：自動掃描您電腦裡裝了哪些 AI 工具並貼心提醒，省去手動檢查的時間。
  - 🎛️ **要用什麼自己挑 (Opt-in Selection)**：選單預設不強迫全選，只幫您設定您真正有在用的 AI 工具。
  - 📂 **像分頁一樣好選的技能盒 (Tabbed Skill Picker)**：技能按類別分類，用鍵盤左右鍵或 `Tab` 就能像瀏覽器切換分頁一樣輕鬆挑選。
  - 🔗 **精準安全連線 (Per-Skill Symlinks)**：只把您勾選的技能連線過去，絕不弄亂您原本的資料夾。

- **Target Mapping Matrix（對照表）**：

  #### 支援的 9 大 AI 助手對照表 (Global Scope `~`)
  | AI 助手 (Client) | 設定位置 | 規則檔案 | 指令與提示詞位置 | 技能招式位置 |
  | --- | --- | --- | --- | --- |
  | **Claude** | `~/.claude/` | `CLAUDE.md` (或 `AGENTS.md`) | `commands/` | `skills/<技能名稱>` |
  | **Gemini** | `~/.gemini/` | `GEMINI.md` (或 `AGENTS.md`) | `commands/` | `skills/<技能名稱>` |
  | **Factory** | `~/.factory/` | `AGENTS.md` | `commands/` | `skills/<技能名稱>` |
  | **Codex** | `~/.codex/` | `AGENTS.md` | `prompts/` | `skills/<技能名稱>` |
  | **OpenCode** | `~/.config/opencode/` | `AGENTS.md` | `commands/` | `skills/<技能名稱>` |
  | **Cursor** | `~/.cursor/` | *(工具自動讀取)* | `commands/` | `skills/<技能名稱>` |
  | **Antigravity** | `~/.gemini/antigravity/` | *(工具自動讀取)* | `workflows/` | `skills/<技能名稱>` |
  | **GitHub Copilot** | `~/.copilot/` | *(工具自動讀取)* | *(預設無)* | `skills/<技能名稱>` |
  | **AmpCode** | `~/.ampcode/` | `AGENTS.md` | *(預設無)* | *(預設無)* |

  #### 規則優先順序（簡單好懂）
  - **Claude**：優先讀取 `.agents/CLAUDE.md`，找不到時會自動改成使用 `.agents/AGENTS.md`。
  - **Gemini**：優先讀取 `.agents/GEMINI.md`，找不到時會自動改成使用 `.agents/AGENTS.md`。
  - **其他 AI 助手**：統一讀取 `.agents/AGENTS.md`。

---

## 4. Development, Build & Deploy Pipeline (開發與部署/發布)

- **Local Development（本地開發）**：
  如果您想自己修改或加強這個工具：
  ```bash
  # 啟動開發試跑模式
  bun run dev

  # 檢查程式碼有沒有寫錯型態
  bun run type-check

  # 執行自動測試確認功能正常
  bun test
  ```

- **Build & Publish Architecture（建置與發布架構）**：
  - **自動打包打包外掛 (Bundling Mechanism)**：使用 `bun run build.mjs` 打包成單一檔案，並自動替換掉容易出錯的除錯模組，讓任何人的電腦都能順利跑起來。
  - **免上架直接跑 (Zero-npm Deployment)**：打包好的檔案直接存在 GitHub 上，大家不用去 npm 下載，用 `npx github:owner/repo` 就能直接跑最新版！
  - **500 毫秒安全檢查 (Smoke Verification)**：每次打包都會跑 `bun run smoke` 測試，確認程式可以在 0.5 秒內順利啟動、不會卡住。

---

## 5. Governance & License (維護與授權)

- **Backups & Restore（備份與安全復原）**：
  免驚！每次修改設定前，系統都會自動在 `.agents/backup/` 資料夾存一份備份。如果設定錯了，只要在選單點選 **「Undo last change」** 就能一鍵回到上一次的狀態！

- **Upstream Credit（上游專案聲明）**：
  本專案衍生自 [iannuttall/dotagents](https://github.com/iannuttall/dotagents)，感謝原作者 Ian Nuttall 之開源貢獻。詳細版權宣告保留於 [LICENSE](LICENSE)。

- **License（開源授權）**：
  本專案完全免費開源，採用 [MIT License](LICENSE) 授權，歡迎自由使用與分享！
