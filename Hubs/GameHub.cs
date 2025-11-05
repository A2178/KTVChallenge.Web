using Microsoft.AspNetCore.SignalR;

namespace KTVChallenge.Web.Hubs;

public class GameHub : Hub
{
    public async Task StartSong(string songId) =>
        await Clients.All.SendAsync("SongStarted", songId);

    public async Task Pause() =>
        await Clients.All.SendAsync("Paused");

    public async Task EnterChallenge(int lineIndex) =>
        await Clients.All.SendAsync("EnterChallenge", lineIndex);

    public async Task UpdateContestant(string text) =>
        await Clients.All.SendAsync("ContestantUpdated", text);

    public async Task ShowResult(bool ok) =>
        await Clients.All.SendAsync("ShowResult", ok);
}
