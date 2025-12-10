using Microsoft.AspNetCore.SignalR;
using System.Text;

namespace KTVChallenge.Web.Hubs;

public class GameHub : Hub
{
    // 單房版本的全域狀態
    private static readonly GameState State = new();

    // ===== 控制台：設定挑戰行 =====
    // 單一挑戰行（0-based）
    public async Task SetChallengeLine(int line)
    {
        State.ChallengeLine = line;
        await Clients.All.SendAsync(
            "ChallengeConfigUpdated",
            State.ChallengeLine,          // ? 傳單一 int
            State.Mode.ToString(),
            State.FuzzyThreshold);
    }


    // ===== 控制台：設定比對模式 =====
    public async Task SetMatchMode(string mode, int? fuzzyThreshold)
    {
        if (Enum.TryParse<MatchMode>(mode, ignoreCase: true, out var m))
            State.Mode = m;

        if (fuzzyThreshold is >= 0 and <= 10)
            State.FuzzyThreshold = fuzzyThreshold.Value;

        await Clients.All.SendAsync(
            "ChallengeConfigUpdated",
            State.ChallengeLine,          // ? 不再是陣列
            State.Mode.ToString(),
            State.FuzzyThreshold);
    }

    public async Task SetMenuMode(string mode)
    {
        // mode: "Solo" or "Team"
        await Clients.All.SendAsync("MenuModeChanged", mode);
    }

    public Task<string> GetCurrentSong()
    {
        // 這裡用你原本 StartSong 裡用的 GameSession.CurrentSong
        return Task.FromResult(GameSession.CurrentSong ?? string.Empty);
    }

    public async Task ResumeSong()
    {
        // 如果你有分組，就改成 Clients.Group("host") 之類；
        // 如果目前都是 broadcast，就先用 All 沒關係
        await Clients.All.SendAsync("ResumeSong");
    }



    // ===== 控制台：開始 / 暫停 =====
    // ? StartSong：廣播「目前歌曲」給所有人（包含舞台）
    public async Task StartSong()
    {
        // ? 從 GameSession 取目前歌曲（由 Host 設定）
        var songId = GameSession.CurrentSong;

        if (!string.IsNullOrEmpty(songId))
        {
            await Clients.All.SendAsync("SongStarted", songId);
        }
        // 如果是空的，就什麼都不做（控制台點了沒歌就當作無效操作）
    }

    public async Task Pause() =>
        await Clients.All.SendAsync("Paused");

    // ===== 舞台：進入挑戰（把原詞也送上來）=====
    public async Task EnterChallenge(int lineIndex, string originalText)
    {
        State.CurrentOriginal = originalText ?? string.Empty;
        State.CurrentIndex = lineIndex;
        await Clients.All.SendAsync("EnterChallenge", lineIndex, State.CurrentOriginal);
    }

    // ===== 控制台：更新參賽者輸入 =====
    public async Task UpdateContestant(string text) =>
        await Clients.All.SendAsync("ContestantUpdated", text);

    // ===== 控制台：請求判定 =====
    public async Task Evaluate(string contestant)
    {
        bool ok = Judge(State.CurrentOriginal, contestant, State.Mode, State.FuzzyThreshold);
        await Clients.All.SendAsync("ShowResult", ok, State.CurrentOriginal, contestant);
    }

    public async Task PublishContestant(string contestantText)
    {
        await Clients.All.SendAsync("ShowContestantText", contestantText ?? "");
    }

    public async Task RequestEnterChallenge(int lineIndex)
    {
        await Clients.All.SendAsync("RequestEnterChallenge", lineIndex);
    }

    // ====== 判定邏輯 ======
    public static bool Judge(string original, string contestant, MatchMode mode, int fuzzyThreshold)
    {
        var o = NormalizeLoose(original);
        var c = NormalizeLoose(contestant);

        if (mode == MatchMode.Strict)
            return string.Equals(original ?? "", contestant ?? "", StringComparison.Ordinal);

        if (mode == MatchMode.Loose)
            return string.Equals(o, c, StringComparison.Ordinal);

        int d = Levenshtein(o, c);
        return d <= fuzzyThreshold;
    }

    private static string NormalizeLoose(string? s)
    {
        s ??= string.Empty;
        s = s.Normalize(NormalizationForm.FormKC);
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            if (char.IsLetterOrDigit(ch) || IsCjk(ch))
                sb.Append(char.ToLowerInvariant(ch));
        }
        return sb.ToString();
    }

    private static bool IsCjk(char ch)
    {
        var u = (int)ch;
        return (u >= 0x4E00 && u <= 0x9FFF)
            || (u >= 0x3400 && u <= 0x4DBF)
            || (u >= 0xF900 && u <= 0xFAFF);
    }

    private static int Levenshtein(string a, string b)
    {
        int n = a.Length, m = b.Length;
        if (n == 0) return m;
        if (m == 0) return n;

        var prev = new int[m + 1];
        var curr = new int[m + 1];
        for (int j = 0; j <= m; j++) prev[j] = j;

        for (int i = 1; i <= n; i++)
        {
            curr[0] = i;
            for (int j = 1; j <= m; j++)
            {
                int cost = (a[i - 1] == b[j - 1]) ? 0 : 1;
                curr[j] = Math.Min(Math.Min(curr[j - 1] + 1, prev[j] + 1), prev[j - 1] + cost);
            }
            (prev, curr) = (curr, prev);
        }
        return prev[m];
    }
}

public class GameState
{
    // ? 單一挑戰行，0-based，-1 表示尚未設定
    public int ChallengeLine { get; set; } = -1;

    public MatchMode Mode { get; set; } = MatchMode.Loose;
    public int FuzzyThreshold { get; set; } = 2;

    public string CurrentOriginal { get; set; } = "";
    public int CurrentIndex { get; set; } = -1;
}

public enum MatchMode { Strict, Loose, Fuzzy }
