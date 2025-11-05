# KTV Lyric Challenge (Blazor Server + SignalR, .NET 8)

## 快速開始
1. 安裝 .NET 8 SDK。
2. 放一個音檔 `wwwroot/audio/demo.mp3`。
3. （可選）在 `wwwroot/lrc/demo.lrc` 放入你對應的 LRC 歌詞。
4. 在專案根目錄執行：
   ```bash
   dotnet restore
   dotnet run
   ```
5. 開啟兩個分頁：
   - 舞台：`http://localhost:5000/host`
   - 控制台：`http://localhost:5000/control`
6. 控制台按「開始播放」→ 舞台播放並自動載入 LRC；到 `challengeLines` 指定的行會自動進入挑戰。

## LRC 歌詞同步
- LRC 檔放在 `wwwroot/lrc/`，目前示例檔名為 `demo.lrc`。
- `wwwroot/js/gamehub.js` 中的 `challengeLines` 控制挑戰行（0-based）。
- 進入挑戰時會自動暫停、遮罩原詞，並在舞台顯示「挑戰者唱出的歌詞」。

## 注意
- 前端使用 CDN 載入 SignalR JS；如需離線，請改為本機檔案。
- 這是最小可跑版本，之後可擴充：從後台設定挑戰行、EF Core + SQLite、模糊比對等。
