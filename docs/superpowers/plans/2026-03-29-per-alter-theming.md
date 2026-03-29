# Per-Alter Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a per-alter background image (or color-derived tint fallback) to `MemberDetailPage`, with upload/remove controls grouped into a new Appearance section in EssenceTab.

**Architecture:** One new nullable `BackgroundImagePath` column on `Member`. `MemberDetailPage` injects CSS custom properties (`--member-color`, `--member-bg-image`, `--member-color-tintN`) scoped to its root element; the hero reads them. EssenceTab's existing avatar section is restructured into an Appearance row: avatar circle + background image slot + color swatch. Existing `POST /api/media/upload` handles both uploads unchanged.

**Tech Stack:** .NET 8 / EF Core 8 / xUnit + Moq, React 19 / TypeScript / TanStack Query v5 / CSS Modules / Vitest + Testing Library

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/PluralHost.Api/Domain/Member.cs` | Add `BackgroundImagePath string?` property |
| Modify | `src/PluralHost.Api/Dto/NativeDtos.cs` | Add `BackgroundImagePath` to `MemberResponse` + `MemberUpdateRequest`; add `ClearBackgroundImage bool` to `MemberUpdateRequest` |
| Modify | `src/PluralHost.Api/Controllers/MembersController.cs` | Handle `BackgroundImagePath` and `ClearBackgroundImage` in PATCH handler |
| Create | `src/PluralHost.Api/Data/Migrations/<timestamp>_AddMemberBackgroundImagePath.cs` | EF migration (generated) |
| Modify | `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs` | PATCH tests for backgroundImagePath set + clear |
| Modify | `src/PluralHost.Web/src/types.ts` | Add `backgroundImagePath` to `Member`; add `backgroundImagePath`/`clearBackgroundImage` to `MemberUpdatePayload` |
| Modify | `src/PluralHost.Web/src/pages/MemberDetailPage.tsx` | CSS vars injection, hero div replacing `.header`, `.content` wrapper |
| Modify | `src/PluralHost.Web/src/pages/MemberDetailPage.module.css` | `.hero`, `.heroOverlay`, `.heroContent`, `.heroInfo`, `.content` styles; remove `.header` |
| Modify | `src/PluralHost.Web/src/components/tabs/EssenceTab.tsx` | Appearance section: bg image upload/remove state + handlers; restructure `avatarSection` into `appearanceSection` row |
| Modify | `src/PluralHost.Web/src/components/tabs/EssenceTab.module.css` | `.appearanceSection`, `.appearanceLabel`, `.appearanceRow`, `.bgImageSlot`, `.bgThumb` styles |
| Modify | `src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx` | Hero CSS var and rendering tests |
| Modify | `src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx` | Appearance section tests |

---

## Task 1: Backend — Entity + DTO + Controller

**Files:**
- Modify: `src/PluralHost.Api/Domain/Member.cs`
- Modify: `src/PluralHost.Api/Dto/NativeDtos.cs`
- Modify: `src/PluralHost.Api/Controllers/MembersController.cs`

- [ ] **Step 1: Add `BackgroundImagePath` to `Member` entity**

In `Member.cs`, add the property directly after `AvatarPath`:

```csharp
public string? AvatarPath { get; set; }
public string? BackgroundImagePath { get; set; }
```

- [ ] **Step 2: Add `BackgroundImagePath` to `MemberResponse` DTO**

In `NativeDtos.cs`, add `string? BackgroundImagePath` to `MemberResponse` after `AvatarPath`:

```csharp
public record MemberResponse(
    Guid Id, string Name, string? DisplayName, string? Pronouns,
    string? Color, string? Role, string? Description, string? AvatarPath,
    string? BackgroundImagePath,
    Guid BucketId, bool AllowsBoardPosting,
    bool IsPinned, bool IsArchived, bool IsUntracked,
    bool PreventFrontNotification, bool ReceiveBoardNotifications,
    List<string> ExtraImages, string? SpMemberId,
    MemberStatus Status, List<Guid> ParentIds, List<Guid> GroupIds,
    DateTime CreatedAt, DateTime UpdatedAt, string? PkId, string? Birthday);
