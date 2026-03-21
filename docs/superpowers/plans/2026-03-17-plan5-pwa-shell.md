# Plan 5: PWA Shell Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first React PWA covering login, current front management, member list, member detail (Profile + Options tabs), and settings stub — with backend prerequisites for httpOnly cookie auth, CORS, logout, and front entry editing.

**Architecture:** Two backend tasks land first (cookie auth + CORS + logout; front entry edit). Then a React frontend is scaffolded at `src/PluralHost.Web/` using Vite + React 18 + TypeScript. Auth state lives in React context; the httpOnly cookie is the real credential and is never readable by JS. TanStack Query handles all server state. Auth 401s redirect globally to `/login`.

**Tech Stack:** .NET 8 / ASP.NET Core (backend), Vite 5, React 18, TypeScript 5, React Router v6, TanStack Query v5, vite-plugin-pwa, CSS Modules, Inter (Google Fonts), Vitest + React Testing Library (frontend), xUnit + Moq (backend)

---

## File Map

### Backend — Modified
- `src/PluralHost.Api/Controllers/AuthController.cs` — login sets cookie; add logout endpoint
- `src/PluralHost.Api/Program.cs` — JWT OnMessageReceived (cookie extraction) + CORS
- `src/PluralHost.Api/Dto/SpDtos.cs` — add `MemberId?` + `StartTime?` to `SpFrontUpdateRequest`
- `src/PluralHost.Api/Controllers/SpFrontController.cs` — handle new fields in `UpdateAsync`
- `tests/PluralHost.Tests/Controllers/AuthControllerTests.cs` — update login test, add logout test
- `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs` — add edit tests

### Frontend — Created
```
src/PluralHost.Web/
  index.html
  vite.config.ts
  tsconfig.json
  package.json
  src/
    main.tsx
    App.tsx
    test-setup.ts
    types.ts                         # shared TS interfaces
    context/
      AuthContext.tsx
    api/
      client.ts                      # fetch wrapper: credentials:include, 401→throw
      auth.ts
      members.ts
      front.ts
      groups.ts
    hooks/
      useReducedMotion.ts
    components/
      Avatar.tsx + Avatar.module.css
      BottomNav.tsx + BottomNav.module.css
      MemberCard.tsx + MemberCard.module.css
      FrontCard.tsx + FrontCard.module.css
      TabBar.tsx + TabBar.module.css
    pages/
      LoginPage.tsx + LoginPage.module.css
      FrontPage.tsx + FrontPage.module.css
      MembersPage.tsx + MembersPage.module.css
      MemberDetailPage.tsx + MemberDetailPage.module.css
      SettingsPage.tsx + SettingsPage.module.css
    styles/
      globals.css
      tokens.css
    __tests__/
      Avatar.test.tsx
      FrontCard.test.tsx
      MembersPage.test.tsx
      routing.test.tsx
      SettingsPage.test.tsx
  public/
    manifest.json
    icon-192.svg
    icon-512.svg
```

---

## Task 1: Backend — Cookie Auth, CORS, Logout

**Files:**
- Modify: `src/PluralHost.Api/Controllers/AuthController.cs`
- Modify: `src/PluralHost.Api/Program.cs`
- Modify: `tests/PluralHost.Tests/Controllers/AuthControllerTests.cs`

- [ ] **Step 1: Write failing tests for cookie auth and logout**

Add to `tests/PluralHost.Tests/Controllers/AuthControllerTests.cs`:

```csharp
// Replace the existing CreateController() helper with this version
// that wires up a real HttpContext so cookie writes work:
using Microsoft.AspNetCore.Http;

private AuthController CreateController()
{
    var controller = new AuthController(_authMock.Object);
    controller.ControllerContext = new ControllerContext
    {
        HttpContext = new DefaultHttpContext()
    };
    return controller;
}

[Fact]
public async Task Login_WithCorrectPassword_Returns200AndSetsCookie()
{
    _authMock.Setup(a => a.LoginAsync("correct")).ReturnsAsync("jwt-token-here");
    var controller = CreateController();
    var result = await controller.LoginAsync(new LoginRequest("correct"));
    Assert.IsType<OkResult>(result);  // no body — OkResult not OkObjectResult
    Assert.True(controller.HttpContext.Response.Headers.ContainsKey("Set-Cookie"));
}

[Fact]
public async Task Logout_Returns200AndClearsCookie()
{
    var controller = CreateController();
    var result = controller.Logout();
    Assert.IsType<OkResult>(result);
    Assert.True(controller.HttpContext.Response.Headers.ContainsKey("Set-Cookie"));
}
```

Also update the existing `Login_WithCorrectPassword_Returns200WithToken` test — it now expects `OkResult` (no body):

```csharp
// REPLACE the old test body:
[Fact]
public async Task Login_WithCorrectPassword_Returns200WithToken()
{
    _authMock.Setup(a => a.LoginAsync("correct")).ReturnsAsync("jwt-token-here");
    var result = await CreateController().LoginAsync(new LoginRequest("correct"));
    Assert.IsType<OkResult>(result);
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
dotnet test --filter "AuthControllerTests" -v minimal
```

Expected: new tests fail ("OkResult" vs "OkObjectResult", Logout method not found).

- [ ] **Step 3: Update `AuthController.cs`**

```csharp
// POST /api/auth/login — sets httpOnly cookie, returns 200 no body
[HttpPost("login")]
public async Task<IActionResult> LoginAsync([FromBody] LoginRequest request)
{
    var token = await auth.LoginAsync(request.Password);
    if (token == null)
        return Unauthorized(new { error = "Invalid credentials." });

    Response.Cookies.Append("token", token, new CookieOptions
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict,
        Expires = DateTimeOffset.UtcNow.AddDays(30)
    });
    return Ok();
}

// POST /api/auth/logout — clears the httpOnly cookie
[HttpPost("logout")]
[AllowAnonymous]
public IActionResult Logout()
{
    Response.Cookies.Delete("token", new CookieOptions
    {
        HttpOnly = true,
        Secure = true,
        SameSite = SameSiteMode.Strict
    });
    return Ok();
}
```

- [ ] **Step 4: Update `Program.cs`**

Add CORS (before `builder.Services.AddAuthentication`) and JWT cookie extraction:

```csharp
// After the jwtKey guard, before AddAuthentication:
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins("http://localhost:5173")
     .AllowAnyHeader()
     .AllowAnyMethod()
     .AllowCredentials()));

// Inside .AddJwtBearer(options => { ... }), after TokenValidationParameters block:
options.Events = new JwtBearerEvents
{
    OnMessageReceived = ctx =>
    {
        ctx.Token = ctx.Request.Cookies["token"];
        return Task.CompletedTask;
    }
};

// In the app pipeline, BEFORE app.UseAuthentication():
app.UseCors();
```

- [ ] **Step 5: Run all backend tests**

```bash
dotnet test -v minimal
```

Expected: all tests pass (previously 229; new tests bring it to 232).

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Controllers/AuthController.cs \
        src/PluralHost.Api/Program.cs \
        tests/PluralHost.Tests/Controllers/AuthControllerTests.cs
git commit -m "feat: httpOnly cookie auth, CORS for dev, logout endpoint"
```

---

## Task 2: Backend — Front Entry Edit (memberId + startTime)

**Files:**
- Modify: `src/PluralHost.Api/Dto/SpDtos.cs`
- Modify: `src/PluralHost.Api/Controllers/SpFrontController.cs`
- Modify: `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs`

- [ ] **Step 1: Write failing tests**

Open `tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs` and add:

```csharp
[Fact]
public async Task Update_WithMemberId_UpdatesMember()
{
    var memberId = Guid.NewGuid();
    var newMemberId = Guid.NewGuid();
    var entry = new FrontHistory { Id = Guid.NewGuid(), MemberId = memberId, FrontStart = DateTime.UtcNow };
    _context.FrontHistory.Add(entry);
    await _context.SaveChangesAsync();

    var controller = new SpFrontController(_context);
    var result = await controller.UpdateAsync(
        entry.Id.ToString(),
        new SpFrontUpdateRequest(MemberId: newMemberId.ToString()));

    Assert.IsType<OkResult>(result);
    var updated = await _context.FrontHistory.FindAsync(entry.Id);
    Assert.Equal(newMemberId, updated!.MemberId);
}

