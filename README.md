# Plural-Host

A private, self-hosted management tool for plural systems. Built as a replacement for Simply Plural, with stronger privacy controls, crisis management features, and a design that actually feels like yours.

**This tool is for you — it runs on your own computer or server, not someone else's cloud. Your data never leaves your hands.**

---

## Table of Contents

- [What does it do?](#what-does-it-do)
- [What do I need?](#what-do-i-need)
- [Option A: Run it on your home computer](#option-a-run-it-on-your-home-computer)
- [Option B: Run it on a VPS (accessible from anywhere)](#option-b-run-it-on-a-vps-accessible-from-anywhere)
- [First-time setup](#first-time-setup)
- [Using Plural-Host](#using-plural-host)
- [Keeping your data safe](#keeping-your-data-safe)
- [Troubleshooting](#troubleshooting)

---

## What does it do?

- Track who is fronting, with a full front history and heatmap
- Manage system members — profiles, photos, custom fields, notes, connections
- Group members and set privacy tiers for each one
- Share a limited view with trusted people using share links (you control exactly what they can see)
- Ghost Mode — instantly hide everything in a crisis, with auto-unfreeze timer
- Gatekeeper PIN — a second password required before anything gets deleted
- Import your existing data from Simply Plural or PluralKit

---

## What do I need?

### Option A — Home computer

You need two free programs:

| Program | What it's for | Download |
|---------|--------------|----------|
| **Docker Desktop** | Runs the backend (the part that stores your data) | https://www.docker.com/products/docker-desktop/ |
| **Node.js** (LTS version) | Runs the frontend (the part you see in your browser) | https://nodejs.org/en/download |

You also need the Plural-Host files. You can either:
- Download the ZIP from GitHub → click the green **Code** button → **Download ZIP** → unzip it somewhere easy to find (like your Desktop or Documents)
- Or use Git if you know how

### Option B — VPS

You need:
- A VPS (virtual private server) running Ubuntu 22.04 or 24.04
- SSH access to it
- A domain name pointed at your server's IP address (optional but strongly recommended for HTTPS)

---

## Option A: Run it on your home computer

### Step 1 — Install Docker Desktop

1. Download Docker Desktop from https://www.docker.com/products/docker-desktop/
2. Run the installer. On Windows, it may ask you to restart.
3. Open Docker Desktop. Wait for it to say **"Engine running"** in the bottom left.
   - You don't need to sign in or create an account.

### Step 2 — Install Node.js

1. Download the **LTS** version from https://nodejs.org/en/download
2. Run the installer. Leave all options at their defaults.
3. Restart your computer after it finishes.

### Step 3 — Open a terminal

- **Windows:** Press `Win + R`, type `cmd`, press Enter. Or search "Command Prompt" in the Start menu.
- **Mac:** Search "Terminal" in Spotlight (Cmd + Space).
- **Linux:** You already know where it is.

### Step 4 — Navigate to the Plural-Host folder

In the terminal, type:

```
cd path\to\your\folder
```

Replace `path\to\your\folder` with the actual location. For example, if you unzipped it to your Desktop:

- Windows: `cd C:\Users\YourName\Desktop\Simply_-Personal`
- Mac/Linux: `cd ~/Desktop/Simply_-Personal`

### Step 5 — Create your secret key file

The app needs a secret key to keep your login secure. You create this once.

1. In your terminal, run this to create the file:

   **Windows:**
   ```
   copy NUL .env
   ```
   **Mac/Linux:**
   ```
   touch .env
   ```

2. Open the `.env` file in Notepad (or any text editor). It will be in the same folder as the Plural-Host files.

3. Paste this in and replace `change-this-to-something-random` with any long random string of letters and numbers (like a password you make up — 30+ characters is good, you won't need to remember it):

   ```
   JWT_SIGNING_KEY=change-this-to-something-random
   ```

   Example of a good key: `JWT_SIGNING_KEY=xK9mP2qL7vR4nT8wY1uB6cE3sA0jH5dF`

4. Save and close the file.

### Step 6 — Start the backend

In your terminal (in the Plural-Host folder), run:

```
docker compose up -d
```

Docker will download and build everything the first time — this takes a few minutes. You'll see a lot of text scroll by. That's normal.

When it's done, the backend is running at `http://localhost:8080`.

### Step 7 — Install frontend dependencies (first time only)

```
cd src\PluralHost.Web
npm install
```

This downloads the frontend code packages. Also takes a minute the first time.

### Step 8 — Start the frontend

```
npm run dev
```

You'll see something like `Local: http://localhost:5173`. Open that address in your browser.

### Step 9 — First-time login setup

See [First-time setup](#first-time-setup) below.

### Stopping and starting

**To stop:** In the terminal where the frontend is running, press `Ctrl + C`. Then run `docker compose down` from the Plural-Host folder.

**To start again:** Run `docker compose up -d` from the Plural-Host folder, then `cd src\PluralHost.Web && npm run dev`.

---

## Option B: Run it on a VPS (accessible from anywhere)

This setup makes Plural-Host available at your own domain from any device — phone, tablet, or computer.

**What you'll need:**
- A VPS running Ubuntu 22.04 or 24.04
- SSH access (the terminal command you use to connect to your server)
- A domain name (e.g. `plural.yourdomain.com`) pointed at your server's IP

### Step 1 — Connect to your VPS

Open a terminal and connect:

```
ssh your-username@your-server-ip
```

### Step 2 — Install Docker

Run these commands one at a time:

```
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in for the group change to take effect:
```
exit
ssh your-username@your-server-ip
```

### Step 3 — Install Node.js

```
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Step 4 — Get the Plural-Host files

```
git clone https://github.com/neurospicyexe/Simply_-Personal.git plural-host
cd plural-host
```

### Step 5 — Create your secret key

```
nano .env
```

Paste in (replacing the key with something long and random):

```
JWT_SIGNING_KEY=your-long-random-secret-key-here
```

Press `Ctrl + X`, then `Y`, then `Enter` to save.

### Step 6 — Build and start the backend

```
docker compose up -d --build
```

### Step 7 — Build the frontend

```
cd src/PluralHost.Web
npm install
npm run build
```

This creates a `dist/` folder with the built frontend files.

### Step 8 — Install Nginx

```
sudo apt-get install -y nginx
```

### Step 9 — Configure Nginx

```
sudo nano /etc/nginx/sites-available/plural-host
```

Paste in the following, replacing `plural.yourdomain.com` with your actual domain:

```nginx
server {
    listen 80;
    server_name plural.yourdomain.com;

    # Frontend (built React app)
    root /home/your-username/plural-host/src/PluralHost.Web/dist;
    index index.html;

    # API — proxy to the Docker backend
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /v1/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /secure_uploads/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
    }

    # All other routes go to the React app
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Save with `Ctrl + X`, `Y`, `Enter`.

Enable the site:

```
sudo ln -s /etc/nginx/sites-available/plural-host /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 10 — Set up HTTPS (strongly recommended)

```
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d plural.yourdomain.com
```

Follow the prompts. Certbot will handle HTTPS automatically. It renews itself.

### Step 11 — First-time login setup

Open your domain in a browser and follow [First-time setup](#first-time-setup) below.

### Keeping the frontend up to date after changes

When you pull new changes:

```
cd ~/plural-host
git pull
docker compose up -d --build
cd src/PluralHost.Web
npm install
npm run build
```

Nginx serves the built files automatically — no restart needed.

---

## First-time setup

When you first open Plural-Host in your browser, you'll need to set your login password.

### Set your password

The very first time, there is no password yet. You need to set one by making a request to the app. The easiest way is to use a free API tool like **Hoppscotch** (https://hoppscotch.io) or by running this command in your terminal:

**Windows (Command Prompt):**
```
curl -X POST http://localhost:8080/api/auth/setup -H "Content-Type: application/json" -d "{\"password\": \"your-password-here\"}"
```

**Mac/Linux/VPS:**
```
curl -X POST http://localhost:8080/api/auth/setup \
  -H "Content-Type: application/json" \
  -d '{"password": "your-password-here"}'
```

Replace `your-password-here` with the password you want to use. For VPS, replace `localhost:8080` with `https://plural.yourdomain.com`.

After that, you can log in at the Plural-Host URL using that password.

### Set up a Gatekeeper PIN (recommended)

The Gatekeeper PIN is a second password required before anything gets permanently deleted. Set it up in **Settings → Security → Gatekeeper PIN**.

---

## Using Plural-Host

### Bottom navigation

The app has five main sections accessible from the bar at the bottom:

| Icon | Section | What it's for |
|------|---------|--------------|
| Front | Front page | See who's currently fronting, log front changes |
| Members | Members | Your full system member list |
| History | Logs | Full front history and heatmap |
| System | System | Groups, privacy buckets, front statuses, share tokens |
| Settings | Settings | Password, Gatekeeper PIN, import data |

### Member profiles

Tap any member to open their profile. It has 7 tabs:

- **Essence** — Name, pronouns, description, avatar, background image, photos
- **Specs** — Custom fields (any information you want to track per member)
- **Dossier** — Private notes about a member
- **Comms** — Board messages (notes others can leave for a member)
- **Logs** — Front history for that member
- **Access** — Privacy tier, group membership, danger zone (delete)
- **Photos** — Photo album for the member

### Ghost Mode

Ghost Mode hides everything from anyone using a share link. To activate it instantly, go to **Settings** and tap the freeze button. You can set a timer so it unfreezes automatically.

To unfreeze, you need your Gatekeeper PIN.

### Share links

Share links let someone see a limited view of your system. You control exactly what they can see — just public members, or friends, or trusted members. Create and manage them in **System → Tokens**.

### Importing from Simply Plural or PluralKit

Go to **Settings → Import**. You can upload a Simply Plural JSON export, or connect with a PluralKit token to pull your data directly.

---

## Keeping your data safe

### Back up your data

Your data lives in two folders inside the Plural-Host directory:

- `data/` — your database (all members, notes, history, settings)
- `secure_uploads/` — all uploaded images (avatars, background images, photos)

**Back these two folders up regularly.** Copy them somewhere safe — an external drive, a separate cloud backup, etc.

To restore: replace the folders and restart with `docker compose up -d`.

### Updating Plural-Host

**Home computer:**
```
docker compose down
git pull
docker compose up -d --build
cd src/PluralHost.Web && npm install && npm run dev
```

**VPS:**
```
docker compose down
git pull
docker compose up -d --build
cd src/PluralHost.Web && npm install && npm run build
```

---

## Troubleshooting

**The page shows "Loading…" forever**
- Make sure Docker Desktop is open and the engine is running (green icon)
- Make sure you ran `docker compose up -d` from the Plural-Host folder
- Try visiting `http://localhost:8080/api/auth/status` in your browser — if you see a response, the backend is running

**"Connection refused" error**
- The backend isn't running. Run `docker compose up -d` from the Plural-Host folder.

**I forgot my password**
- There is currently no password reset. You would need to access the database directly or redeploy with a fresh database. Keep your password somewhere safe.

**Docker says "port already in use"**
- Something else on your computer is using port 8080. Edit `docker-compose.yml` and change `"8080:8080"` to `"8081:8080"`, then update the `vite.config.ts` proxy target to `http://localhost:8081`.

**I lost my JWT signing key**
- If you lose the `.env` file, everyone gets logged out (their tokens stop working). Set a new key in `.env` and restart. You won't lose any data.

**Images aren't showing up**
- Make sure you're logged in. All images are served through a secure endpoint that requires login — they won't load if your session has expired.

---

*Plural-Host is free and open source. It is built with care for the plural community.*
