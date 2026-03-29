# System Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a force-directed interactive System Map to MembersPage that visualizes group membership and custom alter-to-alter relationships, toggled alongside the existing List view.

**Architecture:** `MemberRelationship` entity (soft-delete + Ghost Mode) backed by `MemberRelationshipsController`. Frontend adds `@xyflow/react` + `d3-force` for layout; `SystemMap` component runs a synchronous d3 simulation on mount to compute positions, then renders via React Flow with custom `MemberNode`, `GroupNode`, `RelationshipEdge` types. Mode chips (Groups / Relationships / Both) filter visible node/edge types. Drag-to-connect between `MemberNode` handles opens `NewRelationshipSheet`.

**Tech Stack:** .NET 8 / EF Core 8 / SQLite, xUnit + EF InMemory, React + TypeScript + Vite, @xyflow/react v12, d3-force, TanStack Query, CSS Modules, BottomSheet component

---

## File Map

**Create:**
- `src/PluralHost.Api/Domain/MemberRelationship.cs`
- `src/PluralHost.Api/Controllers/MemberRelationshipsController.cs`
- `src/PluralHost.Api/Data/Migrations/<timestamp>_AddMemberRelationships.cs` (via dotnet ef)
- `tests/PluralHost.Tests/Controllers/MemberRelationshipsControllerTests.cs`
- `src/PluralHost.Web/src/api/relationships.ts`
- `src/PluralHost.Web/src/components/SystemMap/SystemMap.tsx`
- `src/PluralHost.Web/src/components/SystemMap/SystemMap.module.css`
- `src/PluralHost.Web/src/components/SystemMap/MemberNode.tsx`
- `src/PluralHost.Web/src/components/SystemMap/GroupNode.tsx`
- `src/PluralHost.Web/src/components/SystemMap/RelationshipEdge.tsx`
- `src/PluralHost.Web/src/components/SystemMap/NewRelationshipSheet.tsx`
- `src/PluralHost.Web/src/__tests__/SystemMap.test.tsx`
- `src/PluralHost.Web/src/__tests__/NewRelationshipSheet.test.tsx`

**Modify:**
- `src/PluralHost.Api/Data/PluralHostContext.cs` — add DbSet + Ghost Mode filter + FK config
- `src/PluralHost.Api/Dto/NativeDtos.cs` — add relationship DTOs
- `src/PluralHost.Web/src/types.ts` — add `MemberRelationship` type
- `src/PluralHost.Web/src/pages/MembersPage.tsx` — add 'map' ViewMode + toggle + render SystemMap
- `src/PluralHost.Web/src/pages/MembersPage.module.css` — toggle button styles
- `src/PluralHost.Web/src/components/tabs/DossierTab.tsx` — Connections section
- `src/PluralHost.Web/src/components/tabs/DossierTab.module.css` — connection row styles

---

## Task 1: MemberRelationship entity + backend

**Files:**
- Create: `src/PluralHost.Api/Domain/MemberRelationship.cs`
- Modify: `src/PluralHost.Api/Data/PluralHostContext.cs`
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`
- Create: `src/PluralHost.Api/Controllers/MemberRelationshipsController.cs`
- Create: `tests/PluralHost.Tests/Controllers/MemberRelationshipsControllerTests.cs`
- Create: migration via `dotnet ef`

- [ ] **Step 1: Write the failing tests**

Create `tests/PluralHost.Tests/Controllers/MemberRelationshipsControllerTests.cs`:

```csharp
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Controllers;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Tests.Controllers;

public class MemberRelationshipsControllerTests
{
    private static (PluralHostContext ctx, MemberRelationshipsController ctrl) Setup(string db)
    {
        var opts = new DbContextOptionsBuilder<PluralHostContext>()
            .UseInMemoryDatabase(db)
            .Options;
        var ctx = new PluralHostContext(opts);
        ctx.SystemSettings.Add(new SystemSettings { Id = 1 });
        ctx.SaveChanges();
        return (ctx, new MemberRelationshipsController(ctx));
    }

    private static Guid SeedMember(PluralHostContext ctx)
    {
        var id = Guid.NewGuid();
        ctx.Members.Add(new Member { Id = id, Name = "Test", BucketId = PrivacyBucket.PublicId });
        ctx.SaveChanges();
        return id;
    }

