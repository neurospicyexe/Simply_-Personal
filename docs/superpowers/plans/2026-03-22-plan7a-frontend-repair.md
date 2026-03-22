# Frontend Repair — Design + API Wiring

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 broken API wiring issues (SpecsTab fields contract, board delete PIN, PIN UX) and 4 visual design bugs (AccessTab checkboxes, avatar pencil size, + buttons, color tokens).

**Architecture:** Purely frontend changes + one small backend controller change. No new endpoints or migrations. All changes are scoped to `fields.ts`, `types.ts`, `SpecsTab.tsx`, `BoardController.cs`, CSS modules, and `SettingsPage.tsx`.

**Tech Stack:** React 18 + TypeScript + CSS Modules (frontend); ASP.NET Core 8 (backend — one controller fix only)

---

## Files Overview

| File | Action | Reason |
|------|--------|--------|
| `src/PluralHost.Web/src/types.ts` | Modify | Fix `FieldDef` (name→label) and `MemberFieldEntry` (add label, fieldType, sortOrder, privacyTier) |
| `src/PluralHost.Web/src/api/fields.ts` | Modify | Fix `createDef` payload (`{name}` → `{label, fieldType}`) and local interfaces |
| `src/PluralHost.Web/src/components/tabs/SpecsTab.tsx` | Modify | Replace all `def.name` with `def.label` |
| `src/PluralHost.Api/Controllers/BoardController.cs` | Modify | Remove PIN requirement from owner board message deletion |
| `src/PluralHost.Web/src/components/tabs/AccessTab.module.css` | Modify | Add `.checkboxField` row layout |
| `src/PluralHost.Web/src/components/tabs/AccessTab.tsx` | Modify | Apply `.checkboxField` to checkbox rows, add `htmlFor` labels |
| `src/PluralHost.Web/src/components/tabs/EssenceTab.tsx` | Modify | Import Lucide `Pencil`, reduce pencil button size |
| `src/PluralHost.Web/src/components/tabs/EssenceTab.module.css` | Modify | `.avatarPencil` 28px → 20px |
| `src/PluralHost.Web/src/components/tabs/SpecsTab.tsx` | Modify | `+` text → Lucide `Plus` icon |
| `src/PluralHost.Web/src/components/tabs/CommsTab.tsx` | Modify | `+` text → Lucide `Plus` icon |
| `src/PluralHost.Web/src/components/tabs/DossierTab.tsx` | Modify | `+` text → Lucide `Plus` icon |
| `src/PluralHost.Web/src/styles/tokens.css` | Modify | Add `--color-danger: #f87171` token |
| `src/PluralHost.Web/src/pages/SettingsPage.tsx` | Modify | Security section open by default (`defaultOpen` prop) |

---

## Task 1: Fix `FieldDef` and `MemberFieldEntry` in `types.ts`

**Root cause:** Frontend types diverged from backend DTOs. Backend returns `label` not `name`; `MemberFieldEntry` from backend includes `label`, `fieldType`, `sortOrder`, `privacyTier` — all missing from the frontend type.

**Files:**
- Modify: `src/PluralHost.Web/src/types.ts`

- [ ] **Step 1: Update `FieldDef`**

In `types.ts`, find and replace the `FieldDef` interface:

```ts
export interface FieldDef {
  id: string
  label: string
  fieldType: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}
```

- [ ] **Step 2: Update `MemberFieldEntry`**

Find and replace the `MemberFieldEntry` interface:

```ts
export interface MemberFieldEntry {
  fieldId: string
  label: string
  fieldType: string
  sortOrder: number
  value: string | null
  privacyTier: string
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd src/PluralHost.Web && npx tsc --noEmit 2>&1 | head -40
```

Expected: Errors only in `SpecsTab.tsx` and `fields.ts` (those are fixed in Tasks 2 and 3). No other files should break.

- [ ] **Step 4: Update SpecsTab test mock data**

The test file at `src/PluralHost.Web/src/__tests__/SpecsTab.test.tsx` (or similar path) mocks `fieldsApi.listDefs`. Any mock `FieldDef` objects that use `name:` must be updated to `label:`. Read the file first, then replace all `name:` keys in mock FieldDef data with `label:`.

- [ ] **Step 5: TypeScript check includes test file**

```bash
cd src/PluralHost.Web && npx tsc --noEmit 2>&1 | head -40
```

