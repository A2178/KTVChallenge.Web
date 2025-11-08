using KTVChallenge.Web.Hubs;
using Microsoft.AspNetCore.StaticFiles;


var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorPages();
builder.Services.AddServerSideBlazor();
builder.Services.AddSignalR();

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();
var provider = new FileExtensionContentTypeProvider();
provider.Mappings[".lrc"] = "text/plain; charset=utf-8";

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