    [Fact]
    public async Task GetAll_ReturnsNonDeletedRelationships()
    {
        var (ctx, ctrl) = Setup(nameof(GetAll_ReturnsNonDeletedRelationships));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        ctx.MemberRelationships.Add(new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "siblings" });
        var deleted = new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "old" };
        deleted.SoftDelete();
        ctx.MemberRelationships.Add(deleted);
        ctx.SaveChanges();

        var result = await ctrl.GetAllAsync();
        var ok = Assert.IsType<OkObjectResult>(result);
        var items = Assert.IsAssignableFrom<IEnumerable<MemberRelationshipResponse>>(ok.Value);
        Assert.Single(items);
        Assert.Equal("siblings", items.First().Label);
    }

    [Fact]
    public async Task GetAll_WhenFrozen_ReturnsEmpty()
    {
        var (ctx, ctrl) = Setup(nameof(GetAll_WhenFrozen_ReturnsEmpty));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        ctx.MemberRelationships.Add(new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "siblings" });
        var settings = ctx.SystemSettings.First();
        settings.IsFrozen = true;
        ctx.SaveChanges();

        var result = await ctrl.GetAllAsync();
        var ok = Assert.IsType<OkObjectResult>(result);
        var items = Assert.IsAssignableFrom<IEnumerable<MemberRelationshipResponse>>(ok.Value);
        Assert.Empty(items);
    }

    [Fact]
    public async Task Create_WithValidMembers_Returns201()
    {
        var (ctx, ctrl) = Setup(nameof(Create_WithValidMembers_Returns201));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "parent of", true));
        var created = Assert.IsType<CreatedAtActionResult>(result);
        var rel = Assert.IsType<MemberRelationshipResponse>(created.Value);
        Assert.Equal("parent of", rel.Label);
        Assert.True(rel.IsDirected);
        Assert.Equal(fromId, rel.FromMemberId);
        Assert.Equal(toId, rel.ToMemberId);
    }

    [Fact]
    public async Task Create_WithDeletedMember_Returns400()
    {
        var (ctx, ctrl) = Setup(nameof(Create_WithDeletedMember_Returns400));
        var fromId = SeedMember(ctx);
        var member = ctx.Members.Find(fromId)!;
        member.SoftDelete();
        ctx.SaveChanges();
        var toId = SeedMember(ctx);

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "siblings", false));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Create_WithEmptyLabel_Returns400()
    {
        var (ctx, ctrl) = Setup(nameof(Create_WithEmptyLabel_Returns400));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);

        var result = await ctrl.CreateAsync(new MemberRelationshipCreateRequest(fromId, toId, "   ", false));
        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task Patch_UpdatesLabelAndDirection()
    {
        var (ctx, ctrl) = Setup(nameof(Patch_UpdatesLabelAndDirection));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        var rel = new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "old", IsDirected = false };
        ctx.MemberRelationships.Add(rel);
        ctx.SaveChanges();

        var result = await ctrl.UpdateAsync(rel.Id, new MemberRelationshipUpdateRequest("new label", true));
        var ok = Assert.IsType<OkObjectResult>(result);
        var updated = Assert.IsType<MemberRelationshipResponse>(ok.Value);
        Assert.Equal("new label", updated.Label);
        Assert.True(updated.IsDirected);
    }

    [Fact]
    public async Task Patch_NotFound_Returns404()
    {
        var (_, ctrl) = Setup(nameof(Patch_NotFound_Returns404));
        var result = await ctrl.UpdateAsync(Guid.NewGuid(), new MemberRelationshipUpdateRequest("x", null));
        Assert.IsType<NotFoundResult>(result);
    }

    [Fact]
    public async Task Delete_SoftDeletesRelationship()
    {
        var (ctx, ctrl) = Setup(nameof(Delete_SoftDeletesRelationship));
        var fromId = SeedMember(ctx);
        var toId = SeedMember(ctx);
        var rel = new MemberRelationship { FromMemberId = fromId, ToMemberId = toId, Label = "rivals" };
        ctx.MemberRelationships.Add(rel);
        ctx.SaveChanges();

        var result = await ctrl.DeleteAsync(rel.Id);
        Assert.IsType<NoContentResult>(result);

        var inDb = ctx.MemberRelationships.IgnoreQueryFilters().First(r => r.Id == rel.Id);
        Assert.NotNull(inDb.DeletedAt);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/dev/simply-personal
dotnet test tests/PluralHost.Tests --filter "MemberRelationshipsController" -v minimal 2>&1 | tail -5
```
Expected: build error — `MemberRelationship`, `MemberRelationshipResponse`, `MemberRelationshipsController` don't exist yet.

- [ ] **Step 3: Create the entity**

Create `src/PluralHost.Api/Domain/MemberRelationship.cs`:

```csharp
namespace PluralHost.Api.Domain;

public class MemberRelationship : BaseEntity
{
    public required Guid FromMemberId { get; set; }
    public Member? FromMember { get; set; }
    public required Guid ToMemberId { get; set; }
    public Member? ToMember { get; set; }
    public required string Label { get; set; } // trimmed, max 100
    public bool IsDirected { get; set; } = false;
}
```

- [ ] **Step 4: Add DTOs to NativeDtos.cs**

In `src/PluralHost.Api/Dto/NativeDtos.cs`, append at the end of the file (before the closing namespace brace if there is one, or just after the last record):

```csharp
public record MemberRelationshipResponse(
    Guid Id,
    Guid FromMemberId,
    Guid ToMemberId,
    string Label,
    bool IsDirected,
    DateTime CreatedAt,
    DateTime UpdatedAt);

public record MemberRelationshipCreateRequest(
    Guid FromMemberId,
    Guid ToMemberId,
    string Label,
    bool IsDirected = false);

public record MemberRelationshipUpdateRequest(
    string? Label,
    bool? IsDirected);
```

- [ ] **Step 5: Register in PluralHostContext**

In `src/PluralHost.Api/Data/PluralHostContext.cs`:

Add DbSet after the last existing DbSet line (after `PrivacyBuckets`):
```csharp
public DbSet<MemberRelationship> MemberRelationships => Set<MemberRelationship>();
```

Add in `OnModelCreating`, after the PrivacyBucket block (before the closing brace):
```csharp
// MemberRelationship: soft-delete + Ghost Mode
modelBuilder.Entity<MemberRelationship>()
    .HasQueryFilter(r =>
        r.DeletedAt == null &&
        !Set<SystemSettings>().Where(s => s.Id == 1).Select(s => s.IsFrozen).FirstOrDefault());

modelBuilder.Entity<MemberRelationship>()
    .Property(r => r.Label)
    .HasMaxLength(100)
    .IsRequired();

modelBuilder.Entity<MemberRelationship>()
    .HasOne(r => r.FromMember)
    .WithMany()
    .HasForeignKey(r => r.FromMemberId)
    .OnDelete(DeleteBehavior.NoAction);

modelBuilder.Entity<MemberRelationship>()
    .HasOne(r => r.ToMember)
    .WithMany()
    .HasForeignKey(r => r.ToMemberId)
    .OnDelete(DeleteBehavior.NoAction);
```

- [ ] **Step 6: Create the controller**

Create `src/PluralHost.Api/Controllers/MemberRelationshipsController.cs`:

```csharp
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using PluralHost.Api.Data;
using PluralHost.Api.Domain;
using PluralHost.Api.Dto;

namespace PluralHost.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/members/relationships")]
public class MemberRelationshipsController(PluralHostContext context) : ControllerBase
{
    private static MemberRelationshipResponse ToResponse(MemberRelationship r) =>
        new(r.Id, r.FromMemberId, r.ToMemberId, r.Label, r.IsDirected, r.CreatedAt, r.UpdatedAt);

    [HttpGet]
    public async Task<IActionResult> GetAllAsync()
    {
        var rels = await context.MemberRelationships
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync();
        return Ok(rels.Select(ToResponse));
    }

    [HttpPost]
    public async Task<IActionResult> CreateAsync([FromBody] MemberRelationshipCreateRequest body)
    {
        if (string.IsNullOrWhiteSpace(body.Label))
            return BadRequest(new { error = "Label is required" });

        var fromExists = await context.Members.AnyAsync(m => m.Id == body.FromMemberId);
        if (!fromExists) return BadRequest(new { error = "FromMember not found or deleted" });

        var toExists = await context.Members.AnyAsync(m => m.Id == body.ToMemberId);
        if (!toExists) return BadRequest(new { error = "ToMember not found or deleted" });

        var rel = new MemberRelationship
        {
            FromMemberId = body.FromMemberId,
            ToMemberId = body.ToMemberId,
            Label = body.Label.Trim(),
            IsDirected = body.IsDirected
        };
        context.MemberRelationships.Add(rel);
        await context.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAllAsync), ToResponse(rel));
    }

    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> UpdateAsync(Guid id, [FromBody] MemberRelationshipUpdateRequest body)
    {
        var rel = await context.MemberRelationships.FirstOrDefaultAsync(r => r.Id == id);
        if (rel is null) return NotFound();

        if (body.Label is not null)
        {
            if (string.IsNullOrWhiteSpace(body.Label))
                return BadRequest(new { error = "Label is required" });
            rel.Label = body.Label.Trim();
        }
        if (body.IsDirected is not null) rel.IsDirected = body.IsDirected.Value;

        await context.SaveChangesAsync();
        return Ok(ToResponse(rel));
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteAsync(Guid id)
    {
        var rel = await context.MemberRelationships.FirstOrDefaultAsync(r => r.Id == id);
        if (rel is null) return NotFound();

        rel.SoftDelete();
        await context.SaveChangesAsync();
        return NoContent();
    }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd /c/dev/simply-personal
dotnet test tests/PluralHost.Tests --filter "MemberRelationshipsController" -v minimal 2>&1 | tail -5
```
Expected: `Passed! - Failed: 0, Passed: 8`

- [ ] **Step 8: Generate the migration**

```bash
cd /c/dev/simply-personal
dotnet ef migrations add AddMemberRelationships --project src/PluralHost.Api --output-dir Data/Migrations
dotnet ef database update --project src/PluralHost.Api
```
Expected: migration file created in `Data/Migrations/`, database updated.

- [ ] **Step 9: Run all backend tests to check for regressions**

```bash
cd /c/dev/simply-personal
dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -3
```
Expected: all prior tests + 8 new = `Passed: 307` (299 + 8).

- [ ] **Step 10: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Api/Domain/MemberRelationship.cs \
        src/PluralHost.Api/Controllers/MemberRelationshipsController.cs \
        src/PluralHost.Api/Data/PluralHostContext.cs \
        src/PluralHost.Api/Dto/NativeDtos.cs \
        src/PluralHost.Api/Data/Migrations/ \
        tests/PluralHost.Tests/Controllers/MemberRelationshipsControllerTests.cs
git commit -m "feat: MemberRelationship entity, controller, and migration"
```

---

## Task 2: Frontend types + api/relationships.ts

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts`
- Create: `src/PluralHost.Web/src/api/relationships.ts`

- [ ] **Step 1: Write the failing test**

Add a test for `relationshipsApi.list` by creating `src/PluralHost.Web/src/__tests__/relationships.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../api/apiFetch', () => ({
  apiFetch: vi.fn(),
}))