[Fact]
public async Task Update_WithStartTime_UpdatesFrontStart()
{
    var entry = new FrontHistory { Id = Guid.NewGuid(), MemberId = Guid.NewGuid(), FrontStart = DateTime.UtcNow };
    _context.FrontHistory.Add(entry);
    await _context.SaveChangesAsync();

    var newStart = DateTimeOffset.UtcNow.AddHours(-2).ToUnixTimeMilliseconds();
    var controller = new SpFrontController(_context);
    var result = await controller.UpdateAsync(
        entry.Id.ToString(),
        new SpFrontUpdateRequest(StartTime: newStart));

    Assert.IsType<OkResult>(result);
    var updated = await _context.FrontHistory.FindAsync(entry.Id);
    Assert.Equal(Epoch.FromMs(newStart), updated!.FrontStart);
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
dotnet test --filter "SpFrontControllerTests" -v minimal
```

Expected: compile error — `SpFrontUpdateRequest` has no `MemberId` or `StartTime` parameter.

- [ ] **Step 3: Update `SpFrontUpdateRequest` in `SpDtos.cs`**

```csharp
public record SpFrontUpdateRequest(
    bool? Live = null,
    long? EndTime = null,
    string? CustomStatus = null,
    string? MemberId = null,    // ← added: correct the fronting member
    long? StartTime = null      // ← added: correct the start time (epoch ms)
);
```

- [ ] **Step 4: Update `UpdateAsync` in `SpFrontController.cs`**

Inside the existing `UpdateAsync` method, after the `CustomStatus` line:

```csharp
if (body.MemberId is not null && Guid.TryParse(body.MemberId, out var newMemberId))
    entry.MemberId = newMemberId;
if (body.StartTime.HasValue)
    entry.FrontStart = Epoch.FromMs(body.StartTime.Value);
```

- [ ] **Step 5: Run all backend tests**

```bash
dotnet test -v minimal
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Api/Dto/SpDtos.cs \
        src/PluralHost.Api/Controllers/SpFrontController.cs \
        tests/PluralHost.Tests/Controllers/SpFrontControllerTests.cs
git commit -m "feat: PATCH /v1/frontHistory supports memberId and startTime correction"
```

---

## Task 3: Vite Scaffold + Test Tooling

**Files:** All new under `src/PluralHost.Web/`

- [ ] **Step 1: Scaffold**

```bash
cd src
npm create vite@latest PluralHost.Web -- --template react-ts
cd PluralHost.Web
npm install react-router-dom @tanstack/react-query
npm install -D vitest @testing-library/react @testing-library/jest-dom \
               @testing-library/user-event jsdom vite-plugin-pwa
```

- [ ] **Step 2: Configure Vitest in `vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,   // we provide public/manifest.json manually
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    globals: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/v1': 'http://localhost:8080',
    },
  },
})
```

- [ ] **Step 3: Create `src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Update `tsconfig.json` to include test globals**

Add `"types": ["vitest/globals"]` inside `compilerOptions`.

- [ ] **Step 5: Smoke test**

```bash
npx vitest run
```

Expected: 0 tests, 0 failures (no test files yet).

- [ ] **Step 6: Commit**

```bash
cd ../..
git add src/PluralHost.Web/
git commit -m "feat: scaffold Vite React TS frontend with Vitest and vite-plugin-pwa"
```

---

## Task 4: CSS Design System

**Files:**
- Create: `src/PluralHost.Web/src/styles/tokens.css`
- Create: `src/PluralHost.Web/src/styles/globals.css`

- [ ] **Step 1: Create `tokens.css`**

```css
/* src/styles/tokens.css */
:root {
  /* Brand */
  --color-bg:      #121212;
  --color-surface: #1a1a1a;
  --color-primary: #b6ff00;
  --color-pink:    #ff4db8;
  --color-cyan:    #00d4ff;
  --color-purple:  #b400ff;
  --color-text:    #f2f2f2;
  --color-muted:   #888888;

  /* Spacing */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;

  /* Radius */
  --radius-sm:   6px;
  --radius-md:   10px;
  --radius-lg:   16px;
  --radius-full: 9999px;

  /* Z-index scale */
  --z-base:   10;
  --z-overlay: 20;
  --z-modal:   30;
  --z-toast:   50;

  /* Touch */
  --touch-min: 44px;
}
```

- [ ] **Step 2: Create `globals.css`**

```css
/* src/styles/globals.css */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
@import './tokens.css';

*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
}

body {
  font-family: var(--font-sans);
  font-size: var(--text-base);
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
  -webkit-font-smoothing: antialiased;
}

a { color: inherit; text-decoration: none; }
button { font-family: inherit; cursor: pointer; border: none; background: none; }
input, textarea { font-family: inherit; }

/* Touch targets: all interactive elements get min 44x44px */
button, a, [role="button"] {
  min-height: var(--touch-min);
  min-width: var(--touch-min);
  display: inline-flex;
  align-items: center;
}
/* Exception: full-width elements don't need min-width (they already fill container) */
button[style*="width: 100"], .fullWidth { min-width: unset; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 3: Import globals in `src/main.tsx`**

```typescript
import './styles/globals.css'
```

- [ ] **Step 4: Commit**

```bash
git add src/PluralHost.Web/src/styles/
git commit -m "feat: CSS design system tokens and globals with Inter font"
```

---

## Task 5: Types + API Client Layer

**Files:**
- Create: `src/PluralHost.Web/src/types.ts`
- Create: `src/PluralHost.Web/src/api/client.ts`
- Create: `src/PluralHost.Web/src/api/auth.ts`
- Create: `src/PluralHost.Web/src/api/members.ts`
- Create: `src/PluralHost.Web/src/api/front.ts`
- Create: `src/PluralHost.Web/src/api/groups.ts`

- [ ] **Step 1: Create `types.ts`**

```typescript
// src/types.ts
export type PrivacyTier = 'Public' | 'Friend' | 'Trusted' | 'Private'

export interface Member {
  id: string
  name: string
  displayName?: string
  pronouns?: string
  color?: string
  avatarPath?: string
  description?: string
  privacyTier: PrivacyTier
  isArchived: boolean
  isUntracked: boolean
  isPinned: boolean
  preventFrontNotification: boolean
  receiveBoardNotifications: boolean
  groupIds: string[]
  parentIds: string[]
  createdAt: string
  updatedAt: string
}

export interface MemberUpdatePayload {
  name?: string
  displayName?: string
  pronouns?: string
  color?: string
  description?: string
  privacyTier?: PrivacyTier
  isArchived?: boolean
  isPinned?: boolean
  preventFrontNotification?: boolean
  receiveBoardNotifications?: boolean
}

// SP envelope — wraps all /v1/* responses
export interface SpEnvelope<T> {
  exists: boolean
  id: string
  content: T
}

export interface FrontContent {
  uid: string
  member: string    // member ID (GUID string)
  live: boolean
  startTime: number // epoch ms
  endTime?: number  // epoch ms, null if still live
  custom: boolean
  customStatus?: string
}

export interface FrontCreatePayload {
  member: string
  live: boolean
  startTime: number
  endTime?: number
  customStatus?: string
}

export interface FrontUpdatePayload {
  live?: boolean
  endTime?: number
  customStatus?: string
  memberId?: string
  startTime?: number
}

export interface Group {
  id: string
  name: string
  description?: string
  color?: string
  emoji?: string
  members: string[]   // member ID strings
}
```

- [ ] **Step 2: Create `api/client.ts`**

```typescript
// src/api/client.ts
export class UnauthorizedError extends Error {}

const BASE = import.meta.env.VITE_API_BASE_URL ?? ''

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (res.status === 401) throw new UnauthorizedError('Session expired')
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`${res.status} ${body}`)
  }

  // 204 No Content or empty body
  const text = await res.text()
  return text ? (JSON.parse(text) as T) : (undefined as T)
}
```

- [ ] **Step 3: Create `api/auth.ts`**

```typescript
// src/api/auth.ts
import { apiFetch } from './client'

export const authApi = {
  login: (password: string) =>
    apiFetch<void>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  logout: () =>
    apiFetch<void>('/api/auth/logout', { method: 'POST' }),
}
```

- [ ] **Step 4: Create `api/members.ts`**

```typescript
// src/api/members.ts
import { apiFetch } from './client'
import type { Member, MemberUpdatePayload } from '../types'

