using KTVChallenge.Web.Hubs;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using System.Text.Json;


var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();
builder.Services.AddSignalR();
builder.Services.AddHttpClient();
builder.Services.AddSingleton<KTVChallenge.Web.AppState>();

var app = builder.Build();

app.UseStaticFiles();
app.UseHttpsRedirection();

// 讓 /media 指到發佈資料夾內的 media 目錄
var mediaRoot = Path.Combine(app.Environment.ContentRootPath, "media");
var provider = new FileExtensionContentTypeProvider();
provider.Mappings[".lrc"] = "text/plain";


app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(mediaRoot),
    RequestPath = "/media",
    ContentTypeProvider = provider
});

// ② 提供歌單 API：掃描 media/audio 與 media/lrc
app.MapGet("/api/songs", () =>
{
    var audioDir = Path.Combine(mediaRoot, "audio");
    var lrcDir = Path.Combine(mediaRoot, "lrc");

    var result = new Dictionary<string, List<object>>(StringComparer.OrdinalIgnoreCase);
    if (!Directory.Exists(audioDir)) return Results.Json(result);

    foreach (var catDir in Directory.EnumerateDirectories(audioDir))
    {
        var category = Path.GetFileName(catDir);
        var songs = new List<object>();

        foreach (var mp3 in Directory.EnumerateFiles(catDir, "*.mp3"))
        {
            var name = Path.GetFileNameWithoutExtension(mp3);
            var hasLrc = File.Exists(Path.Combine(lrcDir, category, name + ".lrc"));
            songs.Add(new { Id = $"{category}/{name}", Name = name, Artist = "", HasLrc = hasLrc });
        }

        // 沒歌就別放，或想讓空類別也能點就保留空 list
        result[category] = songs;
    }

    // 確保目錄頁會出現固定的大類（即使暫無歌曲）
    string[] fixedCats =
    {
        "30萬大驚喜",
        "黃金旋律・80年代經典金曲",
        "青春記憶・90年代熱唱時光",
        "華語盛世・2000年代KTV必點",
        "流行新聲・2010年代音浪再起",
        "未來之聲・2020年代勁曲登場",
        "團體金曲・合唱最強戰隊",
        "偶像劇金曲・回憶殺來襲",
        "搖滾時刻・熱血沸騰能量爆發"
    };
    foreach (var fc in fixedCats)
        result.TryAdd(fc, new List<object>());

    return Results.Json(result, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
});

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}



// 服務 wwwroot 靜態檔，加入自訂 ContentTypeProvider
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = provider
});
app.UseRouting();

app.MapBlazorHub();
app.MapHub<GameHub>("/gamehub");
app.MapFallbackToPage("/_Host");

app.Run();
