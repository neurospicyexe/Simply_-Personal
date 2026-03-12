using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<PluralHostContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddControllers();

var app = builder.Build();

// Auto-run migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PluralHostContext>();
    db.Database.Migrate();
}

app.MapControllers();
app.Run();
