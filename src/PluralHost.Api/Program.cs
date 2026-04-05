using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using PluralHost.Api.BackgroundServices;
using PluralHost.Api.Data;
using PluralHost.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Guard — fail fast if JWT signing key is missing or too short
var jwtKey = builder.Configuration["Jwt:SigningKey"];
if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32)
    throw new InvalidOperationException(
        "Jwt:SigningKey must be at least 32 characters. Set via Jwt__SigningKey env var " +
        "(or appsettings.Development.json for local development).");

builder.Services.AddDbContext<PluralHostContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default")));

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:5173")
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Jwt:Audience"],
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:SigningKey"]!)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.Zero
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                ctx.Token = ctx.Request.Cookies["token"];
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddControllers();
builder.Services.AddScoped<IGhostModeService, GhostModeService>();
builder.Services.AddScoped<IGatekeeperService, GatekeeperService>();
builder.Services.AddScoped<IShareTokenService, ShareTokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IMemberService, MemberService>();
builder.Services.AddScoped<ITokenVisibilityService, TokenVisibilityService>();
builder.Services.AddScoped<IImportService, ImportService>();
builder.Services.AddHttpClient<IAvatarDownloadService, AvatarDownloadService>()
    .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false });
builder.Services.AddHttpClient<IPluralKitClient, PluralKitClient>();
builder.Services.AddHostedService<AutoUnfreezeService>();

// Rate limiting policies
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("login", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    options.AddPolicy("freeze", httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 5,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

var app = builder.Build();

// Auto-run migrations on startup
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<PluralHostContext>();
    db.Database.Migrate();
}

app.UseExceptionHandler(err => err.Run(async ctx =>
{
    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
    ctx.Response.ContentType = "application/json";
    await ctx.Response.WriteAsJsonAsync(new { error = "Internal server error" });
}));

app.Use(async (ctx, next) =>
{
    ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
    ctx.Response.Headers["X-Frame-Options"] = "DENY";
    ctx.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    ctx.Response.Headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    await next();
});

app.UseCors();
app.UseHttpsRedirection();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.Run();