```

- [ ] **Step 3: Add `BackgroundImagePath` and `ClearBackgroundImage` to `MemberUpdateRequest`**

In `NativeDtos.cs`, update `MemberUpdateRequest`:

```csharp
public record MemberUpdateRequest(
    string? Name = null, string? DisplayName = null, string? Pronouns = null,
    string? Color = null, string? Role = null, string? Description = null,
    Guid? BucketId = null, bool? AllowsBoardPosting = null,
    bool? IsPinned = null, bool? IsArchived = null,
    bool? IsUntracked = null, bool? PreventFrontNotification = null,
    bool? ReceiveBoardNotifications = null, List<string>? ExtraImages = null,
    string? SpMemberId = null, MemberStatus? Status = null,
    List<Guid>? ParentIds = null, string? AvatarPath = null,
    string? BackgroundImagePath = null, bool ClearBackgroundImage = false);
```

`ClearBackgroundImage = true` is the explicit "remove the background image" signal. `BackgroundImagePath = null` means "not provided" (unchanged) — this distinguishes explicit clear from absent.

- [ ] **Step 4: Update MembersController PATCH handler**

In `MembersController.cs`, find the PATCH handler (the block that handles `AvatarPath`). Add the following immediately after the `AvatarPath` assignment — mirror the existing `AvatarPath` pattern exactly:

```csharp
if (req.AvatarPath is not null) member.AvatarPath = req.AvatarPath;
if (req.BackgroundImagePath is not null) member.BackgroundImagePath = req.BackgroundImagePath;
if (req.ClearBackgroundImage) member.BackgroundImagePath = null;
```

- [ ] **Step 5: Update `MemberResponse` projection**

In the same controller, find where `MemberResponse` is constructed (the `.Select()` projection or the mapping call). Add `BackgroundImagePath: member.BackgroundImagePath` in the same position as it appears in the DTO record. Follow the existing `AvatarPath: member.AvatarPath` line as the exact template.

- [ ] **Step 6: Run build to confirm no compile errors**

```bash
dotnet build src/PluralHost.Api
```

Expected: Build succeeded, 0 errors.

- [ ] **Step 7: Generate and apply migration**

```bash
dotnet ef migrations add AddMemberBackgroundImagePath --project src/PluralHost.Api --output-dir Data/Migrations
dotnet ef database update --project src/PluralHost.Api
```

Expected: Migration file created, database updated.

- [ ] **Step 8: Commit**

```bash
git add src/PluralHost.Api/Domain/Member.cs \
        src/PluralHost.Api/Dto/NativeDtos.cs \
        src/PluralHost.Api/Controllers/MembersController.cs \
        src/PluralHost.Api/Data/Migrations/
git commit -m "feat: add BackgroundImagePath to Member entity, DTO, and PATCH handler"
```

---

## Task 2: Backend Tests

**Files:**
- Modify: `tests/PluralHost.Tests/Controllers/MembersControllerTests.cs`

- [ ] **Step 1: Write failing tests for PATCH backgroundImagePath**

Add the following tests to `MembersControllerTests.cs`. Find the existing `PatchMember_*` test group and add after:

```csharp
[Fact]
public async Task PatchMember_SetsBackgroundImagePath()
{
    // Arrange
    var db = CreateInMemoryDb();
    var member = new Member { Id = Guid.NewGuid(), Name = "Test", BucketId = PrivacyBucket.PublicId };
    db.Members.Add(member);
    await db.SaveChangesAsync();
    var controller = CreateController(db);

    // Act
    var result = await controller.UpdateAsync(member.Id,
        new MemberUpdateRequest(BackgroundImagePath: "uploads/bg123.jpg"));

    // Assert
    var updated = await db.Members.FindAsync(member.Id);
    Assert.Equal("uploads/bg123.jpg", updated!.BackgroundImagePath);
}

