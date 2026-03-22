# Running Plural-Host Locally

Two pieces: the **.NET API** (backend) and the **React PWA** (frontend). Run both to use the UI.

---

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8) — for running the API directly
- [Node.js 18+](https://nodejs.org/) — for the frontend dev server
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) — optional, replaces .NET SDK for the API

---

## Quickstart (recommended)

### 1. Start the API

**Option A — Docker (no .NET install needed):**
```bash
cd C:\dev\simply-personal
docker compose up -d
```
API runs at `http://localhost:8080`. Database persists in `./data/`.

```bash
docker compose down   # stop
docker compose logs   # view logs
```

**Option B — dotnet run:**
```bash
cd C:\dev\simply-personal\src\PluralHost.Api
dotnet run
```
API runs at `http://localhost:8080` (or check the console for the exact port).

---

### 2. Start the frontend

```bash
cd C:\dev\simply-personal\src\PluralHost.Web
npm install        # first time only
npm run dev
```

Frontend runs at **`http://localhost:5173`**. It proxies all `/api` and `/v1` requests to the API automatically — no config needed.

---

### 3. First-time setup (one-time only)

The database starts with no password. Before you can log in, set one:

```http
POST http://localhost:8080/api/auth/setup
Content-Type: application/json

{
  "password": "your-password-here"
}
```

- Minimum 8 characters
- Only works once — returns `409 Conflict` if already set
- You can also do this through a REST client like **Bruno** or Postman

---

### 4. Log in

Open **`http://localhost:5173`** in your browser. Enter your password on the login screen.

That's it — you're in.

---

## Setting a Gatekeeper PIN

The Gatekeeper PIN is required for destructive actions (deleting members). Set it from the app:

**Settings → Security → Gatekeeper PIN → Set PIN**

Or via API:
```http
PUT http://localhost:8080/api/secure/pin
Content-Type: application/json
Authorization: Bearer <token>

{
  "newPin": "your-pin"
}
```

Minimum 4 characters. No current PIN needed when setting for the first time.

---

## Ghost Mode (emergency freeze)

Hides all member/front data instantly. No auth required — crisis endpoint:

```http
POST http://localhost:8080/api/secure/freeze
Content-Type: application/json

{
  "durationHours": 1
}
```

Unfreeze from **Settings** (requires Gatekeeper PIN).

---

## What works right now

- Login + password change + Gatekeeper PIN management
- Members list, search, create, edit, delete (PIN required)
- Avatar upload per member
- Front page (current fronters, 30s poll)
- Member detail — 6 tabs: Essence, Specs (custom fields), Dossier (notes), Comms (board), Logs, Access
- Settings — logout, security section
- Share tokens (access-controlled links for outsiders)
- Ghost Mode / Auto-unfreeze

---

## Useful commands

```bash
# Run backend tests
cd C:\dev\simply-personal
dotnet test

# Run frontend tests
cd C:\dev\simply-personal\src\PluralHost.Web
npx vitest run

# Add an EF Core migration (after changing domain models)
dotnet ef migrations add <Name> --project src/PluralHost.Api --output-dir Data/Migrations
dotnet ef database update --project src/PluralHost.Api
```
