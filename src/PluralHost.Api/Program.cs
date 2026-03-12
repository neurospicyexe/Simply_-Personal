using Microsoft.EntityFrameworkCore;
using PluralHost.Api.BackgroundServices;
using PluralHost.Api.Data;
using PluralHost.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<PluralHostContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddControllers();
builder.Services.AddScoped<IGhostModeService, GhostModeService>();
builder.Services.AddScoped<IGatekeeperService, GatekeeperService>();
builder.Services.AddScoped<IShareTokenService, ShareTokenService>();
builder.Services.AddHostedService<AutoUnfreezeService>();

var app = builder.Build();

// Auto-run migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PluralHostContext>();
    db.Database.Migrate();
}

app.MapControllers();
app.Run();
