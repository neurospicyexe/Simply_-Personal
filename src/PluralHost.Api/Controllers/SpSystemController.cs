using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
public class SpSystemController(PluralHostContext context) : ControllerBase
{
    // GET /v1/me — returns the single-tenant system document
    [HttpGet("v1/me")]
    public async Task<IActionResult> GetMeAsync()
    {
        // Load settings to confirm DB is reachable; future: expose username/color from settings
        _ = await context.SystemSettings.FirstAsync();

        var content = new SpSystemContent(
            Uid: "owner",
            Username: "owner",
            Desc: "",
            IsAsystem: true,
            Color: "",
            AvatarUrl: null
        );
        return Ok(SpEnvelope<SpSystemContent>.Of("owner", content));
    }
}