[Fact]
public async Task PatchMember_ClearBackgroundImage_SetsNull()
{
    // Arrange
    var db = CreateInMemoryDb();
    var member = new Member
    {
        Id = Guid.NewGuid(), Name = "Test", BucketId = PrivacyBucket.PublicId,
        BackgroundImagePath = "uploads/existing.jpg"
    };
    db.Members.Add(member);
    await db.SaveChangesAsync();
    var controller = CreateController(db);

    // Act
    var result = await controller.UpdateAsync(member.Id,
        new MemberUpdateRequest(ClearBackgroundImage: true));

    // Assert
    var updated = await db.Members.FindAsync(member.Id);
    Assert.Null(updated!.BackgroundImagePath);
}

[Fact]
public async Task PatchMember_NullBackgroundImagePath_DoesNotClear()
{
    // Arrange
    var db = CreateInMemoryDb();
    var member = new Member
    {
        Id = Guid.NewGuid(), Name = "Test", BucketId = PrivacyBucket.PublicId,
        BackgroundImagePath = "uploads/existing.jpg"
    };
    db.Members.Add(member);
    await db.SaveChangesAsync();
    var controller = CreateController(db);

    // Act — send a PATCH with no BackgroundImagePath (default null) and ClearBackgroundImage false
    var result = await controller.UpdateAsync(member.Id,
        new MemberUpdateRequest(Name: "Updated"));

    // Assert — bg path unchanged
    var updated = await db.Members.FindAsync(member.Id);
    Assert.Equal("uploads/existing.jpg", updated!.BackgroundImagePath);
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
dotnet test tests/PluralHost.Tests --filter "PatchMember_SetsBackgroundImagePath|PatchMember_ClearBackgroundImage|PatchMember_NullBackgroundImagePath" -v minimal
```

Expected: FAIL — `BackgroundImagePath` not handled yet (or compilation error if method not found).

After Task 1 is complete, run again:

```bash
dotnet test tests/PluralHost.Tests --filter "PatchMember_SetsBackgroundImagePath|PatchMember_ClearBackgroundImage|PatchMember_NullBackgroundImagePath" -v minimal
```

Expected: All 3 PASS.

- [ ] **Step 3: Run full test suite**

```bash
dotnet test tests/PluralHost.Tests -v minimal
```

Expected: All tests pass (no regressions).

- [ ] **Step 4: Commit**

```bash
git add tests/PluralHost.Tests/Controllers/MembersControllerTests.cs
git commit -m "test: BackgroundImagePath PATCH — set, clear, no-op"
```

---

## Task 3: Frontend Types

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts`

- [ ] **Step 1: Add `backgroundImagePath` to `Member` interface**

In `types.ts`, find the `Member` interface and add after `avatarPath`:

```ts
export interface Member {
  id: string
  name: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string
  backgroundImagePath?: string | null   // ← add this
  description?: string
  // ... rest unchanged
}
```

- [ ] **Step 2: Add `backgroundImagePath` and `clearBackgroundImage` to `MemberUpdatePayload`**

Find `MemberUpdatePayload` in `types.ts` and add after `avatarPath`:

```ts
avatarPath?: string
backgroundImagePath?: string    // set bg image (path returned by upload)
clearBackgroundImage?: boolean  // explicitly remove bg image
```

- [ ] **Step 3: Verify build**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/types.ts
git commit -m "feat: add backgroundImagePath to Member type and MemberUpdatePayload"
```

---

## Task 4: MemberDetailPage — Hero

**Files:**
- Modify: `src/PluralHost.Web/src/pages/MemberDetailPage.tsx`
- Modify: `src/PluralHost.Web/src/pages/MemberDetailPage.module.css`
- Modify: `src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx`

- [ ] **Step 1: Write failing tests**

Open `src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx`. Add (or replace any existing header/hero tests):

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import MemberDetailPage from '../pages/MemberDetailPage'
import * as membersApi from '../api/members'
import * as groupsApi from '../api/groups'
import * as frontApi from '../api/front'

function buildMember(overrides = {}) {
  return {
    id: 'member-1',
    name: 'Nyx',
    color: '#b400ff',
    avatarPath: undefined,
    backgroundImagePath: undefined,
    pronouns: 'she/her',
    bucketId: '00000000-0000-0000-0000-000000000001',
    isArchived: false,
    isUntracked: false,
    isPinned: false,
    preventFrontNotification: false,
    receiveBoardNotifications: false,
    groupIds: [],
    parentIds: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderPage(member: ReturnType<typeof buildMember>) {
  vi.spyOn(membersApi.membersApi, 'get').mockResolvedValue(member as any)
  vi.spyOn(groupsApi.groupsApi, 'list').mockResolvedValue([])
  vi.spyOn(frontApi.frontApi, 'getCurrent').mockResolvedValue([])
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/members/member-1']}>
        <Routes>
          <Route path="/members/:id" element={<MemberDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('MemberDetailPage hero', () => {
  it('sets --member-color CSS var from member.color', async () => {
    const { container } = renderPage(buildMember({ color: '#b400ff' }))
    await screen.findByText('Nyx')
    const page = container.firstElementChild as HTMLElement
    expect(page.style.getPropertyValue('--member-color')).toBe('#b400ff')
  })

  it('sets --member-bg-image to none when backgroundImagePath is null', async () => {
    const { container } = renderPage(buildMember({ backgroundImagePath: null }))
    await screen.findByText('Nyx')
    const page = container.firstElementChild as HTMLElement
    expect(page.style.getPropertyValue('--member-bg-image')).toBe('none')
  })

  it('sets --member-bg-image to url when backgroundImagePath is set', async () => {
    const { container } = renderPage(buildMember({ backgroundImagePath: 'uploads/bg.jpg' }))
    await screen.findByText('Nyx')
    const page = container.firstElementChild as HTMLElement
    expect(page.style.getPropertyValue('--member-bg-image')).toBe('url("/api/media/uploads/bg.jpg")')
  })

  it('renders member name and pronouns in the hero', async () => {
    renderPage(buildMember())
    expect(await screen.findByText('Nyx')).toBeInTheDocument()
    expect(screen.getByText('she/her')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/MemberDetailPage.test.tsx 2>&1 | tail -30
```

Expected: Tests referencing CSS vars fail or render tests fail if hero not yet structured.

- [ ] **Step 3: Add `hexToRgba` helper and CSS vars to `MemberDetailPage.tsx`**

Add the helper at the top of the file (outside the component):

```ts
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
```

Inside the component, after loading `member`, compute the theme values:

```ts
const memberColor = member.color ?? '#888888'
const memberBgImage = member.backgroundImagePath
  ? `url("/api/media/${member.backgroundImagePath}")`
  : 'none'
const hasImage = !!member.backgroundImagePath
```

- [ ] **Step 4: Replace the `.header` div with a hero in `MemberDetailPage.tsx`**

Replace the existing `<div className={styles.header}>...</div>` block with:

```tsx
<div
  className={styles.hero}
  style={hasImage
    ? { backgroundImage: memberBgImage }
    : { background: `linear-gradient(135deg, ${hexToRgba(memberColor, 0.27)} 0%, ${hexToRgba(memberColor, 0.13)} 50%, transparent 100%)` }
  }
>
  <div className={styles.heroOverlay} />
  <div className={styles.heroContent}>
    <Avatar
      name={member.name}
      color={memberColor}
      avatarPath={member.avatarPath}
      size="lg"
    />
    <div className={styles.heroInfo}>
      <h1 className={styles.name}>
        <span style={{ color: member.color ?? 'var(--color-primary)' }}>{member.name[0]}</span>
        {member.name.slice(1)}
      </h1>
      {member.pronouns && <p className={styles.pronouns}>{member.pronouns}</p>}
      {isFronting && <span className={styles.frontingBadge}>Fronting now</span>}
    </div>
  </div>
</div>
```

Wrap the tab content in a `<div className={styles.content}>` wrapper:

```tsx
<div className={styles.content}>
  {activeTab === 'essence'  && <EssenceTab  member={member} groups={groups} />}
  {activeTab === 'specs'    && <SpecsTab    member={member} />}
  {activeTab === 'dossier'  && <DossierTab  member={member} />}
  {activeTab === 'comms'    && <CommsTab    member={member} />}
  {activeTab === 'logs'     && <LogsTab     member={member} />}
  {activeTab === 'access'   && <AccessTab   member={member} />}
</div>
```

Inject CSS vars on the root `<div className={styles.page}>`:

```tsx
<div
  className={styles.page}
  style={{
    '--member-color': memberColor,
    '--member-bg-image': memberBgImage,
    '--member-color-tint5':  hexToRgba(memberColor, 0.05),
    '--member-color-tint27': hexToRgba(memberColor, 0.27),
    '--member-color-tint13': hexToRgba(memberColor, 0.13),
  } as React.CSSProperties}
>
```

- [ ] **Step 5: Update `MemberDetailPage.module.css`**

Remove `.header` and `.headerInfo` rules. Add hero styles and update `.page` and add `.content`:

```css
.page {
  max-width: 600px;
  margin: 0 auto;
  /* no padding here — hero bleeds edge to edge */
}

.hero {
  height: 120px;
  position: relative;
  overflow: hidden;
  background-size: cover;
  background-position: center;
}

.heroOverlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.15) 60%, transparent 100%);
}

.heroContent {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.heroInfo {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: 2px;
}

.content {
  padding: 0 16px 16px;
  background: linear-gradient(180deg, var(--member-color-tint5) 0%, transparent 40%);
}
```

Keep all other existing rules (`.name`, `.pronouns`, `.frontingBadge`, `.loading`, field styles, etc.) unchanged.

- [ ] **Step 6: Run hero tests**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/MemberDetailPage.test.tsx 2>&1 | tail -30
```

Expected: All hero tests pass.

- [ ] **Step 7: Run full frontend test suite**

```bash
cd src/PluralHost.Web && npx vitest run 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/PluralHost.Web/src/pages/MemberDetailPage.tsx \
        src/PluralHost.Web/src/pages/MemberDetailPage.module.css \
        src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx
git commit -m "feat: MemberDetailPage hero — CSS vars, full-bleed bg image, color tint fallback"
```

---

## Task 5: EssenceTab — Appearance Section

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/EssenceTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/EssenceTab.module.css`
- Modify: `src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx`

- [ ] **Step 1: Write failing tests**

In `src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx`, add:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'
import EssenceTab from '../components/tabs/EssenceTab'
import * as mediaApi from '../api/media'
import * as membersApi from '../api/members'

function baseMember(overrides = {}): any {
  return {
    id: 'member-1',
    name: 'Nyx',
    color: '#b400ff',
    avatarPath: undefined,
    backgroundImagePath: undefined,
    pronouns: 'she/her',
    bucketId: '00000000-0000-0000-0000-000000000001',
    isArchived: false, isUntracked: false, isPinned: false,
    preventFrontNotification: false, receiveBoardNotifications: false,
    groupIds: [], parentIds: [],
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function renderTab(member: any) {
  vi.spyOn(membersApi.membersApi, 'update').mockResolvedValue(member)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <EssenceTab member={member} groups={[]} />
    </QueryClientProvider>
  )
}

describe('EssenceTab Appearance section', () => {
  it('renders Appearance section label', () => {
    renderTab(baseMember())
    expect(screen.getByText(/appearance/i)).toBeInTheDocument()
  })

  it('renders avatar pencil button inside Appearance section', () => {
    renderTab(baseMember())
    expect(screen.getByLabelText('Change avatar')).toBeInTheDocument()
  })

  it('shows add-background-image button when backgroundImagePath is null', () => {
    renderTab(baseMember({ backgroundImagePath: null }))
    expect(screen.getByLabelText('Add background image')).toBeInTheDocument()
  })

  it('shows remove button when backgroundImagePath is set', () => {
    renderTab(baseMember({ backgroundImagePath: 'uploads/bg.jpg' }))
    expect(screen.getByLabelText('Remove background image')).toBeInTheDocument()
  })

  it('upload calls mediaApi.upload then membersApi.update with backgroundImagePath', async () => {
    const uploadSpy = vi.spyOn(mediaApi.mediaApi, 'upload').mockResolvedValue({ id: 'uploads/new.jpg' } as any)
    const updateSpy = vi.spyOn(membersApi.membersApi, 'update').mockResolvedValue(baseMember())
    renderTab(baseMember({ backgroundImagePath: null }))

    const addBtn = screen.getByLabelText('Add background image')
    const input = addBtn.parentElement!.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'bg.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    fireEvent.change(input)

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith(file))
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('member-1', { backgroundImagePath: 'uploads/new.jpg' }))
  })

  it('remove calls membersApi.update with clearBackgroundImage: true', async () => {
    const updateSpy = vi.spyOn(membersApi.membersApi, 'update').mockResolvedValue(baseMember())
    renderTab(baseMember({ backgroundImagePath: 'uploads/bg.jpg' }))

    fireEvent.click(screen.getByLabelText('Remove background image'))
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith('member-1', { clearBackgroundImage: true }))
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/EssenceTab.test.tsx 2>&1 | tail -30
```

Expected: Appearance section tests fail (section doesn't exist yet).

- [ ] **Step 3: Add bg image state and handlers to `EssenceTab.tsx`**

After the existing avatar `fileInputRef` / `uploading` / `uploadError` state declarations, add:

```tsx
const bgInputRef = useRef<HTMLInputElement>(null)
const [bgUploading, setBgUploading] = useState(false)
const [bgUploadError, setBgUploadError] = useState<string | null>(null)

const handleBgFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  const previous = member.backgroundImagePath ?? null
  setBgUploading(true)
  setBgUploadError(null)
  try {
    const { id } = await mediaApi.upload(file)
    await membersApi.update(member.id, { backgroundImagePath: id })
    qc.invalidateQueries({ queryKey: ['member', member.id] })
  } catch {
    if (previous) {
      await membersApi.update(member.id, { backgroundImagePath: previous }).catch(() => {})
    }
    setBgUploadError('Upload failed. Please try again.')
  } finally {
    setBgUploading(false)
    if (bgInputRef.current) bgInputRef.current.value = ''
  }
}

const handleRemoveBg = async () => {
  setBgUploadError(null)
  await membersApi.update(member.id, { clearBackgroundImage: true })
  qc.invalidateQueries({ queryKey: ['member', member.id] })
}
```

- [ ] **Step 4: Restructure avatar section into Appearance section in `EssenceTab.tsx`**

Replace the existing `<div className={styles.avatarSection}>` block with:

```tsx
<div className={styles.appearanceSection}>
  <span className={styles.appearanceLabel}>Appearance</span>
  <div className={styles.appearanceRow}>

    {/* Avatar */}
    <div className={styles.avatarWrap}>
      <div
        className={styles.avatarCircle}
        style={{ background: member.color ?? '#555' }}
      >
        {member.avatarPath
          ? <img src={`/api/media/${member.avatarPath}`} alt={member.name} className={styles.avatarImg} />
          : <span className={styles.avatarInitial}>{member.name[0]?.toUpperCase()}</span>
        }
      </div>
      {uploading && <div className={styles.avatarSpinner} aria-label="Uploading…" />}
      <button
        className={styles.avatarPencil}
        onClick={() => fileInputRef.current?.click()}
        aria-label="Change avatar"
        disabled={uploading}
        type="button"
      >
        <Pencil size={14} strokeWidth={2.5} />
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className={styles.avatarInput}
        onChange={handleFileChange}
      />
    </div>

    {/* Background image slot */}
    <div className={styles.bgImageSlot}>
      {member.backgroundImagePath ? (
        <>
          <img
            src={`/api/media/${member.backgroundImagePath}`}
            alt="Background"
            className={styles.bgThumb}
          />
          <button
            className={styles.bgRemoveBtn}
            onClick={handleRemoveBg}
            aria-label="Remove background image"
            type="button"
            disabled={bgUploading}
          >
            ✕
          </button>
        </>
      ) : (
        <>
          <button
            className={styles.bgAddBtn}
            onClick={() => bgInputRef.current?.click()}
            aria-label="Add background image"
            type="button"
            disabled={bgUploading}
          >
            {bgUploading ? '…' : '+ bg'}
          </button>
          <input
            ref={bgInputRef}
            type="file"
            accept="image/*"
            className={styles.avatarInput}
            onChange={handleBgFileChange}
          />
        </>
      )}
    </div>

    {/* Color swatch — move existing color control here if it's below in the tab */}
    {/* Find the existing color <input type="color"> block and move it into this row */}

  </div>

  {uploadError    && <p className={styles.uploadError} role="alert">{uploadError}</p>}
  {bgUploadError  && <p className={styles.uploadError} role="alert">{bgUploadError}</p>}
</div>
```

**Note on color swatch:** Find the existing `<input type="color">` or color row in EssenceTab's JSX (it renders below the avatar section currently). Cut it from its current location and paste it as the third element inside `<div className={styles.appearanceRow}>`, replacing the comment above.

- [ ] **Step 5: Add Appearance section styles to `EssenceTab.module.css`**

Add these styles (keep all existing styles):

```css
.appearanceSection {
  padding: 16px 0 8px;
  border-bottom: 1px solid var(--color-surface);
}

.appearanceLabel {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 10px;
}

.appearanceRow {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bgImageSlot {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.bgThumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.bgAddBtn {
  width: 100%;
  height: 100%;
  border: 1px dashed var(--color-border);
  border-radius: 8px;
  background: none;
  color: var(--color-muted);
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bgRemoveBtn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0,0,0,0.6);
  border: none;
  color: #fff;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
```

- [ ] **Step 6: Run Appearance section tests**

```bash
cd src/PluralHost.Web && npx vitest run src/__tests__/EssenceTab.test.tsx 2>&1 | tail -30
```

Expected: All Appearance section tests pass.

- [ ] **Step 7: Run full frontend test suite**

```bash
cd src/PluralHost.Web && npx vitest run 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 8: TypeScript build check**

```bash
cd src/PluralHost.Web && npm run build 2>&1 | tail -20
```

Expected: No TypeScript errors.

- [ ] **Step 9: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/EssenceTab.tsx \
        src/PluralHost.Web/src/components/tabs/EssenceTab.module.css \
        src/PluralHost.Web/src/__tests__/EssenceTab.test.tsx
git commit -m "feat: EssenceTab Appearance section — bg image upload/remove, avatar + color grouped"
```

---

## Self-Review

**Spec coverage:**
- ✅ `BackgroundImagePath` on `Member` entity + DTO + migration — Task 1
- ✅ CSS custom properties on `MemberDetailPage` root — Task 4 step 4
- ✅ Hero: full-bleed image with gradient overlay — Task 4 step 4
- ✅ Hero: color tint fallback when no image — Task 4 step 4
- ✅ Page body tint via `--member-color-tint5` — Task 4 step 5 (`.content`)
- ✅ Tab bar accent via `--member-color` — already reads from `member.color` via `activeColor` prop on `TabBar`; the CSS var is set on the root so any direct `var(--member-color)` usage also works
- ✅ Appearance section: avatar + bg image slot + color grouped — Task 5
- ✅ BG image upload via existing `POST /api/media/upload` — Task 5 step 3
- ✅ BG image remove via `clearBackgroundImage: true` PATCH — Task 5 steps 3–4
- ✅ Error revert on upload failure — Task 5 step 3
- ✅ Backend PATCH tests (set, clear, no-op) — Task 2
- ✅ Frontend MemberDetailPage CSS var tests — Task 4 step 1
- ✅ Frontend EssenceTab Appearance tests — Task 5 step 1

**Placeholder scan:** None found.

**Type consistency:**
- `backgroundImagePath` used consistently across `Member`, `MemberUpdatePayload`, DTO, entity
- `clearBackgroundImage` used consistently in controller, DTO, `MemberUpdatePayload`, and `handleRemoveBg`
- `hexToRgba` defined in Task 4 step 3, used in Task 4 step 4 — same file, no cross-task dependency issue