export const membersApi = {
  list: () => apiFetch<Member[]>('/api/members'),

  get: (id: string) => apiFetch<Member>(`/api/members/${id}`),

  update: (id: string, payload: MemberUpdatePayload) =>
    apiFetch<Member>(`/api/members/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
}
```

- [ ] **Step 5: Create `api/front.ts`**

```typescript
// src/api/front.ts
import { apiFetch } from './client'
import type { SpEnvelope, FrontContent, FrontCreatePayload, FrontUpdatePayload } from '../types'

export const frontApi = {
  getCurrent: () =>
    apiFetch<SpEnvelope<FrontContent>[]>('/v1/fronters'),

  create: (payload: FrontCreatePayload) =>
    apiFetch<string>('/v1/frontHistory', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: FrontUpdatePayload) =>
    apiFetch<void>(`/v1/frontHistory/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  delete: (id: string) =>
    apiFetch<void>(`/v1/frontHistory/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step 6: Create `api/groups.ts`**

```typescript
// src/api/groups.ts
import { apiFetch } from './client'
import type { SpEnvelope, Group } from '../types'

export const groupsApi = {
  list: () => apiFetch<SpEnvelope<Group>[]>('/v1/groups/owner'),

  setMemberships: (memberId: string, groupIds: string[]) =>
    apiFetch<void>('/v1/group/members', {
      method: 'PATCH',
      body: JSON.stringify({ member: memberId, groups: groupIds }),
    }),
}
```

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/types.ts src/PluralHost.Web/src/api/
git commit -m "feat: TypeScript types and API client layer"
```

---

## Task 6: Auth Context + App Shell + Login Page

**Files:**
- Create: `src/PluralHost.Web/src/context/AuthContext.tsx`
- Create: `src/PluralHost.Web/src/App.tsx`
- Create: `src/PluralHost.Web/src/main.tsx`
- Create: `src/PluralHost.Web/src/pages/LoginPage.tsx` + `LoginPage.module.css`
- Create: `src/PluralHost.Web/src/__tests__/routing.test.tsx`

- [ ] **Step 1: Write failing routing tests**

```typescript
// src/__tests__/routing.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'
import { AuthContext } from '../context/AuthContext'

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

test('unauthenticated user at /front is redirected to /login', () => {
  render(
    <QueryClientProvider client={qc()}>
      <AuthContext.Provider value={{ isAuthenticated: false, setAuthenticated: () => {} }}>
        <MemoryRouter initialEntries={['/front']}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
})

test('authenticated user at / is redirected to /front', () => {
  render(
    <QueryClientProvider client={qc()}>
      <AuthContext.Provider value={{ isAuthenticated: true, setAuthenticated: () => {} }}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  )
  // /front renders the FrontPage heading
  expect(screen.getByText(/fronting now/i)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: compile errors (App, AuthContext don't exist yet).

- [ ] **Step 3: Create `context/AuthContext.tsx`**

```typescript
// src/context/AuthContext.tsx
import { createContext, useContext, useState } from 'react'

interface AuthContextValue {
  isAuthenticated: boolean
  setAuthenticated: (v: boolean) => void
}

export const AuthContext = createContext<AuthContextValue>({
  isAuthenticated: false,
  setAuthenticated: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false)
  return (
    <AuthContext.Provider value={{ isAuthenticated, setAuthenticated }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
```

- [ ] **Step 4: Create `App.tsx`**

```typescript
// src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import FrontPage from './pages/FrontPage'
import MembersPage from './pages/MembersPage'
import MemberDetailPage from './pages/MemberDetailPage'
import SettingsPage from './pages/SettingsPage'
import HistoryStubPage from './pages/HistoryStubPage'
import BottomNav from './components/BottomNav'

function Protected({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  const { isAuthenticated } = useAuth()
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/front" replace />} />
        <Route path="/front" element={<Protected><FrontPage /></Protected>} />
        <Route path="/members" element={<Protected><MembersPage /></Protected>} />
        <Route path="/members/:id" element={<Protected><MemberDetailPage /></Protected>} />
        <Route path="/history" element={<Protected><HistoryStubPage /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      </Routes>
      {isAuthenticated && <BottomNav />}
    </>
  )
}
```

- [ ] **Step 5: Create `main.tsx`**

```typescript
// src/main.tsx
import './styles/globals.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { UnauthorizedError } from './api/client'
import App from './App'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: 30_000,
    },
  },
  // Global 401 handler: clear auth and redirect
  // (TanStack Query v5 uses queryCache.subscribe for this)
})

queryClient.getQueryCache().subscribe(event => {
  if (
    event.type === 'updated' &&
    event.action.type === 'error' &&
    event.action.error instanceof UnauthorizedError
  ) {
    window.location.href = '/login'
  }
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
```

- [ ] **Step 6: Create stub pages so App compiles** (FrontPage, MembersPage, etc. — minimal stubs, replaced in later tasks)

For each of `FrontPage`, `MembersPage`, `MemberDetailPage`, `SettingsPage`, `HistoryStubPage` create a minimal file:

```typescript
// pages/FrontPage.tsx
export default function FrontPage() {
  return <main><h1>0 fronting now</h1></main>
}
```

```typescript
// pages/HistoryStubPage.tsx
export default function HistoryStubPage() {
  return <main style={{ padding: '1rem' }}><h1>History coming soon</h1></main>
}
```

Also create `src/pages/MembersPage.tsx` (stub — replaced in Task 10):
```typescript
export default function MembersPage() { return <main /> }
```
Create `src/pages/MemberDetailPage.tsx` (stub — replaced in Task 11):
```typescript
export default function MemberDetailPage() { return <main /> }
```
Create `src/pages/SettingsPage.tsx` (stub — replaced in Task 12):
```typescript
export default function SettingsPage() { return <main /> }
```

- [ ] **Step 7: Create `LoginPage.tsx`**

```typescript
// src/pages/LoginPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { setAuthenticated } = useAuth()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.login(password)
      setAuthenticated(true)
      navigate('/front', { replace: true })
    } catch {
      setError('Invalid password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.heading}>Sign in</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="password" className={styles.label}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className={styles.input}
            autoComplete="current-password"
            required
          />
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className={styles.submit}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

```css
/* src/pages/LoginPage.module.css */
.page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.card {
  width: 100%;
  max-width: 360px;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-8);
}

.heading {
  font-size: var(--text-2xl);
  font-weight: 600;
  margin-bottom: var(--space-6);
}

.form { display: flex; flex-direction: column; gap: var(--space-4); }

.label { font-size: var(--text-sm); color: var(--color-muted); }

.input {
  width: 100%;
  min-height: var(--touch-min);
  padding: 0 var(--space-4);
  background: var(--color-bg);
  border: 1px solid #333;
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--text-base);
}

.input:focus { outline: 2px solid var(--color-primary); outline-offset: 2px; }

.error { color: var(--color-pink); font-size: var(--text-sm); }

.submit {
  justify-content: center;
  background: var(--color-primary);
  color: #121212;
  font-weight: 600;
  border-radius: var(--radius-md);
  padding: 0 var(--space-6);
  min-height: var(--touch-min);
  transition: opacity 150ms;
}
.submit:disabled { opacity: 0.5; cursor: not-allowed; }
.submit:hover:not(:disabled) { opacity: 0.9; }
```

- [ ] **Step 8: Run tests**

```bash
npx vitest run
```

Expected: routing tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/PluralHost.Web/src/
git commit -m "feat: auth context, app shell routing, login page"
```

---

## Task 7: Avatar Component

**Files:**
- Create: `src/PluralHost.Web/src/components/Avatar.tsx` + `Avatar.module.css`
- Create: `src/PluralHost.Web/src/__tests__/Avatar.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/Avatar.test.tsx
import { render, screen } from '@testing-library/react'
import Avatar from '../components/Avatar'

test('shows first initial when no avatarPath', () => {
  render(<Avatar name="Cypress" color="#b6ff00" />)
  expect(screen.getByText('C')).toBeInTheDocument()
})

test('shows img when avatarPath is provided', () => {
  render(<Avatar name="Cypress" color="#b6ff00" avatarPath="/api/media/abc" />)
  expect(screen.getByRole('img', { name: 'Cypress' })).toBeInTheDocument()
})

test('applies member color as background when no image', () => {
  const { container } = render(<Avatar name="Kai" color="#ff4db8" />)
  const circle = container.firstChild as HTMLElement
  expect(circle).toHaveStyle({ '--member-color': '#ff4db8' })
})

test('applies fronting ring class when isFronting is true', () => {
  const { container } = render(<Avatar name="Kai" color="#b6ff00" isFronting />)
  expect(container.firstChild).toHaveClass('fronting')
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run Avatar
```

Expected: Avatar not found.

- [ ] **Step 3: Create `Avatar.tsx`**

```typescript
// src/components/Avatar.tsx
import styles from './Avatar.module.css'

interface AvatarProps {
  name: string
  color?: string
  avatarPath?: string
  isFronting?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export default function Avatar({
  name, color = '#888', avatarPath, isFronting = false, size = 'md',
}: AvatarProps) {
  const style = { '--member-color': color } as React.CSSProperties
  const cls = [styles.avatar, styles[size], isFronting && styles.fronting]
    .filter(Boolean).join(' ')

  return (
    <div className={cls} style={style} aria-label={name}>
      {avatarPath
        ? <img src={avatarPath} alt={name} className={styles.img} />
        : <span className={styles.initial}>{name[0]?.toUpperCase()}</span>
      }
    </div>
  )
}
```

```css
/* src/components/Avatar.module.css */
.avatar {
  border-radius: var(--radius-full);
  background: var(--member-color);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border: 2px solid transparent;
  transition: border-color 150ms;
}
.sm  { width: 32px; height: 32px; }
.md  { width: 44px; height: 44px; }
.lg  { width: 72px; height: 72px; }

.fronting { border-color: var(--color-primary); }

.img { width: 100%; height: 100%; object-fit: cover; }

.initial {
  color: #fff;
  font-weight: 600;
  font-size: 0.85em;
  line-height: 1;
}

@media (prefers-reduced-motion: reduce) {
  .avatar { transition: none; }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run Avatar
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/components/Avatar.tsx \
        src/PluralHost.Web/src/components/Avatar.module.css \
        src/PluralHost.Web/src/__tests__/Avatar.test.tsx
git commit -m "feat: Avatar component with color ring, initial fallback, fronting indicator"
```

---

## Task 8: Bottom Nav

**Files:**
- Create: `src/PluralHost.Web/src/components/BottomNav.tsx` + `BottomNav.module.css`

- [ ] **Step 1: Create `BottomNav.tsx`**

```typescript
// src/components/BottomNav.tsx
import { NavLink } from 'react-router-dom'
import styles from './BottomNav.module.css'

const TABS = [
  { to: '/front',   label: 'Front',   icon: '◉' },
  { to: '/members', label: 'Members', icon: '◈' },
  { to: '/history', label: 'History', icon: '◷' },
  { to: '/settings',label: 'Settings',icon: '⊙' },
]

// Note: icons above are placeholders — replace with SVG icons from Lucide
// e.g.: import { Users, Clock, Settings, Radio } from 'lucide-react'

export default function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {TABS.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            [styles.tab, isActive && styles.active].filter(Boolean).join(' ')
          }
        >
          <span className={styles.icon} aria-hidden="true">{tab.icon}</span>
          <span className={styles.label}>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

```css
/* src/components/BottomNav.module.css */
.nav {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  display: flex;
  background: var(--color-surface);
  border-top: 1px solid #2a2a2a;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  z-index: var(--z-base);
}

.tab {
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: var(--touch-min);
  gap: var(--space-1);
  color: var(--color-muted);
  font-size: var(--text-xs);
  transition: color 150ms;
  padding: var(--space-2) 0;
}
.tab:hover { color: var(--color-text); }
.active { color: var(--color-primary); }

.icon { font-size: var(--text-lg); line-height: 1; }
.label { font-size: 10px; }

@media (prefers-reduced-motion: reduce) {
  .tab { transition: none; }
}
```

> **Icon note:** The placeholder characters above are for scaffolding. Replace with `lucide-react` icons (`npm install lucide-react`) before final delivery:
> `import { Radio, Users, Clock, Settings } from 'lucide-react'`

- [ ] **Step 2: Commit**

```bash
git add src/PluralHost.Web/src/components/BottomNav.tsx \
        src/PluralHost.Web/src/components/BottomNav.module.css
git commit -m "feat: BottomNav with 4 tabs and active state"
```

---

## Task 9: useReducedMotion Hook + FrontPage + FrontCard

**Files:**
- Create: `src/PluralHost.Web/src/hooks/useReducedMotion.ts`
- Create: `src/PluralHost.Web/src/components/FrontCard.tsx` + `FrontCard.module.css`
- Create: `src/PluralHost.Web/src/pages/FrontPage.tsx` + `FrontPage.module.css`
- Create: `src/PluralHost.Web/src/__tests__/FrontCard.test.tsx`

- [ ] **Step 1: Write failing FrontCard tests**

```typescript
// src/__tests__/FrontCard.test.tsx
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FrontCard from '../components/FrontCard'
import type { SpEnvelope, FrontContent } from '../types'

const makeFront = (overrides?: Partial<FrontContent>): SpEnvelope<FrontContent> => ({
  exists: true,
  id: 'entry-1',
  content: {
    uid: 'owner',
    member: 'member-abc',
    live: true,
    startTime: Date.now() - 5000,
    custom: false,
    ...overrides,
  },
})

const member = { id: 'member-abc', name: 'Cypress', color: '#b6ff00' }

test('shows member name', () => {
  render(
    <FrontCard
      entry={makeFront()}
      member={member as any}
      onUpdate={() => {}}
      onRemove={() => {}}
    />
  )
  expect(screen.getByText('Cypress')).toBeInTheDocument()
})

test('shows timer text when not reduced motion', () => {
  render(
    <FrontCard
      entry={makeFront()}
      member={member as any}
      onUpdate={() => {}}
      onRemove={() => {}}
    />
  )
  // Timer should render some duration text
  expect(screen.getByTestId('front-timer')).toBeInTheDocument()
})

test('calls onRemove when Remove is clicked', async () => {
  const onRemove = vi.fn()
  render(
    <FrontCard
      entry={makeFront()}
      member={member as any}
      onUpdate={() => {}}
      onRemove={onRemove}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: /remove/i }))
  expect(onRemove).toHaveBeenCalledWith('entry-1')
})

test('collapses to compact on header click', async () => {
  render(
    <FrontCard
      entry={makeFront()}
      member={member as any}
      onUpdate={() => {}}
      onRemove={() => {}}
    />
  )
  await userEvent.click(screen.getByTestId('front-card-header'))
  expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run FrontCard
```

- [ ] **Step 3: Create `hooks/useReducedMotion.ts`**

```typescript
// src/hooks/useReducedMotion.ts
import { useState, useEffect } from 'react'

export function useReducedMotion(): boolean {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  const [reduced, setReduced] = useState(mq.matches)
  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}
```

- [ ] **Step 4: Create `FrontCard.tsx`**

```typescript
// src/components/FrontCard.tsx
import { useState, useEffect, useRef } from 'react'
import Avatar from './Avatar'
import { useReducedMotion } from '../hooks/useReducedMotion'
import type { SpEnvelope, FrontContent, Member } from '../types'
import styles from './FrontCard.module.css'

interface Props {
  entry: SpEnvelope<FrontContent>
  member: Member | undefined
  onUpdate: (id: string, payload: { customStatus?: string; memberId?: string; startTime?: number }) => void
  onRemove: (id: string) => void
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const h = Math.floor(m / 60)
  if (h > 0) return `${h}h ${m % 60}m`
  if (m > 0) return `${m}m ${s % 60}s`
  return `${s}s`
}

export default function FrontCard({ entry, member, onUpdate, onRemove }: Props) {
  const reduced = useReducedMotion()
  const [collapsed, setCollapsed] = useState(false)
  const [elapsed, setElapsed] = useState(Date.now() - entry.content.startTime)
  const [editingStatus, setEditingStatus] = useState(false)
  const [statusDraft, setStatusDraft] = useState(entry.content.customStatus ?? '')
  const [editingEntry, setEditingEntry] = useState(false)
  const [startDraft, setStartDraft] = useState(
    new Date(entry.content.startTime).toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm"
  )
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (reduced) return
    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - entry.content.startTime)
    }, 1000)
    return () => clearInterval(intervalRef.current)
  }, [entry.content.startTime, reduced])

  const startDate = new Date(entry.content.startTime)
  const startLabel = startDate.toLocaleString(undefined, {
    hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric',
  })

  return (
    <div className={styles.card} data-member>
      <div
        className={styles.header}
        data-testid="front-card-header"
        onClick={() => setCollapsed(c => !c)}
        role="button"
        aria-expanded={!collapsed}
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setCollapsed(c => !c)}
      >
        <Avatar
          name={member?.name ?? '?'}
          color={member?.color}
          avatarPath={member?.avatarPath ? `/api/media/${member.avatarPath}` : undefined}
          isFronting
        />
        <div className={styles.headerText}>
          <span className={styles.name}>{member?.name ?? entry.content.member}</span>
          {member?.pronouns && <span className={styles.pronouns}>{member.pronouns}</span>}
        </div>
        {!reduced && (
          <span className={styles.timer} data-testid="front-timer">
            {formatDuration(elapsed)}
          </span>
        )}
      </div>

      {!collapsed && (
        <div className={styles.body}>
          <p className={styles.startTime}>Started {startLabel}</p>

          {editingStatus ? (
            <div className={styles.statusEdit}>
              <input
                value={statusDraft}
                onChange={e => setStatusDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    onUpdate(entry.id, { customStatus: statusDraft })
                    setEditingStatus(false)
                  }
                  if (e.key === 'Escape') setEditingStatus(false)
                }}
                autoFocus
                className={styles.statusInput}
                placeholder="Status note…"
              />
            </div>
          ) : (
            <p
              className={styles.status}
              onClick={() => setEditingStatus(true)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setEditingStatus(true)}
            >
              {entry.content.customStatus || <span className={styles.statusPlaceholder}>Add status…</span>}
            </p>
          )}

          {editingEntry && (
            <div className={styles.entryEdit}>
              <label className={styles.editLabel}>Start time</label>
              <input
                type="datetime-local"
                value={startDraft}
                onChange={e => setStartDraft(e.target.value)}
                className={styles.statusInput}
              />
              <div className={styles.editActions}>
                <button
                  className={styles.saveBtn}
                  onClick={() => {
                    const ms = new Date(startDraft).getTime()
                    if (!isNaN(ms)) onUpdate(entry.id, { startTime: ms })
                    setEditingEntry(false)
                  }}
                >
                  Save
                </button>
                <button className={styles.cancelBtn} onClick={() => setEditingEntry(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className={styles.actions}>
            <button
              className={styles.btnEdit}
              onClick={() => setEditingEntry(true)}
              aria-label="Edit front entry"
            >
              Edit
            </button>
            <button
              className={styles.btnRemove}
              onClick={() => onRemove(entry.id)}
              aria-label="Remove fronter"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

```css
/* src/components/FrontCard.module.css */
.card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin-bottom: var(--space-4);
}

.header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  cursor: pointer;
  min-height: var(--touch-min);
}
.header:focus { outline: 2px solid var(--color-primary); outline-offset: -2px; }

.headerText { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.name { font-weight: 600; }
.pronouns { font-size: var(--text-sm); color: var(--color-muted); }

.timer { color: var(--color-primary); font-variant-numeric: tabular-nums; font-size: var(--text-sm); }

.body { padding: 0 var(--space-4) var(--space-4); }
.startTime { font-size: var(--text-sm); color: var(--color-cyan); margin-bottom: var(--space-3); }

.status {
  font-size: var(--text-sm);
  color: var(--color-text);
  min-height: var(--touch-min);
  display: flex;
  align-items: center;
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: 0 var(--space-2);
}
.status:hover { background: #222; }
.statusPlaceholder { color: var(--color-muted); }

.statusInput {
  width: 100%;
  min-height: var(--touch-min);
  padding: 0 var(--space-3);
  background: var(--color-bg);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  font-size: var(--text-sm);
}

.actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.btnEdit, .btnRemove {
  flex: 1;
  justify-content: center;
  min-height: var(--touch-min);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: opacity 150ms;
}
.btnEdit { background: #2a2a2a; color: var(--color-text); }
.btnRemove { background: var(--color-pink); color: #fff; }
.btnEdit:hover, .btnRemove:hover { opacity: 0.8; }

.entryEdit { margin-top: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.editLabel { font-size: var(--text-xs); color: var(--color-muted); }
.editActions { display: flex; gap: var(--space-2); }
.saveBtn { background: var(--color-primary); color: #121212; font-weight: 600; padding: 0 var(--space-4); border-radius: var(--radius-md); min-height: var(--touch-min); }
.cancelBtn { background: #2a2a2a; color: var(--color-muted); padding: 0 var(--space-4); border-radius: var(--radius-md); min-height: var(--touch-min); }

@media (prefers-reduced-motion: reduce) {
  .btnEdit, .btnRemove { transition: none; }
}
```

- [ ] **Step 5: Create `FrontPage.tsx`** (replaces the stub)

```typescript
// src/pages/FrontPage.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { frontApi } from '../api/front'
import { membersApi } from '../api/members'
import FrontCard from '../components/FrontCard'
import type { Member } from '../types'
import styles from './FrontPage.module.css'

export default function FrontPage() {
  const qc = useQueryClient()

  const { data: fronters = [] } = useQuery({
    queryKey: ['fronters'],
    queryFn: frontApi.getCurrent,
    refetchInterval: 30_000,
  })

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: membersApi.list,
  })

  const memberMap = new Map<string, Member>(members.map(m => [m.id, m]))

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof frontApi.update>[1] }) =>
      frontApi.update(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fronters'] }),
  })

  const removeMutation = useMutation({
    mutationFn: frontApi.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fronters'] }),
  })

  const addMutation = useMutation({
    mutationFn: (memberId: string) =>
      frontApi.create({ member: memberId, live: true, startTime: Date.now() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fronters'] }),
  })

  const [showPicker, setShowPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')

  const nonFronting = members.filter(
    m => !fronters.some(f => f.content.member === m.id) && !m.isArchived
  )
  const filtered = nonFronting.filter(m =>
    m.name.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <span className={styles.count}>{fronters.length} fronting now</span>
        <button
          className={styles.addBtn}
          onClick={() => setShowPicker(true)}
        >
          + Add Fronter
        </button>
      </div>

      {fronters.map(entry => (
        <FrontCard
          key={entry.id}
          entry={entry}
          member={memberMap.get(entry.content.member)}
          onUpdate={(id, payload) => updateMutation.mutate({ id, payload })}
          onRemove={id => removeMutation.mutate(id)}
        />
      ))}

      {showPicker && (
        <div className={styles.pickerBackdrop} onClick={() => setShowPicker(false)}>
          <div className={styles.picker} onClick={e => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="Search members…"
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              className={styles.pickerSearch}
            />
            <ul className={styles.pickerList}>
              {filtered.map(m => (
                <li key={m.id}>
                  <button
                    className={styles.pickerItem}
                    onClick={() => {
                      addMutation.mutate(m.id)
                      setShowPicker(false)
                      setPickerSearch('')
                    }}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </main>
  )
}
```

```css
/* src/pages/FrontPage.module.css */
.page { padding: var(--space-4); padding-bottom: calc(var(--touch-min) + var(--space-8)); }

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}
.count { font-size: var(--text-lg); font-weight: 600; }

.addBtn {
  background: var(--color-primary);
  color: #121212;
  font-weight: 600;
  padding: 0 var(--space-4);
  border-radius: var(--radius-md);
  min-height: var(--touch-min);
}

.pickerBackdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  display: flex;
  align-items: flex-end;
  z-index: var(--z-overlay);
}
.picker {
  width: 100%;
  background: var(--color-surface);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding: var(--space-4);
  max-height: 70dvh;
  overflow-y: auto;
}
.pickerSearch {
  width: 100%;
  min-height: var(--touch-min);
  padding: 0 var(--space-4);
  background: var(--color-bg);
  border: 1px solid #333;
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--text-base);
  margin-bottom: var(--space-3);
}
.pickerList { list-style: none; }
.pickerItem {
  width: 100%;
  justify-content: flex-start;
  padding: 0 var(--space-3);
  min-height: var(--touch-min);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  color: var(--color-text);
}
.pickerItem:hover { background: #2a2a2a; }
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run FrontCard
```

Expected: 4 passing.

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/hooks/ \
        src/PluralHost.Web/src/components/FrontCard.tsx \
        src/PluralHost.Web/src/components/FrontCard.module.css \
        src/PluralHost.Web/src/pages/FrontPage.tsx \
        src/PluralHost.Web/src/pages/FrontPage.module.css \
        src/PluralHost.Web/src/__tests__/FrontCard.test.tsx
git commit -m "feat: FrontPage with FrontCard, live timer, add/remove/status fronters"
```

---

## Task 10: Members Page + Member Card

**Files:**
- Create: `src/PluralHost.Web/src/components/MemberCard.tsx` + `MemberCard.module.css`
- Create: `src/PluralHost.Web/src/pages/MembersPage.tsx` + `MembersPage.module.css`
- Create: `src/PluralHost.Web/src/__tests__/MembersPage.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/MembersPage.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MembersPage from '../pages/MembersPage'
import * as membersApi from '../api/members'
import type { Member } from '../types'

vi.mock('../api/members')
vi.mock('../api/front', () => ({ frontApi: { getCurrent: vi.fn().mockResolvedValue([]) } }))
vi.mock('../api/groups', () => ({ groupsApi: { list: vi.fn().mockResolvedValue([]) } }))

const MEMBERS: Member[] = [
  { id: '1', name: 'Alice', color: '#f00', privacyTier: 'Public', isArchived: false } as Member,
  { id: '2', name: 'Bob',   color: '#0f0', privacyTier: 'Public', isArchived: false } as Member,
  { id: '3', name: 'Charlie', color: '#00f', privacyTier: 'Public', isArchived: false } as Member,
]

// Fresh QueryClient per test — avoids stale cache between tests
let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => client.clear())

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>
    <MemoryRouter>{children}</MemoryRouter>
  </QueryClientProvider>
)

beforeEach(() => {
  vi.mocked(membersApi.membersApi.list).mockResolvedValue(MEMBERS)
})

test('shows all members', async () => {
  render(<MembersPage />, { wrapper })
  expect(await screen.findByText('Alice')).toBeInTheDocument()
  expect(screen.getByText('Bob')).toBeInTheDocument()
})

test('search filters members', async () => {
  render(<MembersPage />, { wrapper })
  await screen.findByText('Alice')
  await userEvent.type(screen.getByPlaceholderText(/search/i), 'Ali')
  expect(screen.getByText('Alice')).toBeInTheDocument()
  expect(screen.queryByText('Bob')).not.toBeInTheDocument()
})

test('members are grouped by first letter', async () => {
  render(<MembersPage />, { wrapper })
  await screen.findByText('Alice')
  expect(screen.getByText('A')).toBeInTheDocument()
  expect(screen.getByText('B')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run MembersPage
```

- [ ] **Step 3: Create `MemberCard.tsx`**

```typescript
// src/components/MemberCard.tsx
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import type { Member } from '../types'
import styles from './MemberCard.module.css'

interface Props {
  member: Member
  isFronting?: boolean
  compact?: boolean
}

export default function MemberCard({ member, isFronting = false, compact = false }: Props) {
  return (
    <Link to={`/members/${member.id}`} className={compact ? styles.compact : styles.card}>
      {!compact && (
        <Avatar
          name={member.name}
          color={member.color}
          avatarPath={member.avatarPath ? `/api/media/${member.avatarPath}` : undefined}
          isFronting={isFronting}
          size="sm"
        />
      )}
      <div className={styles.text}>
        <span className={styles.name}>{member.name}</span>
        {!compact && member.pronouns && (
          <span className={styles.pronouns}>{member.pronouns}</span>
        )}
      </div>
    </Link>
  )
}
```

```css
/* src/components/MemberCard.module.css */
.card {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  min-height: var(--touch-min);
  transition: background 150ms;
}
.card:hover { background: var(--color-surface); }

.compact {
  display: flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  min-height: var(--touch-min);
}
.compact:hover { background: var(--color-surface); }

.text { display: flex; flex-direction: column; gap: 2px; }
.name { font-weight: 500; }
.pronouns { font-size: var(--text-xs); color: var(--color-muted); }
```

- [ ] **Step 4: Create `MembersPage.tsx`** (replaces stub)

```typescript
// src/pages/MembersPage.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { membersApi } from '../api/members'
import { frontApi } from '../api/front'
import { groupsApi } from '../api/groups'
import MemberCard from '../components/MemberCard'
import styles from './MembersPage.module.css'

type Mode = 'list' | 'folder'
type Density = 'card' | 'compact'

export default function MembersPage() {
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<Mode>('list')
  const [density, setDensity] = useState<Density>('card')

  const { data: members = [] } = useQuery({ queryKey: ['members'], queryFn: membersApi.list })
  const { data: fronters = [] } = useQuery({ queryKey: ['fronters'], queryFn: frontApi.getCurrent })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })

  const frontingIds = new Set(fronters.map(f => f.content.member))

  const visible = members
    .filter(m => !m.isArchived)
    .filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Group by first letter for list mode
  const grouped = visible.reduce<Record<string, typeof visible>>((acc, m) => {
    const key = m.name[0]?.toUpperCase() ?? '#'
    ;(acc[key] ??= []).push(m)
    return acc
  }, {})

  return (
    <main className={styles.page}>
      <input
        className={styles.search}
        placeholder="Search members…"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className={styles.toolbar}>
        <button
          className={[styles.toggle, mode === 'list' && styles.active].filter(Boolean).join(' ')}
          onClick={() => setMode('list')}
        >List</button>
        <button
          className={[styles.toggle, mode === 'folder' && styles.active].filter(Boolean).join(' ')}
          onClick={() => setMode('folder')}
        >Folder</button>
        <span className={styles.spacer} />
        <button
          className={[styles.toggle, density === 'card' && styles.active].filter(Boolean).join(' ')}
          onClick={() => setDensity('card')}
        >Card</button>
        <button
          className={[styles.toggle, density === 'compact' && styles.active].filter(Boolean).join(' ')}
          onClick={() => setDensity('compact')}
        >Compact</button>
      </div>

      {mode === 'list' && Object.entries(grouped).map(([letter, ms]) => (
        <section key={letter}>
          <p className={styles.letterHeader}>{letter}</p>
          {ms.map(m => (
            <MemberCard
              key={m.id}
              member={m}
              isFronting={frontingIds.has(m.id)}
              compact={density === 'compact'}
            />
          ))}
        </section>
      ))}

      {mode === 'folder' && groups.map(g => (
        <details key={g.id} className={styles.folder}>
          <summary className={styles.folderHeader}>{g.content.name}</summary>
          {members
            .filter(m => g.content.members.includes(m.id) && !m.isArchived)
            .filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
            .map(m => (
              <MemberCard
                key={m.id}
                member={m}
                isFronting={frontingIds.has(m.id)}
                compact={density === 'compact'}
              />
            ))}
        </details>
      ))}
    </main>
  )
}
```

```css
/* src/pages/MembersPage.module.css */
.page { padding: var(--space-4); padding-bottom: calc(var(--touch-min) + var(--space-8)); }

.search {
  width: 100%;
  min-height: var(--touch-min);
  padding: 0 var(--space-4);
  background: var(--color-surface);
  border: 1px solid #333;
  border-radius: var(--radius-lg);
  color: var(--color-text);
  font-size: var(--text-base);
  margin-bottom: var(--space-3);
}
.search:focus { outline: 2px solid var(--color-primary); outline-offset: 2px; }

.toolbar { display: flex; gap: var(--space-2); margin-bottom: var(--space-4); flex-wrap: wrap; }
.spacer { flex: 1; }
.toggle {
  padding: 0 var(--space-3);
  min-height: 36px;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--color-muted);
  background: var(--color-surface);
}
.active { color: var(--color-primary); }

.letterHeader {
  font-size: var(--text-xs);
  color: var(--color-muted);
  padding: var(--space-2) var(--space-4) 0;
  position: sticky;
  top: 0;
  background: var(--color-bg);
}

.folder { margin-bottom: var(--space-3); }
.folderHeader {
  list-style: none;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  font-weight: 500;
  min-height: var(--touch-min);
  display: flex;
  align-items: center;
  cursor: pointer;
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run MembersPage
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add src/PluralHost.Web/src/components/MemberCard.tsx \
        src/PluralHost.Web/src/components/MemberCard.module.css \
        src/PluralHost.Web/src/pages/MembersPage.tsx \
        src/PluralHost.Web/src/pages/MembersPage.module.css \
        src/PluralHost.Web/src/__tests__/MembersPage.test.tsx
git commit -m "feat: MembersPage with list/folder mode, alphabetical groups, density toggle, search"
```

---

## Task 11: Member Detail Page

**Files:**
- Create: `src/PluralHost.Web/src/components/TabBar.tsx` + `TabBar.module.css`
- Create: `src/PluralHost.Web/src/pages/MemberDetailPage.tsx` + `MemberDetailPage.module.css`
- Create: `src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/MemberDetailPage.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MemberDetailPage from '../pages/MemberDetailPage'
import * as membersApi from '../api/members'
import * as groupsApi from '../api/groups'
import type { Member } from '../types'

vi.mock('../api/members')
vi.mock('../api/groups', () => ({ groupsApi: { list: vi.fn().mockResolvedValue([]), setMemberships: vi.fn() } }))

const MEMBER: Member = {
  id: 'abc', name: 'Cypress', pronouns: 'they/them', color: '#b6ff00',
  privacyTier: 'Public', isArchived: false, isUntracked: false, isPinned: false,
  preventFrontNotification: false, receiveBoardNotifications: true,
  groupIds: [], parentIds: [], createdAt: '', updatedAt: '',
}

let client: QueryClient
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  vi.mocked(membersApi.membersApi.get).mockResolvedValue(MEMBER)
  vi.mocked(membersApi.membersApi.update).mockResolvedValue(MEMBER)
})
afterEach(() => client.clear())

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/members/abc']}>
      <Routes>
        <Route path="/members/:id" element={children} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>
)

test('shows Profile tab by default with member name', async () => {
  render(<MemberDetailPage />, { wrapper })
  expect(await screen.findByText('Cypress')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Profile' })).toHaveAttribute('aria-selected', 'true')
})

test('switches to Options tab on click', async () => {
  render(<MemberDetailPage />, { wrapper })
  await screen.findByText('Cypress')
  await userEvent.click(screen.getByRole('tab', { name: 'Options' }))
  expect(screen.getByRole('tab', { name: 'Options' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('Privacy Tier')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run MemberDetailPage
```

Expected: compile error (MemberDetailPage stub has no tabs).

- [ ] **Step 4: Create `TabBar.tsx`**

```typescript
// src/components/TabBar.tsx
import styles from './TabBar.module.css'

interface Tab { id: string; label: string }

interface Props {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
}

export default function TabBar({ tabs, active, onChange }: Props) {
  return (
    <div className={styles.bar} role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          className={[styles.tab, active === tab.id && styles.active].filter(Boolean).join(' ')}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
```

```css
/* src/components/TabBar.module.css */
.bar {
  display: flex;
  border-bottom: 1px solid #2a2a2a;
  margin-bottom: var(--space-4);
}
.tab {
  flex: 1;
  justify-content: center;
  min-height: var(--touch-min);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-muted);
  border-bottom: 2px solid transparent;
  border-radius: 0;
  transition: color 150ms, border-color 150ms;
}
.active { color: var(--color-primary); border-bottom-color: var(--color-primary); }
.tab:hover { color: var(--color-text); }

@media (prefers-reduced-motion: reduce) {
  .tab { transition: none; }
}
```

- [ ] **Step 5: Create `MemberDetailPage.tsx`** (replaces stub)

```typescript
// src/pages/MemberDetailPage.tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi } from '../api/members'
import { groupsApi } from '../api/groups'
import Avatar from '../components/Avatar'
import TabBar from '../components/TabBar'
import type { MemberUpdatePayload, PrivacyTier } from '../types'
import styles from './MemberDetailPage.module.css'

const TABS = [{ id: 'profile', label: 'Profile' }, { id: 'options', label: 'Options' }]
const TIERS: PrivacyTier[] = ['Public', 'Friend', 'Trusted', 'Private']

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>()
  const qc = useQueryClient()
  const [tab, setTab] = useState('profile')

  const { data: member } = useQuery({
    queryKey: ['member', id],
    queryFn: () => membersApi.get(id!),
    enabled: !!id,
  })

  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })

  const mutation = useMutation({
    mutationFn: (payload: MemberUpdatePayload) => membersApi.update(id!, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] })
      qc.invalidateQueries({ queryKey: ['members'] })
    },
  })

  if (!member) return <main className={styles.page}><p>Loading…</p></main>

  const memberGroups = groups.filter(g => g.content.members.includes(member.id))

  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <Avatar
          name={member.name}
          color={member.color}
          avatarPath={member.avatarPath ? `/api/media/${member.avatarPath}` : undefined}
          size="lg"
        />
        <div>
          <h1 className={styles.name}>{member.name}</h1>
          {member.pronouns && <p className={styles.pronouns}>{member.pronouns}</p>}
        </div>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'profile' && (
        <ProfileTab
          member={member}
          onSave={payload => mutation.mutate(payload)}
          groups={groups}
          memberGroups={memberGroups.map(g => g.id)}
        />
      )}

      {tab === 'options' && (
        <OptionsTab
          member={member}
          onSave={payload => mutation.mutate(payload)}
        />
      )}
    </main>
  )
}

// ── Profile Tab ──────────────────────────────────────────────────────────────
function ProfileTab({ member, onSave, groups, memberGroups }: {
  member: ReturnType<typeof useQuery<any>>['data'] & any
  onSave: (p: MemberUpdatePayload) => void
  groups: any[]
  memberGroups: string[]
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  function startEdit(field: string, value: string) {
    setEditing(field)
    setDraft(value)
  }

  function save(field: string) {
    onSave({ [field]: draft })
    setEditing(null)
  }

  const fields: Array<{ key: keyof MemberUpdatePayload; label: string; multiline?: boolean }> = [
    { key: 'name', label: 'Name' },
    { key: 'pronouns', label: 'Pronouns' },
    { key: 'description', label: 'Description', multiline: true },
  ]

  return (
    <div className={styles.section}>
      {fields.map(f => (
        <div key={f.key} className={styles.field}>
          <label className={styles.fieldLabel}>{f.label}</label>
          {editing === f.key ? (
            <div className={styles.editRow}>
              {f.multiline
                ? <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    className={styles.textarea}
                    autoFocus
                  />
                : <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    className={styles.input}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && save(f.key)}
                  />
              }
              <button className={styles.saveBtn} onClick={() => save(f.key)}>Save</button>
              <button className={styles.cancelBtn} onClick={() => setEditing(null)}>Cancel</button>
            </div>
          ) : (
            <p
              className={styles.fieldValue}
              onClick={() => startEdit(f.key, (member[f.key] as string) ?? '')}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && startEdit(f.key, (member[f.key] as string) ?? '')}
            >
              {(member[f.key] as string) || <span className={styles.muted}>Tap to edit</span>}
            </p>
          )}
        </div>
      ))}

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Color</label>
        <input
          type="color"
          value={member.color ?? '#888888'}
          onChange={e => onSave({ color: e.target.value })}
          className={styles.colorInput}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.fieldLabel}>Groups</label>
        <div className={styles.chips}>
          {groups.map(g => {
            const active = memberGroups.includes(g.id)
            return (
              <button
                key={g.id}
                className={[styles.chip, active && styles.chipActive].filter(Boolean).join(' ')}
                onClick={() => {
                  const next = active
                    ? memberGroups.filter(id => id !== g.id)
                    : [...memberGroups, g.id]
                  groupsApi.setMemberships(member.id, next)
                }}
              >
                {g.content.name}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Options Tab ──────────────────────────────────────────────────────────────
function OptionsTab({ member, onSave }: {
  member: any
  onSave: (p: MemberUpdatePayload) => void
}) {
  return (
    <div className={styles.section}>
      <div className={styles.field}>
        <label className={styles.fieldLabel}>Privacy Tier</label>
        <div className={styles.segmented}>
          {TIERS.map(tier => (
            <button
              key={tier}
              className={[styles.seg, member.privacyTier === tier && styles.segActive].filter(Boolean).join(' ')}
              onClick={() => onSave({ privacyTier: tier })}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>

      {([
        { key: 'isArchived', label: 'Archived' },
        { key: 'preventFrontNotification', label: 'Prevent front notifications' },
        { key: 'receiveBoardNotifications', label: 'Receive board notifications' },
      ] as const).map(({ key, label }) => (
        <div key={key} className={styles.toggle}>
          <span>{label}</span>
          <button
            role="switch"
            aria-checked={member[key]}
            className={[styles.switchBtn, member[key] && styles.switchOn].filter(Boolean).join(' ')}
            onClick={() => onSave({ [key]: !member[key] })}
          >
            <span className={styles.switchThumb} />
          </button>
        </div>
      ))}
    </div>
  )
}
```

```css
/* src/pages/MemberDetailPage.module.css */
.page { padding: var(--space-4); padding-bottom: calc(var(--touch-min) + var(--space-8)); }

.hero { display: flex; align-items: center; gap: var(--space-4); margin-bottom: var(--space-6); }
.name { font-size: var(--text-xl); font-weight: 600; }
.pronouns { font-size: var(--text-sm); color: var(--color-muted); }

.section { display: flex; flex-direction: column; gap: var(--space-5); }
.field { display: flex; flex-direction: column; gap: var(--space-2); }
.fieldLabel { font-size: var(--text-xs); color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.05em; }

.fieldValue {
  min-height: var(--touch-min);
  display: flex;
  align-items: center;
  padding: 0 var(--space-3);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  cursor: pointer;
}
.fieldValue:hover { opacity: 0.8; }
.muted { color: var(--color-muted); }

.editRow { display: flex; gap: var(--space-2); align-items: flex-start; }
.input, .textarea {
  flex: 1;
  min-height: var(--touch-min);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: var(--text-base);
}
.textarea { min-height: 100px; resize: vertical; }
.saveBtn { background: var(--color-primary); color: #121212; font-weight: 600; padding: 0 var(--space-4); border-radius: var(--radius-md); min-height: var(--touch-min); }
.cancelBtn { background: var(--color-surface); color: var(--color-muted); padding: 0 var(--space-4); border-radius: var(--radius-md); min-height: var(--touch-min); }

.colorInput { width: 44px; height: 44px; border: none; background: none; cursor: pointer; padding: 0; border-radius: var(--radius-sm); }

.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { padding: 0 var(--space-3); min-height: 36px; border-radius: var(--radius-full); background: var(--color-surface); color: var(--color-muted); font-size: var(--text-sm); }
.chipActive { background: var(--color-primary); color: #121212; }

.segmented { display: flex; gap: 2px; background: var(--color-surface); border-radius: var(--radius-md); padding: 2px; }
.seg { flex: 1; justify-content: center; min-height: 36px; border-radius: calc(var(--radius-md) - 2px); font-size: var(--text-sm); color: var(--color-muted); }
.segActive { background: var(--color-purple); color: #fff; }

.toggle { display: flex; align-items: center; justify-content: space-between; min-height: var(--touch-min); }
.switchBtn { width: 48px; height: 28px; border-radius: var(--radius-full); background: #333; position: relative; transition: background 150ms; flex-shrink: 0; }
.switchOn { background: var(--color-primary); }
.switchThumb {
  position: absolute;
  top: 3px; left: 3px;
  width: 22px; height: 22px;
  border-radius: var(--radius-full);
  background: #fff;
  transition: transform 150ms;
}
.switchOn .switchThumb { transform: translateX(20px); }

@media (prefers-reduced-motion: reduce) {
  .switchBtn, .switchThumb { transition: none; }
}
```

- [ ] **Step 6: Run tests**

```bash
npx vitest run MemberDetailPage
```

Expected: 2 passing.

- [ ] **Step 7: Commit**

```bash
git add src/PluralHost.Web/src/components/TabBar.tsx \
        src/PluralHost.Web/src/components/TabBar.module.css \
        src/PluralHost.Web/src/pages/MemberDetailPage.tsx \
        src/PluralHost.Web/src/pages/MemberDetailPage.module.css \
        src/PluralHost.Web/src/__tests__/MemberDetailPage.test.tsx
git commit -m "feat: MemberDetailPage with Profile and Options tabs, inline editing"
```

---

## Task 12: Settings Page

**Files:**
- Create: `src/PluralHost.Web/src/pages/SettingsPage.tsx` + `SettingsPage.module.css`
- Create: `src/PluralHost.Web/src/__tests__/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// src/__tests__/SettingsPage.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SettingsPage from '../pages/SettingsPage'
import * as authApi from '../api/auth'
import { AuthContext } from '../context/AuthContext'

vi.mock('../api/auth')

const mockSetAuthenticated = vi.fn()
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <AuthContext.Provider value={{ isAuthenticated: true, setAuthenticated: mockSetAuthenticated }}>
      <MemoryRouter>{children}</MemoryRouter>
    </AuthContext.Provider>
  </QueryClientProvider>
)

test('calls logout API and clears auth on button click', async () => {
  vi.mocked(authApi.authApi.logout).mockResolvedValue(undefined)
  render(<SettingsPage />, { wrapper })
  await userEvent.click(screen.getByRole('button', { name: /log out/i }))
  expect(authApi.authApi.logout).toHaveBeenCalledOnce()
  expect(mockSetAuthenticated).toHaveBeenCalledWith(false)
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run SettingsPage
```

- [ ] **Step 3: Create `SettingsPage.tsx`** (replaces stub)

```typescript
// src/pages/SettingsPage.tsx
import { useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import { useAuth } from '../context/AuthContext'
import styles from './SettingsPage.module.css'

export default function SettingsPage() {
  const { setAuthenticated } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await authApi.logout()
    setAuthenticated(false)
    navigate('/login', { replace: true })
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>Settings</h1>
      <button className={styles.logoutBtn} onClick={handleLogout}>
        Log out
      </button>
    </main>
  )
}
```

```css
/* src/pages/SettingsPage.module.css */
.page { padding: var(--space-4); padding-bottom: calc(var(--touch-min) + var(--space-8)); }
.heading { font-size: var(--text-xl); font-weight: 600; margin-bottom: var(--space-6); }
.logoutBtn {
  background: var(--color-pink);
  color: #fff;
  font-weight: 600;
  padding: 0 var(--space-6);
  min-height: var(--touch-min);
  border-radius: var(--radius-md);
}
```

- [ ] **Step 4: Run all frontend tests**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/PluralHost.Web/src/pages/SettingsPage.tsx \
        src/PluralHost.Web/src/pages/SettingsPage.module.css \
        src/PluralHost.Web/src/__tests__/SettingsPage.test.tsx
git commit -m "feat: SettingsPage with logout"
```

---

## Task 13: PWA Manifest + Icons + Install Lucide Icons

**Files:**
- Create: `src/PluralHost.Web/public/manifest.json`
- Create: `src/PluralHost.Web/public/icon-192.svg`
- Create: `src/PluralHost.Web/public/icon-512.svg`
- Modify: `src/PluralHost.Web/src/components/BottomNav.tsx` — swap placeholder chars for Lucide icons
- Modify: `src/PluralHost.Web/index.html` — link manifest

- [ ] **Step 1: Install Lucide**

```bash
cd src/PluralHost.Web && npm install lucide-react
```

- [ ] **Step 2: Update `BottomNav.tsx` with Lucide icons**

Replace the placeholder `icon` strings and the `span.icon` with actual SVG components:

Replace the full `BottomNav.tsx` content:

```typescript
// src/components/BottomNav.tsx
import { NavLink } from 'react-router-dom'
import { Radio, Users, Clock, Settings } from 'lucide-react'
import styles from './BottomNav.module.css'

const TABS = [
  { to: '/front',    label: 'Front',    Icon: Radio },
  { to: '/members',  label: 'Members',  Icon: Users },
  { to: '/history',  label: 'History',  Icon: Clock },
  { to: '/settings', label: 'Settings', Icon: Settings },
]

export default function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {TABS.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            [styles.tab, isActive && styles.active].filter(Boolean).join(' ')
          }
        >
          <Icon size={20} aria-hidden="true" />
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Create `public/manifest.json`**

```json
{
  "name": "Plural-Host",
  "short_name": "Plural-Host",
  "description": "Self-hosted system management for DID/OSDD",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#121212",
  "theme_color": "#b6ff00",
  "icons": [
    { "src": "/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml" },
    { "src": "/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml" }
  ]
}
```

- [ ] **Step 4: Create `public/icon-192.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="192" height="192">
  <rect width="192" height="192" rx="32" fill="#121212"/>
  <circle cx="96" cy="96" r="48" fill="none" stroke="#b6ff00" stroke-width="8"/>
  <circle cx="96" cy="96" r="16" fill="#b6ff00"/>
</svg>
```

- [ ] **Step 5: Create `public/icon-512.svg`** (same, different viewBox)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="80" fill="#121212"/>
  <circle cx="256" cy="256" r="128" fill="none" stroke="#b6ff00" stroke-width="20"/>
  <circle cx="256" cy="256" r="42" fill="#b6ff00"/>
</svg>
```

- [ ] **Step 6: Link manifest in `index.html`**

Add inside `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#b6ff00" />
```

- [ ] **Step 7: Build to verify PWA config**

```bash
npm run build
```

Expected: build succeeds, `dist/` contains service worker files from vite-plugin-pwa.

- [ ] **Step 8: Commit**

```bash
git add src/PluralHost.Web/public/ \
        src/PluralHost.Web/index.html \
        src/PluralHost.Web/src/components/BottomNav.tsx
git commit -m "feat: PWA manifest, icons, Lucide icons in BottomNav"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd /path/to/repo && dotnet test -v minimal
```

Expected: all tests pass (232+).

- [ ] **Step 2: Run all frontend tests**

```bash
cd src/PluralHost.Web && npx vitest run
```

Expected: all tests pass (Avatar ×4, FrontCard ×4, MembersPage ×3, routing ×2, SettingsPage ×1 = 14 minimum).

- [ ] **Step 3: Start both servers and smoke test**

```bash
# Terminal 1 — API
cd src/PluralHost.Api && dotnet run

# Terminal 2 — Frontend
cd src/PluralHost.Web && npm run dev
```

Manual checklist:
- [ ] `http://localhost:5173/front` redirects to `/login`
- [ ] Login with correct password → lands on `/front`, cookie set
- [ ] Bottom nav tabs navigate correctly
- [ ] Current fronters appear on `/front`
- [ ] Add Fronter picker opens and adds a member
- [ ] Remove fronter works
- [ ] `/members` search filters correctly
- [ ] List/Folder/Card/Compact toggles work
- [ ] `/members/:id` Profile tab inline edit saves
- [ ] `/members/:id` Options tab privacy tier and toggles save
- [ ] Settings → Log out clears cookie and returns to `/login`
- [ ] Resize to 375px — no horizontal scroll, all touch targets reachable

- [ ] **Step 4: Final commit**

```bash
git add -p  # stage any remaining changes
git commit -m "feat: Plan 5 complete — PWA shell, cookie auth, member management UI"
```
