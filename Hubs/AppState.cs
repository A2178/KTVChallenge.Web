namespace KTVChallenge.Web
{
    public class AppState
    {
        /// <summary>
        /// 是否為團體賽選歌模式（/menu-team）
        /// </summary>
        public bool IsTeamMode { get; set; }

        /// <summary>
        /// 目前選到的歌曲類別名稱（例如：真心好聲關懷隊、老歌回味...）
        /// </summary>
        public string? SelectedCategory { get; set; }

        /// <summary>
        /// 目前選到的團體名稱（只在團體賽時使用）
        /// 例如：真心好聲關懷隊
        /// </summary>
        public string? SelectedTeam { get; set; }
    }
}
