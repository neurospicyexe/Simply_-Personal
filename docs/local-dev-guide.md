# Running Plural-Host Locally

No frontend yet — this is a JSON API. You'll interact with it through a REST client.

---

## 1. Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8)
- A REST client — recommend **[Bruno](https://www.usebruno.com/)** (free, offline, Git-friendly) or Postman

---

## 2. Start the API

```bash
cd C:\dev\simply-personal
cd src/PluralHost.Api
dotnet run
```

The API starts at: **`http://localhost:5179`**

The SQLite database (`pluralhost.db`) is created automatically on first run. No migration step needed — EF Core applies it at startup.

---

## 3. First-Time Setup (one-time only)

The database starts with no password. Before you can log in, set one:

```http
POST http://localhost:5179/api/auth/setup 
Content-Type: application/json

{
  "password": your-password-here""
}
```

- Minimum 8 characters
- Only works once — returns `409 Conflict` if a password is already set
- No Gatekeeper PIN is set by default (needed for destructive actions later)

---

## 4. Log In — Get Your JWT

```http
POST http://localhost:5179/api/auth/login
Content-Type: application/json

{
  "password": "your-password-here"
}
```

Response:
```json
{ "token": "eyJhbGci..." }
```

Copy that token. Every owner-side request needs it as a header:

```
Authorization: Bearer eyJhbGci...
```

JWTs expire after **24 hours** (configurable in `appsettings.json` → `Jwt:ExpiryHours`).

---

## 5. Try It Out — Quick Smoke Test

All these require the `Authorization: Bearer <token>` header.

### Create a member
```http
POST http://localhost:5179/api/members
Content-Type: application/json
Authorization: Bearer <token>

{
  "name": "Ember",
  "displayName": null,
  "pronouns": "she/her",
  "color": "#ff6b6b",
  "privacyTier": 0
}
```
`privacyTier`: 0=Public, 1=Friend, 2=Trusted, 3=Private

### List members
```http
GET http://localhost:5179/api/members
Authorization: Bearer <token>
```

### Create a share token
```http
POST http://localhost:5179/api/tokens
Content-Type: application/json
Authorization: Bearer <token>

{
  "label": "Friends link",
  "permission": 2,
  "expiresAt": null,
  "allowsBoardPosting": true
}
```
`permission`: 0=ReadFrontOnly, 1=Public, 2=Friend, 3=Trusted

### Use a share token (no auth needed)
```http
GET http://localhost:5179/share/<token-value>
```

### Write a journal entry
```http
POST http://localhost:5179/api/journals
Content-Type: application/json
Authorization: Bearer <token>

{
  "title": "First entry",
  "content": "Something happened today.",
  "isPrivate": false
}
```

### Freeze the system (Ghost Mode — no auth needed, crisis endpoint)
```http
POST http://localhost:5179/api/secure/freeze
Content-Type: application/json

{
  "durationHours": 1
}
```

---

## 6. Set a Gatekeeper PIN (needed for deletes)

Destructive actions (deleting members, tokens, etc.) require a separate PIN:

```http
POST http://localhost:5179/api/auth/change-password
Content-Type: application/json
Authorization: Bearer <token>

{
  "currentPassword": "your-password",
  "newPassword": "your-new-password"
}
```

The Gatekeeper PIN is set separately — check `SecureActionController` for the endpoint.

---

## 7. Bruno Collection (recommended setup)

Create a Bruno collection with an environment variable `base_url = http://localhost:5179` and `token = <paste after login>`. This lets you reuse the JWT across all requests without copy-pasting.

---

## 8. Docker (optional alternative)

If you'd rather not install .NET:

```bash
cd C:\dev\simply-personal
docker compose build
docker compose up -d
```

API available at **`http://localhost:8080`**. The SQLite database persists in `./data/`.

```bash
docker compose down   # stop
```

---

## What's Not Here Yet

- **No web UI** — that's Plan 5 (React PWA + mind map)
- **No file uploads** — avatar/media upload endpoint is planned
- **No import tool** — SP/PluralKit import is Plan 4