Expected: Errors only in `SpecsTab.tsx` and `fields.ts` — those are fixed in Tasks 2 and 3.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/types.ts src/PluralHost.Web/src/__tests__/SpecsTab.test.tsx
git commit -m "fix: align FieldDef and MemberFieldEntry types with backend DTOs; update test mocks"
```

---

## Task 2: Fix `fields.ts` API module

**Root cause:** `createDef` sends `{ name }` — backend `CustomFieldCreateRequest` requires `{ label, fieldType }`. Local interfaces also used wrong field names.

**Files:**
- Modify: `src/PluralHost.Web/src/api/fields.ts`

**Backend reference:**
- `POST /api/fields` expects: `{ "label": "Role", "fieldType": 0 }` (0 = Text)
- `GET /api/fields` returns: `{ id, label, fieldType, sortOrder, createdAt, updatedAt, deletedAt }`
- `GET /api/members/:id/fields` returns: `{ fieldId, label, fieldType, sortOrder, value, privacyTier }`

- [ ] **Step 1: Check FieldType enum on backend**

Run this to confirm `Text = 0`:
```bash
grep -r "FieldType" src/PluralHost.Api/Domain/ --include="*.cs" | head -10
```

Expected to see something like `Text = 0`. If the enum has different values, adjust the `fieldType: 0` default below.

- [ ] **Step 2: Replace `fields.ts` entirely**

```ts
import { apiFetch } from './client'
import type { FieldDef, MemberFieldEntry } from '../types'