import { apiFetch } from '../api/apiFetch'
import { relationshipsApi } from '../api/relationships'

const mockFetch = vi.mocked(apiFetch)

beforeEach(() => { mockFetch.mockReset() })

describe('relationshipsApi', () => {
  it('list calls GET /api/members/relationships', async () => {
    mockFetch.mockResolvedValue([])
    await relationshipsApi.list()
    expect(mockFetch).toHaveBeenCalledWith('/api/members/relationships')
  })

  it('create calls POST with payload', async () => {
    mockFetch.mockResolvedValue({ id: '1' })
    await relationshipsApi.create({ fromMemberId: 'a', toMemberId: 'b', label: 'siblings', isDirected: false })
    expect(mockFetch).toHaveBeenCalledWith('/api/members/relationships', {
      method: 'POST',
      body: JSON.stringify({ fromMemberId: 'a', toMemberId: 'b', label: 'siblings', isDirected: false }),
    })
  })

  it('update calls PATCH with id', async () => {
    mockFetch.mockResolvedValue({ id: '1' })
    await relationshipsApi.update('abc', { label: 'rivals' })
    expect(mockFetch).toHaveBeenCalledWith('/api/members/relationships/abc', {
      method: 'PATCH',
      body: JSON.stringify({ label: 'rivals' }),
    })
  })

  it('remove calls DELETE with id', async () => {
    mockFetch.mockResolvedValue(undefined)
    await relationshipsApi.remove('abc')
    expect(mockFetch).toHaveBeenCalledWith('/api/members/relationships/abc', { method: 'DELETE' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run src/__tests__/relationships.test.ts 2>&1 | tail -5
```
Expected: FAIL — `relationshipsApi` not found.

- [ ] **Step 3: Add MemberRelationship type to types.ts**

In `src/PluralHost.Web/src/types.ts`, append after the last export:

```ts
export interface MemberRelationship {
  id: string
  fromMemberId: string
  toMemberId: string
  label: string
  isDirected: boolean
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 4: Create api/relationships.ts**

Create `src/PluralHost.Web/src/api/relationships.ts`:

```ts
import { apiFetch } from './apiFetch'
import type { MemberRelationship } from '../types'

export const relationshipsApi = {
  list: (): Promise<MemberRelationship[]> =>
    apiFetch('/api/members/relationships'),

  create: (payload: {
    fromMemberId: string
    toMemberId: string
    label: string
    isDirected: boolean
  }): Promise<MemberRelationship> =>
    apiFetch('/api/members/relationships', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: { label?: string; isDirected?: boolean }): Promise<MemberRelationship> =>
    apiFetch(`/api/members/relationships/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  remove: (id: string): Promise<void> =>
    apiFetch(`/api/members/relationships/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run src/__tests__/relationships.test.ts 2>&1 | tail -5
```
Expected: `Passed! - Failed: 0, Passed: 4`

- [ ] **Step 6: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Web/src/types.ts \
        src/PluralHost.Web/src/api/relationships.ts \
        src/PluralHost.Web/src/__tests__/relationships.test.ts
git commit -m "feat: MemberRelationship type and relationships API module"
```

---

## Task 3: Install packages + MemberNode + GroupNode

**Files:**
- Modify: `src/PluralHost.Web/package.json` (via npm install)
- Create: `src/PluralHost.Web/src/components/SystemMap/MemberNode.tsx`
- Create: `src/PluralHost.Web/src/components/SystemMap/GroupNode.tsx`
- Create: `src/PluralHost.Web/src/components/SystemMap/SystemMap.module.css` (initial styles)

- [ ] **Step 1: Install packages**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npm install @xyflow/react d3-force
npm install --save-dev @types/d3-force
```
Expected: packages added to `package.json`, no errors.

- [ ] **Step 2: Write the failing tests for MemberNode and GroupNode**

Create `src/PluralHost.Web/src/__tests__/SystemMap.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ReactFlowProvider } from '@xyflow/react'

vi.mock('../api/relationships', () => ({
  relationshipsApi: { list: vi.fn().mockResolvedValue([]) },
}))
vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQuery: vi.fn().mockReturnValue({ data: [], isLoading: false }),
    useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  }
})

import { MemberNode } from '../components/SystemMap/MemberNode'
import { GroupNode } from '../components/SystemMap/GroupNode'

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

const memberData = { id: 'mem-1', name: 'Jude', color: '#b6ff00', isFronting: false, isIsolated: false }
const groupData = { name: 'Inner Circle', color: '#b6ff00', memberNodeIds: ['mem-1'] }

function NodeWrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter><ReactFlowProvider>{children}</ReactFlowProvider></MemoryRouter>
}

describe('MemberNode', () => {
  it('renders member name', () => {
    render(
      <NodeWrapper>
        <MemberNode
          data={memberData}
          id="mem-1"
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable={true}
          type="member"
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </NodeWrapper>
    )
    expect(screen.getByText('Jude')).toBeInTheDocument()
  })

  it('navigates to member detail on click', () => {
    render(
      <NodeWrapper>
        <MemberNode
          data={memberData}
          id="mem-1"
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable={true}
          type="member"
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </NodeWrapper>
    )
    fireEvent.click(screen.getByText('Jude').closest('div')!)
    expect(mockNavigate).toHaveBeenCalledWith('/members/mem-1')
  })
})

describe('GroupNode', () => {
  it('renders group name', () => {
    render(
      <NodeWrapper>
        <GroupNode
          data={groupData}
          id="grp-1"
          selected={false}
          dragging={false}
          zIndex={0}
          isConnectable={true}
          type="group"
          positionAbsoluteX={0}
          positionAbsoluteY={0}
        />
      </NodeWrapper>
    )
    expect(screen.getByText('Inner Circle')).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run src/__tests__/SystemMap.test.tsx 2>&1 | tail -8
```
Expected: FAIL — MemberNode, GroupNode not found.

- [ ] **Step 4: Create SystemMap.module.css (initial)**

Create `src/PluralHost.Web/src/components/SystemMap/SystemMap.module.css`:

```css
.canvas {
  width: 100%;
  height: calc(100vh - 180px);
  background: #0d0d0d;
  border-radius: 10px;
  position: relative;
}

/* MemberNode */
.memberNode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.memberCircle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #1a1a1a;
  border: 2px solid var(--node-color, var(--color-primary));
}

.memberNode.isolated .memberCircle {
  border-style: dashed;
  opacity: 0.5;
}

.memberNode.fronting .memberCircle {
  box-shadow: 0 0 0 3px var(--node-color, var(--color-primary));
  animation: frontingPulse 2s ease-in-out infinite;
}

@keyframes frontingPulse {
  0%, 100% { box-shadow: 0 0 0 2px var(--node-color, var(--color-primary)); }
  50% { box-shadow: 0 0 0 5px var(--node-color, var(--color-primary)); }
}

.memberLabel {
  font-size: 10px;
  color: #ccc;
  text-align: center;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.handle {
  opacity: 0;
  pointer-events: all;
}

/* GroupNode */
.groupNode {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px 12px;
  border-radius: 13px;
  height: 26px;
  border: 1.5px solid var(--node-color, #666);
  background: color-mix(in srgb, var(--node-color, #666) 12%, transparent);
  cursor: pointer;
  transition: filter 0.15s;
}

.groupNode:hover {
  filter: brightness(1.2);
}

.groupLabel {
  font-size: 10px;
  color: var(--node-color, #666);
  font-weight: 600;
}

/* Mode chips */
.modeChips {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.chip {
  padding: 3px 10px;
  border-radius: 20px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid #333;
  background: #1a1a1a;
  color: #666;
  transition: background 0.15s, color 0.15s;
}

.chip.active {
  background: var(--color-primary);
  color: #000;
  border-color: var(--color-primary);
}
```

- [ ] **Step 5: Create MemberNode**

Create `src/PluralHost.Web/src/components/SystemMap/MemberNode.tsx`:

```tsx
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { useNavigate } from 'react-router-dom'
import styles from './SystemMap.module.css'

export type MemberNodeData = {
  id: string
  name: string
  color?: string
  isFronting: boolean
  isIsolated: boolean
}

export type MemberNodeType = Node<MemberNodeData, 'member'>

export function MemberNode({ data }: NodeProps<MemberNodeType>) {
  const navigate = useNavigate()
  const color = data.color ?? 'var(--color-primary)'
  const cls = [
    styles.memberNode,
    data.isFronting ? styles.fronting : '',
    data.isIsolated ? styles.isolated : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={cls}
      style={{ '--node-color': color } as React.CSSProperties}
      onClick={() => navigate(`/members/${data.id}`)}
    >
      <Handle type="source" position={Position.Top} className={styles.handle} />
      <Handle type="target" position={Position.Top} className={styles.handle} id="target" />
      <div className={styles.memberCircle} />
      <span className={styles.memberLabel}>{data.name}</span>
    </div>
  )
}
```

- [ ] **Step 6: Create GroupNode**

Create `src/PluralHost.Web/src/components/SystemMap/GroupNode.tsx`:

```tsx
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import styles from './SystemMap.module.css'

export type GroupNodeData = {
  name: string
  color?: string
  memberNodeIds: string[]
}

export type GroupNodeType = Node<GroupNodeData, 'group'>

export function GroupNode({ data }: NodeProps<GroupNodeType>) {
  const color = data.color ?? '#666'

  return (
    <div
      className={styles.groupNode}
      style={{ '--node-color': color } as React.CSSProperties}
    >
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
      <Handle type="target" position={Position.Bottom} className={styles.handle} id="target" />
      <span className={styles.groupLabel}>{data.name}</span>
    </div>
  )
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run src/__tests__/SystemMap.test.tsx 2>&1 | tail -8
```
Expected: MemberNode + GroupNode tests pass.

- [ ] **Step 8: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Web/package.json \
        src/PluralHost.Web/package-lock.json \
        src/PluralHost.Web/src/components/SystemMap/
git commit -m "feat: MemberNode and GroupNode components for system map"
```

---

## Task 4: RelationshipEdge + NewRelationshipSheet

**Files:**
- Create: `src/PluralHost.Web/src/components/SystemMap/RelationshipEdge.tsx`
- Create: `src/PluralHost.Web/src/components/SystemMap/NewRelationshipSheet.tsx`
- Add tests to: `src/PluralHost.Web/src/__tests__/NewRelationshipSheet.test.tsx`

- [ ] **Step 1: Write failing tests for NewRelationshipSheet**

Create `src/PluralHost.Web/src/__tests__/NewRelationshipSheet.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../api/relationships', () => ({
  relationshipsApi: {
    create: vi.fn().mockResolvedValue({ id: 'new-id' }),
  },
}))

import { relationshipsApi } from '../api/relationships'
import { NewRelationshipSheet } from '../components/SystemMap/NewRelationshipSheet'

const mockCreate = vi.mocked(relationshipsApi.create)

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('NewRelationshipSheet', () => {
  const fromMember = { id: 'from-id', name: 'Jude' }
  const toMember = { id: 'to-id', name: 'Mira' }
  const onClose = vi.fn()

  beforeEach(() => {
    mockCreate.mockReset()
    mockCreate.mockResolvedValue({ id: 'new-id', fromMemberId: 'from-id', toMemberId: 'to-id', label: 'siblings', isDirected: false, createdAt: '', updatedAt: '' })
    onClose.mockReset()
  })

  it('renders from and to member names in header', () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    expect(screen.getByText(/Jude/)).toBeInTheDocument()
    expect(screen.getByText(/Mira/)).toBeInTheDocument()
  })

  it('save button disabled when label is empty', () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('save button enabled when label is filled', () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    fireEvent.change(screen.getByPlaceholderText(/siblings/i), { target: { value: 'rivals' } })
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('directed toggle changes isDirected in payload', async () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    fireEvent.change(screen.getByPlaceholderText(/siblings/i), { target: { value: 'parent of' } })
    fireEvent.click(screen.getByRole('button', { name: /directed/i }))
    fireEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ isDirected: true, label: 'parent of' })
      )
    })
  })

  it('cancel button calls onClose without mutation', () => {
    render(
      <Wrapper>
        <NewRelationshipSheet isOpen fromMember={fromMember} toMember={toMember} onClose={onClose} />
      </Wrapper>
    )
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run src/__tests__/NewRelationshipSheet.test.tsx 2>&1 | tail -8
```
Expected: FAIL — NewRelationshipSheet not found.

- [ ] **Step 3: Create RelationshipEdge**

Create `src/PluralHost.Web/src/components/SystemMap/RelationshipEdge.tsx`:

```tsx
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  MarkerType,
  type EdgeProps,
} from '@xyflow/react'

export type RelationshipEdgeData = {
  label: string
  isDirected: boolean
}

export function RelationshipEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  markerEnd,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY })
  const edgeData = data as RelationshipEdgeData

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: '#555', strokeWidth: 1.5 }}
        markerEnd={
          edgeData?.isDirected
            ? `url(#${MarkerType.ArrowClosed})`
            : undefined
        }
      />
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              fontSize: 9,
              color: '#888',
              pointerEvents: 'none',
            }}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
