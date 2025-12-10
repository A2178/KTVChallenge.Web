namespace KTVChallenge.Web.Hubs
{
    /// <summary>
    /// 單房間版本：共用目前這一場要唱的歌曲 Id。
    /// 格式會是「類別/歌手_歌名」，例如：「黃金旋律・80年代經典金曲/周華健_朋友」
    /// </summary>
    public static class GameSession
    {
        public static string CurrentSong { get; set; } = "";
    }
}