export const fieldsApi = {
  listDefs: () =>
    apiFetch<FieldDef[]>('/api/fields'),

  createDef: (label: string) =>
    apiFetch<FieldDef>('/api/fields', {
      method: 'POST',
      body: JSON.stringify({ label, fieldType: 0 }),
    }),

  getMemberFields: (memberId: string) =>
    apiFetch<MemberFieldEntry[]>(`/api/members/${memberId}/fields`),

  upsertMemberField: (memberId: string, fieldId: string, value: string) =>
    apiFetch<MemberFieldEntry>(`/api/members/${memberId}/fields/${fieldId}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

  deleteMemberField: (memberId: string, fieldId: string) =>
    apiFetch<void>(`/api/members/${memberId}/fields/${fieldId}`, { method: 'DELETE' }),
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd src/PluralHost.Web && npx tsc --noEmit 2>&1 | head -40
```

Expected: Only SpecsTab errors remain (fixed in Task 3).

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/api/fields.ts
git commit -m "fix: fields.ts createDef sends label+fieldType matching backend DTO"
```

---

## Task 3: Fix `SpecsTab.tsx` — use `label` not `name`

**Root cause:** `SpecsTab` accesses `def.name` throughout but `FieldDef.name` no longer exists.

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/SpecsTab.tsx`

- [ ] **Step 1: Replace all `def.name` references**

Make the following targeted replacements (use exact line context to avoid wrong replacements):

1. `addDefMutation` — rename `name` param to `label`:
```ts
const addDefMutation = useMutation({
  mutationFn: (label: string) => fieldsApi.createDef(label),
  onSuccess: () => qc.invalidateQueries({ queryKey: ['field-defs'] }),
})
```

2. `handleAddField` existing-check line:
```ts
const existing = activeDefs.find((d: FieldDef) => d.label.toLowerCase() === trimmed.toLowerCase())
```

3. Field row display:
```tsx
<span className={styles.fieldName}>{def.label}</span>
```

4. Delete button aria-label:
```tsx
aria-label={`Delete ${def.label}`}
```

5. Preset chip existing-check:
```ts
const exists = activeDefs.find((d: FieldDef) => d.label.toLowerCase() === name.toLowerCase())
```

- [ ] **Step 2: TypeScript check**

```bash
cd src/PluralHost.Web && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors.

- [ ] **Step 3: Manual verify** — Start backend + frontend. Go to any member's Specs tab. Add a preset field (e.g., "Role"). Verify it appears with a label, value is editable, delete works.

```bash
# Backend
cd src/PluralHost.Api && dotnet run &
# Frontend
cd src/PluralHost.Web && npm run dev
```

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/SpecsTab.tsx
git commit -m "fix: SpecsTab use def.label instead of def.name throughout"
```

---

## Task 4: Fix board message deletion — remove PIN requirement

**Root cause:** `BoardController.DeleteAsync` requires `?pin=` query string, but the frontend never passes one (and owner-side board deletions don't need PIN protection — that level is for irreversible actions like member deletion). This also resolves the known "HIGH" security issue of PIN in query string.

**Files:**
- Modify: `src/PluralHost.Api/Controllers/BoardController.cs`

- [ ] **Step 1: Remove PIN check from `DeleteAsync`**

Replace the current `DeleteAsync` method body:

```csharp
[HttpDelete("{msgId:guid}")]
public async Task<IActionResult> DeleteAsync(Guid memberId, Guid msgId)
{
    var msg = await context.BoardMessages
        .FirstOrDefaultAsync(m => m.Id == msgId && m.MemberId == memberId);
    if (msg is null) return NotFound();

    msg.SoftDelete();
    await context.SaveChangesAsync();
    return Ok();
}
```

- [ ] **Step 2: Remove unused `gatekeeper` dependency if nothing else uses it**

Check if `IGatekeeperService gatekeeper` is referenced anywhere else in the class. If not, remove it from the constructor:

```csharp
public class BoardController(PluralHostContext context, IGhostModeService ghostMode) : ControllerBase
```

- [ ] **Step 3: Update `BoardControllerTests` for the delete path**

The existing test suite has a test asserting that delete without a valid PIN returns Forbid (403). After removing the PIN requirement, that test must be updated.

Read `tests/PluralHost.Tests/Controllers/BoardControllerTests.cs` first. Find the delete test(s) that pass/fail based on PIN, then:
- Remove the PIN-validation test entirely (or rename it to document it was intentionally removed)
- Update any remaining delete tests to call `DELETE` without a `?pin=` param and expect 200/404

- [ ] **Step 4: Build and test**

```bash
dotnet build src/PluralHost.Api
dotnet test tests/PluralHost.Tests --filter "BoardController" -v minimal
```

Expected: Build succeeded; all BoardController tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Api/Controllers/BoardController.cs tests/PluralHost.Tests/Controllers/BoardControllerTests.cs
git commit -m "fix: remove PIN from owner board delete — resolves always-403 bug and query-string PIN security issue"
```

---

## Task 5: Fix AccessTab checkbox layout

**Root cause:** `.field` uses `flex-direction: column` (correct for text input fields, label-on-top). Checkboxes need label and control on the same row.

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/AccessTab.module.css`
- Modify: `src/PluralHost.Web/src/components/tabs/AccessTab.tsx`

- [ ] **Step 1: Add `.checkboxField` to `AccessTab.module.css`**

After the `.field` rule block, add:

```css
.checkboxField {
  padding: 12px 0;
  border-bottom: 1px solid var(--color-surface);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.checkboxField .fieldLabel {
  font-size: 0.9rem;
  font-weight: 400;
  color: var(--color-text);
  text-transform: none;
  letter-spacing: 0;
  cursor: pointer;
}
```

- [ ] **Step 2: Update the 4 checkbox rows in `AccessTab.tsx`**

Replace each `<div className={styles.field}>` checkbox block with a `.checkboxField` row using `<label htmlFor>` for a11y. Pattern:

```tsx
<div className={styles.checkboxField}>
  <label htmlFor="chk-archived" className={styles.fieldLabel}>Archived</label>
  <input
    id="chk-archived"
    type="checkbox"
    checked={member.isArchived}
    onChange={() => updateMutation.mutate({ isArchived: !member.isArchived })}
  />
</div>
```

Apply the same pattern with unique IDs for all 4 checkboxes:
- `chk-archived` / Archived
- `chk-pinned` / Pinned
- `chk-prevent-front` / Prevent front notifications
- `chk-board-notifications` / Receive board notifications

- [ ] **Step 3: TypeScript check**

```bash
cd src/PluralHost.Web && npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/AccessTab.module.css src/PluralHost.Web/src/components/tabs/AccessTab.tsx
git commit -m "fix: AccessTab checkbox rows — label and input on same row with proper htmlFor"
```

---

## Task 6: Fix avatar pencil icon

**Root cause:** `.avatarPencil` is 28px on an 80px avatar (35% coverage). Reduce to 20px and use Lucide `Pencil` icon which has proper geometric bounds for centering.

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/EssenceTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/EssenceTab.module.css`

- [ ] **Step 1: Read current EssenceTab.module.css `.avatarPencil` rule**

Read the file first to see the exact current rule (needed for precise Edit).

- [ ] **Step 2: Add Lucide import to `EssenceTab.tsx`**

```tsx
import { Pencil } from 'lucide-react'
```

- [ ] **Step 3: Replace pencil button content**

Find the `.avatarPencil` button element and replace any text/emoji inside it with:
```tsx
<Pencil size={11} strokeWidth={2.5} />
```

- [ ] **Step 4: Update `.avatarPencil` in `EssenceTab.module.css`**

Set the size to 20px × 20px. Keep other properties (position, border-radius, background, etc.) intact. Only change `width` and `height` (and `font-size` if present):

```css
width: 20px;
height: 20px;
/* remove font-size if present, the SVG icon handles its own sizing */
```

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/EssenceTab.tsx src/PluralHost.Web/src/components/tabs/EssenceTab.module.css
git commit -m "fix: avatar pencil button 28px → 20px, Lucide Pencil icon"
```

---

## Task 7: Fix "+" add buttons with Lucide Plus

**Root cause:** Typographic `+` character has inconsistent vertical metrics — it visually sits off-center despite flexbox centering. Lucide icons have precise geometric bounding boxes.

**Files:**
- Modify: `src/PluralHost.Web/src/components/tabs/SpecsTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/CommsTab.tsx`
- Modify: `src/PluralHost.Web/src/components/tabs/DossierTab.tsx`

- [ ] **Step 1: Read DossierTab.tsx** to confirm it also has a `+` add button.

- [ ] **Step 2: Add `Plus` import to each of the 3 files**

```tsx
import { Plus } from 'lucide-react'
```

- [ ] **Step 3: Replace `+` text with `<Plus size={16} />` in each**

In each file, find the button that renders the text `+` for adding (aria-label like "Add spec", "Post message", "Add note") and replace the text node `+` with `<Plus size={16} />`.

- [ ] **Step 4: TypeScript check**

```bash
cd src/PluralHost.Web && npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/components/tabs/SpecsTab.tsx src/PluralHost.Web/src/components/tabs/CommsTab.tsx src/PluralHost.Web/src/components/tabs/DossierTab.tsx
git commit -m "fix: replace text + with Lucide Plus icon in tab add buttons"
```

---

## Task 8: Add `--color-danger` token

**Root cause:** `#f87171` is hardcoded as a fallback in `AccessTab.module.css` multiple times. The token was referenced but never defined in `tokens.css`.

**Files:**
- Modify: `src/PluralHost.Web/src/styles/tokens.css`

- [ ] **Step 1: Read `tokens.css` to find the correct insertion point**

Read `src/PluralHost.Web/src/styles/tokens.css` to confirm the Brand section layout before editing.

- [ ] **Step 2: Add `--color-danger` to the Brand section of `tokens.css`**

After the last color token in the Brand section (currently `--color-purple: #b400ff;`), add:

```css
--color-danger:  #f87171;
```

- [ ] **Step 3: Verify AccessTab already self-heals**

`AccessTab.module.css` already uses `var(--color-danger, #f87171)` fallback syntax. Once the token is defined, the fallback is no longer needed (but leaving it there is harmless).

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/styles/tokens.css
git commit -m "fix: add --color-danger token to design system"
```

---

## Task 9: Open Security section by default in Settings

**Root cause:** The collapsible Security section starts closed. New users trying to set their PIN for the first time don't see the form immediately, which may explain reports of PIN setup feeling broken.

**Files:**
- Modify: `src/PluralHost.Web/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add `defaultOpen` prop to `CollapsibleSection`**

Replace the `CollapsibleSection` component signature:

```tsx
function CollapsibleSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  // ... rest unchanged
```

- [ ] **Step 2: Pass `defaultOpen` to the Security section**

```tsx
<CollapsibleSection title="Security" defaultOpen>
```

- [ ] **Step 3: TypeScript check**

```bash
cd src/PluralHost.Web && npx tsc --noEmit 2>&1 | head -10
```

Expected: 0 errors.

- [ ] **Step 4: Manual test** — Navigate to Settings. Verify Security section is expanded immediately. Set a PIN if not already set. Verify "PIN set." success message appears.

If PIN setup still fails after UX fix, check DevTools Network tab for the `PUT /api/secure/pin` request:
- Should send `{"newPin":"1234"}` (no `currentPin` key on first setup)
- Should return 204 No Content on success
- If 400: backend rejected the request — check API logs for validation message
- If 500: run `dotnet run` in terminal and look for exception output

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/pages/SettingsPage.tsx
git commit -m "fix: Security section expands by default for first-run PIN setup UX"
```

---

## Completion Checklist

After all tasks are done, verify end-to-end:

- [ ] SpecsTab: can add a "Role" preset field, edit its value, delete it
- [ ] CommsTab: can delete a board message without error (no more 403)
- [ ] AccessTab: checkboxes display label and input on the same row
- [ ] EssenceTab: avatar pencil is visually smaller, not obscuring the avatar
- [ ] Settings: Security section is visible immediately; PIN can be set
- [ ] No TypeScript compile errors: `cd src/PluralHost.Web && npx tsc --noEmit`
- [ ] Backend builds: `dotnet build src/PluralHost.Api`