```

- [ ] **Step 4: Create NewRelationshipSheet**

Create `src/PluralHost.Web/src/components/SystemMap/NewRelationshipSheet.tsx`:

```tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BottomSheet } from '../BottomSheet'
import { relationshipsApi } from '../../api/relationships'

interface Props {
  isOpen: boolean
  fromMember: { id: string; name: string }
  toMember: { id: string; name: string }
  onClose: () => void
}

export function NewRelationshipSheet({ isOpen, fromMember, toMember, onClose }: Props) {
  const [label, setLabel] = useState('')
  const [isDirected, setIsDirected] = useState(false)
  const qc = useQueryClient()

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      relationshipsApi.create({
        fromMemberId: fromMember.id,
        toMemberId: toMember.id,
        label: label.trim(),
        isDirected,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['relationships'] })
      setLabel('')
      setIsDirected(false)
      onClose()
    },
  })

  function handleClose() {
    setLabel('')
    setIsDirected(false)
    onClose()
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={handleClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          New connection — {fromMember.name} → {toMember.name}
        </div>
        <input
          style={{
            width: '100%',
            background: '#111',
            border: '1px solid #333',
            borderRadius: 6,
            padding: '6px 10px',
            color: '#fff',
            fontSize: 12,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          placeholder="Label (e.g. siblings, parent of, rivals…)"
          maxLength={100}
          value={label}
          onChange={e => setLabel(e.target.value)}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => setIsDirected(false)}
            style={{
              flex: 1,
              padding: '5px',
              borderRadius: 6,
              border: `1px solid ${!isDirected ? 'var(--color-primary)' : '#333'}`,
              background: !isDirected ? 'transparent' : '#1a1a1a',
              color: !isDirected ? 'var(--color-primary)' : '#666',
              fontSize: 10,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            — Undirected
          </button>
          <button
            onClick={() => setIsDirected(true)}
            style={{
              flex: 1,
              padding: '5px',
              borderRadius: 6,
              border: `1px solid ${isDirected ? 'var(--color-primary)' : '#333'}`,
              background: isDirected ? 'transparent' : '#1a1a1a',
              color: isDirected ? 'var(--color-primary)' : '#666',
              fontSize: 10,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            → Directed
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => mutate()}
            disabled={!label.trim() || isPending}
            style={{
              flex: 1,
              padding: 6,
              borderRadius: 6,
              border: 'none',
              background: 'var(--color-primary)',
              color: '#000',
              fontSize: 11,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: label.trim() ? 'pointer' : 'not-allowed',
              opacity: label.trim() ? 1 : 0.4,
            }}
          >
            Save
          </button>
          <button
            onClick={handleClose}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #333',
              background: 'transparent',
              color: '#666',
              fontSize: 11,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run src/__tests__/NewRelationshipSheet.test.tsx 2>&1 | tail -8
```
Expected: `Passed: 5`

- [ ] **Step 6: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Web/src/components/SystemMap/RelationshipEdge.tsx \
        src/PluralHost.Web/src/components/SystemMap/NewRelationshipSheet.tsx \
        src/PluralHost.Web/src/__tests__/NewRelationshipSheet.test.tsx
git commit -m "feat: RelationshipEdge custom edge and NewRelationshipSheet"
```

---

## Task 5: SystemMap canvas component

**Files:**
- Create: `src/PluralHost.Web/src/components/SystemMap/SystemMap.tsx`
- Add tests to: `src/PluralHost.Web/src/__tests__/SystemMap.test.tsx`

- [ ] **Step 1: Add SystemMap integration tests**

Append to `src/PluralHost.Web/src/__tests__/SystemMap.test.tsx`:

```tsx
import { SystemMap } from '../components/SystemMap/SystemMap'
import type { Member, Group, MemberRelationship } from '../types'

const members: Member[] = [
  {
    id: 'mem-1', name: 'Jude', color: '#b6ff00', bucketId: 'pub', isArchived: false,
    isUntracked: false, isPinned: false, preventFrontNotification: false,
    receiveBoardNotifications: false, groupIds: ['grp-1'], parentIds: ['grp-1'],
    createdAt: '', updatedAt: '',
  },
  {
    id: 'mem-2', name: 'Mira', color: '#00d4ff', bucketId: 'pub', isArchived: false,
    isUntracked: false, isPinned: false, preventFrontNotification: false,
    receiveBoardNotifications: false, groupIds: [], parentIds: [],
    createdAt: '', updatedAt: '',
  },
]

const groups: Group[] = [
  { id: 'grp-1', name: 'Inner Circle', color: '#b6ff00', memberCount: 1 },
]

const relationships: MemberRelationship[] = [
  { id: 'rel-1', fromMemberId: 'mem-1', toMemberId: 'mem-2', label: 'siblings', isDirected: false, createdAt: '', updatedAt: '' },
]

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQuery: vi.fn().mockImplementation(({ queryKey }) => {
      if (queryKey[0] === 'members') return { data: members, isLoading: false }
      if (queryKey[0] === 'groups') return { data: groups, isLoading: false }
      if (queryKey[0] === 'relationships') return { data: relationships, isLoading: false }
      if (queryKey[0] === 'front-current') return { data: [], isLoading: false }
      return { data: [], isLoading: false }
    }),
    useMutation: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  }
})

describe('SystemMap', () => {
  it('renders a node for each member', () => {
    render(
      <NodeWrapper>
        <SystemMap />
      </NodeWrapper>
    )
    expect(screen.getByText('Jude')).toBeInTheDocument()
    expect(screen.getByText('Mira')).toBeInTheDocument()
  })

  it('Groups mode shows group node', () => {
    render(
      <NodeWrapper>
        <SystemMap initialMode="groups" />
      </NodeWrapper>
    )
    expect(screen.getByText('Inner Circle')).toBeInTheDocument()
  })

  it('Relationships mode does not show group node', () => {
    render(
      <NodeWrapper>
        <SystemMap initialMode="relationships" />
      </NodeWrapper>
    )
    expect(screen.queryByText('Inner Circle')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run src/__tests__/SystemMap.test.tsx 2>&1 | tail -8
```
Expected: FAIL — SystemMap not found.

- [ ] **Step 3: Create SystemMap.tsx**

Create `src/PluralHost.Web/src/components/SystemMap/SystemMap.tsx`:

```tsx
import { useRef, useMemo, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  type OnConnect,
} from '@xyflow/react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
} from 'd3-force'
import '@xyflow/react/dist/style.css'

import { membersApi } from '../../api/members'
import { groupsApi } from '../../api/groups'
import { relationshipsApi } from '../../api/relationships'
import { frontApi } from '../../api/front'
import { MemberNode, type MemberNodeData } from './MemberNode'
import { GroupNode, type GroupNodeData } from './GroupNode'
import { RelationshipEdge, type RelationshipEdgeData } from './RelationshipEdge'
import { NewRelationshipSheet } from './NewRelationshipSheet'
import styles from './SystemMap.module.css'
import type { Member, Group, MemberRelationship } from '../../types'

type MapMode = 'groups' | 'relationships' | 'both'

const nodeTypes = { member: MemberNode, group: GroupNode }
const edgeTypes = { relationship: RelationshipEdge }

interface D3Node { id: string; x?: number; y?: number }
interface D3Link { source: string; target: string }

function runLayout(d3Nodes: D3Node[], d3Links: D3Link[], width: number, height: number) {
  const nodesCopy = d3Nodes.map(n => ({ ...n }))
  const sim = forceSimulation<D3Node>(nodesCopy)
    .force('link', forceLink<D3Node, D3Link>(d3Links.map(l => ({ ...l }))).id(d => d.id).distance(120))
    .force('charge', forceManyBody().strength(-300))
    .force('center', forceCenter(width / 2, height / 2))
    .force('collide', forceCollide(40))
    .stop()
  sim.tick(300)
  return nodesCopy
}

interface Props {
  initialMode?: MapMode
}

export function SystemMap({ initialMode = 'groups' }: Props) {
  const [mode, setMode] = useState<MapMode>(initialMode)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectTo, setConnectTo] = useState<string | null>(null)

  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: membersApi.list })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const { data: relationships = [] } = useQuery({ queryKey: ['relationships'], queryFn: relationshipsApi.list })
  const { data: front = [] } = useQuery({ queryKey: ['front-current'], queryFn: frontApi.getCurrent })

  const frontingIds = useMemo(() => new Set((front as any[]).map((f: any) => f.member)), [front])

  const { rfNodes, rfEdges } = useMemo(() => {
    const WIDTH = 800
    const HEIGHT = 600

    const showGroups = mode === 'groups' || mode === 'both'
    const showRelationships = mode === 'relationships' || mode === 'both'

    // Build d3 nodes
    const d3Nodes: D3Node[] = members.map(m => ({ id: `member-${m.id}` }))
    if (showGroups) groups.forEach(g => d3Nodes.push({ id: `group-${g.id}` }))

    // Build d3 links
    const d3Links: D3Link[] = []
    if (showGroups) {
      members.forEach(m =>
        m.parentIds.forEach(gid => {
          if (groups.find(g => g.id === gid)) {
            d3Links.push({ source: `member-${m.id}`, target: `group-${gid}` })
          }
        })
      )
    }
    if (showRelationships) {
      relationships.forEach(r => {
        d3Links.push({ source: `member-${r.fromMemberId}`, target: `member-${r.toMemberId}` })
      })
    }

    // Run d3 simulation
    const positioned = runLayout(d3Nodes, d3Links, WIDTH, HEIGHT)
    const posMap = new Map(positioned.map(n => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]))

    // Determine isolated members (no connections in current mode)
    const connectedIds = new Set(d3Links.flatMap(l => [l.source, l.target]))

    // Build RF nodes
    const rfNodes: Node[] = members.map(m => {
      const pos = posMap.get(`member-${m.id}`) ?? { x: 0, y: 0 }
      const data: MemberNodeData = {
        id: m.id,
        name: m.displayName || m.name,
        color: m.color,
        isFronting: frontingIds.has(m.id),
        isIsolated: !connectedIds.has(`member-${m.id}`),
      }
      return { id: `member-${m.id}`, type: 'member', position: pos, data }
    })

    if (showGroups) {
      groups.forEach(g => {
        const pos = posMap.get(`group-${g.id}`) ?? { x: 0, y: 0 }
        const data: GroupNodeData = {
          name: g.name,
          color: g.color,
          memberNodeIds: members.filter(m => m.parentIds.includes(g.id)).map(m => `member-${m.id}`),
        }
        rfNodes.push({ id: `group-${g.id}`, type: 'group', position: pos, data })
      })
    }

    // Build RF edges
    const rfEdges: Edge[] = []
    if (showGroups) {
      members.forEach(m =>
        m.parentIds.forEach(gid => {
          const grp = groups.find(g => g.id === gid)
          if (!grp) return
          rfEdges.push({
            id: `membership-${m.id}-${gid}`,
            source: `member-${m.id}`,
            target: `group-${gid}`,
            style: { stroke: grp.color ?? '#666', strokeWidth: 1, strokeOpacity: 0.35 },
          })
        })
      )
    }
    if (showRelationships) {
      relationships.forEach(r => {
        const edgeData: RelationshipEdgeData = { label: r.label, isDirected: r.isDirected }
        rfEdges.push({
          id: `rel-${r.id}`,
          source: `member-${r.fromMemberId}`,
          target: `member-${r.toMemberId}`,
          type: 'relationship',
          data: edgeData,
        })
      })
    }

    return { rfNodes, rfEdges }
  }, [members, groups, relationships, frontingIds, mode])

  const [nodes, , onNodesChange] = useNodesState(rfNodes)
  const [edges, , onEdgesChange] = useEdgesState(rfEdges)

  const onConnect: OnConnect = useCallback((connection) => {
    if (connection.source && connection.target) {
      // Extract member IDs (strip 'member-' prefix)
      const fromId = connection.source.replace('member-', '')
      const toId = connection.target.replace('member-', '')
      if (fromId !== toId) {
        setConnectFrom(fromId)
        setConnectTo(toId)
        setSheetOpen(true)
      }
    }
  }, [])

  const fromMember = useMemo(
    () => members.find(m => m.id === connectFrom),
    [members, connectFrom]
  )
  const toMember = useMemo(
    () => members.find(m => m.id === connectTo),
    [members, connectTo]
  )

  return (
    <div className={styles.canvas}>
      <div className={styles.modeChips}>
        {(['groups', 'relationships', 'both'] as MapMode[]).map(m => (
          <button
            key={m}
            className={`${styles.chip} ${mode === m ? styles.active : ''}`}
            onClick={() => setMode(m)}
          >
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <div style={{ height: 'calc(100% - 36px)' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1a1a1a" variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>
      </div>
      {sheetOpen && fromMember && toMember && (
        <NewRelationshipSheet
          isOpen={sheetOpen}
          fromMember={{ id: fromMember.id, name: fromMember.displayName || fromMember.name }}
          toMember={{ id: toMember.id, name: toMember.displayName || toMember.name }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run all SystemMap tests**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run src/__tests__/SystemMap.test.tsx 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Web/src/components/SystemMap/SystemMap.tsx \
        src/PluralHost.Web/src/__tests__/SystemMap.test.tsx
git commit -m "feat: SystemMap canvas with d3-force layout and mode chips"
```

---

## Task 6: MembersPage List/Map toggle

**Files:**
- Modify: `src/PluralHost.Web/src/pages/MembersPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/MembersPage.module.css`

- [ ] **Step 1: Read current MembersPage to understand existing ViewMode and toggle**

Read `src/PluralHost.Web/src/pages/MembersPage.tsx` before editing.

- [ ] **Step 2: Add 'map' to ViewMode type and render SystemMap**

In `MembersPage.tsx`:

1. Find `type ViewMode = 'list' | 'folder'` and change to:
```tsx
type ViewMode = 'list' | 'folder' | 'map'
```

2. Add the import at the top of the file:
```tsx
import { SystemMap } from '../components/SystemMap/SystemMap'
```

3. Find where the view toggle buttons are rendered and add the Map button alongside the existing List/Folder buttons. The exact markup varies — add after the last existing toggle button:
```tsx
<button
  className={`${styles.viewBtn} ${viewMode === 'map' ? styles.viewBtnActive : ''}`}
  onClick={() => setViewMode('map')}
  title="Map view"
>
  ⬡ Map
</button>
```

4. Find the conditional rendering section where list or folder content renders. Add an `else if` for map mode before the existing render blocks, or add it after. The pattern should be:
```tsx
{viewMode === 'map' && (
  <SystemMap />
)}
{viewMode !== 'map' && (
  // ... existing list/folder content
)}
```

Or if the existing code uses a ternary `viewMode === 'list' ? ... : ...`, expand it:
```tsx
{viewMode === 'map'
  ? <SystemMap />
  : viewMode === 'list'
    ? <div className={styles.memberList}>...</div>
    : <div className={styles.memberFolder}>...</div>
}
```

- [ ] **Step 3: Add toggle button styles to MembersPage.module.css**

If `viewBtnActive` for the map variant needs a different accent color (spec says lime active), add to `MembersPage.module.css`:

```css
/* If not already present: */
.viewBtn {
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  background: #2a2a2a;
  color: #fff;
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
}

.viewBtnActive {
  background: var(--color-primary);
  color: #000;
  font-weight: 700;
}
```

If `.viewBtn` / `.viewBtnActive` already exist, no changes needed.

- [ ] **Step 4: Run frontend tests to check for regressions**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run 2>&1 | tail -5
```
Expected: all existing tests pass, no new failures.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Web/src/pages/MembersPage.tsx \
        src/PluralHost.Web/src/pages/MembersPage.module.css
git commit -m "feat: MembersPage Map view toggle — renders SystemMap"
```

---

## Task 7: DossierTab Connections section

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/DossierTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/DossierTab.module.css`

- [ ] **Step 1: Read DossierTab.tsx before editing**

Read `src/PluralHost.Web/src/components/tabs/DossierTab.tsx` to understand the existing pattern (Notes section uses useQuery + useMutation + BottomSheet).

- [ ] **Step 2: Add Connections section to DossierTab**

The existing DossierTab renders a Notes section. Add a Connections section below it. The additions needed:

**Imports to add at the top of DossierTab.tsx:**
```tsx
import { useState } from 'react'  // (already imported — skip if present)
import { relationshipsApi } from '../../api/relationships'
import { NewRelationshipSheet } from '../SystemMap/NewRelationshipSheet'
import type { MemberRelationship } from '../../types'
```

**Inside the component, add queries and mutations (alongside existing note queries):**
```tsx
const { data: allRelationships = [] } = useQuery({
  queryKey: ['relationships'],
  queryFn: relationshipsApi.list,
})

const connections = allRelationships.filter(
  (r: MemberRelationship) => r.fromMemberId === memberId || r.toMemberId === memberId
)

const [connectSheetOpen, setConnectSheetOpen] = useState(false)
const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

const deleteRelMutation = useMutation({
  mutationFn: (id: string) => relationshipsApi.remove(id),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['relationships'] }),
})
```

**Helper function (add inside the component, before the return):**
```tsx
function getOtherMember(r: MemberRelationship) {
  const otherId = r.fromMemberId === memberId ? r.toMemberId : r.fromMemberId
  return members.find((m: any) => m.id === otherId)
}

function directionLabel(r: MemberRelationship) {
  if (!r.isDirected) return '↔'
  return r.fromMemberId === memberId ? '→' : '←'
}
```

Note: `members` is available if DossierTab already fetches them. If not, add:
```tsx
const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: membersApi.list })
```

**Connections section JSX (add after the Notes card, before the closing fragment/div):**
```tsx
<div className={styles.card}>
  <div className={styles.cardHeader}>
    <span className={styles.cardTitle}>Connections</span>
    <button
      className={styles.addBtn}
      onClick={() => setConnectSheetOpen(true)}
    >
      <Plus size={16} /> Add
    </button>
  </div>
  {connections.length === 0 ? (
    <p className={styles.empty}>No connections yet</p>
  ) : (
    <ul className={styles.connectionList}>
      {connections.map((r: MemberRelationship) => {
        const other = getOtherMember(r)
        return (
          <li key={r.id} className={styles.connectionRow}>
            <span className={styles.connectionDir}>{directionLabel(r)}</span>
            <span className={styles.connectionName}>{other?.displayName || other?.name || 'Unknown'}</span>
            <span className={styles.connectionLabel}>{r.label}</span>
            {deleteConfirmId === r.id ? (
              <div className={styles.confirmRow}>
                <span style={{ fontSize: 10, color: '#888' }}>Delete?</span>
                <button
                  className={styles.dangerBtn}
                  onClick={() => { deleteRelMutation.mutate(r.id); setDeleteConfirmId(null) }}
                >Yes</button>
                <button className={styles.cancelBtn} onClick={() => setDeleteConfirmId(null)}>No</button>
              </div>
            ) : (
              <button
                className={styles.deleteBtn}
                onClick={() => setDeleteConfirmId(r.id)}
              >
                <Trash2 size={12} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )}
</div>

<NewRelationshipSheet
  isOpen={connectSheetOpen}
  fromMember={{
    id: memberId,
    name: members.find((m: any) => m.id === memberId)?.displayName
       || members.find((m: any) => m.id === memberId)?.name
       || 'You',
  }}
  toMember={{ id: '', name: '' }}
  onClose={() => setConnectSheetOpen(false)}
/>
```

Note: `NewRelationshipSheet` opened from DossierTab doesn't have a `toMember` pre-set — the user picks the direction by entering a label and the `fromMemberId` is pre-set to this member. The sheet as designed doesn't have a member picker; the `toMember` is set via drag-to-connect in SystemMap. For the DossierTab Add flow, we need a member picker. Simplify: open `connectSheetOpen` only after the user picks a member. Add a member select dropdown:

```tsx
// Instead of the above, use a two-step flow:
const [pickingTarget, setPickingTarget] = useState(false)
const [targetMemberId, setTargetMemberId] = useState<string | null>(null)

// Step 1 picker:
{pickingTarget && (
  <select
    style={{ background: '#111', border: '1px solid #333', color: '#fff', borderRadius: 6, padding: '4px 8px', fontSize: 11 }}
    value={targetMemberId ?? ''}
    onChange={e => {
      setTargetMemberId(e.target.value)
      setPickingTarget(false)
      setConnectSheetOpen(true)
    }}
  >
    <option value="" disabled>Pick a member…</option>
    {members.filter((m: any) => m.id !== memberId).map((m: any) => (
      <option key={m.id} value={m.id}>{m.displayName || m.name}</option>
    ))}
  </select>
)}
```

Then the Add button sets `setPickingTarget(true)`. The `NewRelationshipSheet` uses `targetMemberId` when set:

```tsx
{connectSheetOpen && targetMemberId && (
  <NewRelationshipSheet
    isOpen
    fromMember={{
      id: memberId,
      name: members.find((m: any) => m.id === memberId)?.displayName
         || members.find((m: any) => m.id === memberId)?.name || 'You',
    }}
    toMember={{
      id: targetMemberId,
      name: members.find((m: any) => m.id === targetMemberId)?.displayName
         || members.find((m: any) => m.id === targetMemberId)?.name || '',
    }}
    onClose={() => { setConnectSheetOpen(false); setTargetMemberId(null) }}
  />
)}
```

Add Lucide `Trash2` to the import list if not present: `import { ..., Trash2 } from 'lucide-react'`

- [ ] **Step 3: Add CSS for connection rows to DossierTab.module.css**

In `src/PluralHost.Web/src/components/tabs/DossierTab.module.css`, append:

```css
.connectionList {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.connectionRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid #1a1a1a;
  font-size: 12px;
}

.connectionRow:last-child {
  border-bottom: none;
}

.connectionDir {
  color: var(--color-primary);
  font-weight: 700;
  min-width: 16px;
  text-align: center;
}

.connectionName {
  color: #fff;
  flex: 1;
}

.connectionLabel {
  color: #666;
  font-size: 10px;
  font-style: italic;
}

.deleteBtn {
  background: transparent;
  border: none;
  color: #444;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.deleteBtn:hover {
  color: var(--color-danger);
}

.dangerBtn {
  background: var(--color-danger);
  border: none;
  color: #000;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
}

.cancelBtn {
  background: transparent;
  border: 1px solid #333;
  color: #666;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
}

.confirmRow {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
```

- [ ] **Step 4: Run all frontend tests**

```bash
cd /c/dev/simply-personal/src/PluralHost.Web
npx vitest run 2>&1 | tail -5
```
Expected: all tests pass. If DossierTab tests fail due to new query mocks needed, add `['relationships']` query stub returning `[]` to the test setup.

- [ ] **Step 5: Run all backend tests**

```bash
cd /c/dev/simply-personal
dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -3
```
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/simply-personal
git add src/PluralHost.Web/src/components/tabs/DossierTab.tsx \
        src/PluralHost.Web/src/components/tabs/DossierTab.module.css
git commit -m "feat: DossierTab Connections section with add/delete"
```

---

## Post-Implementation

After all tasks complete, run the full test suites:

```bash
# Backend
cd /c/dev/simply-personal
dotnet test tests/PluralHost.Tests -v minimal 2>&1 | tail -3

# Frontend
cd src/PluralHost.Web
npx vitest run 2>&1 | tail -5
```

Expected: ~307 backend tests passing (299 + 8 new), frontend tests all passing.

---

## Spec Checklist

- [x] `MemberRelationship` entity with `FromMemberId`, `ToMemberId`, `Label` (max 100), `IsDirected`, soft-delete, Ghost Mode filter
- [x] `GET /api/members/relationships` — returns all non-deleted
- [x] `POST /api/members/relationships` — validates both member IDs exist; 400 on deleted/missing or empty label; 201 on success
- [x] `PATCH /api/members/relationships/{id}` — updates label and/or isDirected; 404 if not found
- [x] `DELETE /api/members/relationships/{id}` — soft-delete, 204
- [x] All endpoints `[Authorize]`
- [x] `MemberRelationship` type in `types.ts`
- [x] `api/relationships.ts` — list/create/update/remove
- [x] `MemberNode` — 36px circle, member color border, fronting pulse, isolated dashed ring, click navigates
- [x] `GroupNode` — pill shape, group color border + 12% bg, click pulses
- [x] `RelationshipEdge` — directed arrow / undirected line, label at midpoint
- [x] `NewRelationshipSheet` — label input, directed/undirected toggle, save/cancel, save disabled when label empty
- [x] `SystemMap` — fetches members/groups/relationships/front, d3-force layout, mode chips (Groups/Relationships/Both), drag-to-connect via ReactFlow `onConnect`
- [x] `MembersPage` — 'map' ViewMode added, toggle renders SystemMap
- [x] `DossierTab` — Connections section with list (other member name + label + direction), Add (member picker → NewRelationshipSheet), delete with confirmation
- [x] Backend tests: all 8 specified test cases
- [x] Frontend tests: MemberNode/GroupNode render, mode switching, NewRelationshipSheet behavior
