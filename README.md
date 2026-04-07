# VHDH F&B Guide — Deployment Guide

## What you're deploying
- **Team chat** → `https://vhdh-fb-guide.vercel.app` (share this with your team)
- **Admin panel** → `https://vhdh-fb-guide.vercel.app/admin` (only you use this)

---

## Step 1 — Create a GitHub repository

1. Go to https://github.com and sign in
2. Click the **+** icon (top right) → **New repository**
3. Name it: `vhdh-fb-guide`
4. Set to **Private**
5. Click **Create repository**
6. On the next page, click **uploading an existing file**
7. Upload ALL the files from this folder (maintaining the folder structure):
   - `package.json`
   - `vercel.json`
   - `public/index.html`
   - `public/admin.html`
   - `api/auth.js`
   - `api/kb.js`
   - `api/ask.js`
8. Click **Commit changes**

---

## Step 2 — Deploy to Vercel

1. Go to https://vercel.com and sign in with your GitHub account
2. Click **Add New → Project**
3. Find and select your `vhdh-fb-guide` repository → click **Import**
4. Leave all settings as default
5. Click **Deploy** — wait about 60 seconds

---

## Step 3 — Set up Vercel KV (database)

This stores your knowledge base so it persists and syncs across devices.

1. In your Vercel project dashboard, click the **Storage** tab
2. Click **Create Database** → select **KV**
3. Name it `vhdh-kb` → click **Create**
4. Click **Connect Project** → select your `vhdh-fb-guide` project → **Connect**
5. Done — Vercel automatically adds the required environment variables

---

## Step 4 — Add your environment variables

1. In your Vercel project, go to **Settings → Environment Variables**
2. Add these two variables:

| Name | Value |
|------|-------|
| `ADMIN_PASSWORD` | Choose a strong password (you'll use this to log into /admin) |
| `ANTHROPIC_API_KEY` | Your Anthropic API key from https://console.anthropic.com |

3. Click **Save** for each one
4. Go to **Deployments** → click the three dots on your latest deployment → **Redeploy**

---

## Step 5 — Set your custom URL (optional)

1. In Vercel project settings → **Domains**
2. Your default URL will be something like `vhdh-fb-guide.vercel.app`
3. You can customise the subdomain prefix here if you like

---

## Step 6 — You're live

- **Your admin URL:** `https://vhdh-fb-guide.vercel.app/admin`
- **Team URL to share:** `https://vhdh-fb-guide.vercel.app`

Log into admin, add your handover notes, hit **Save & sync to team**.
Send your team the main URL — they open it and start asking questions.

You can update the knowledge base anytime — changes sync immediately.

---

## Getting your Anthropic API key

1. Go to https://console.anthropic.com
2. Sign up or log in
3. Go to **API Keys** → **Create Key**
4. Copy the key and paste it into Vercel as `ANTHROPIC_API_KEY`
5. Note: API usage has a small cost (~$0.01–0.05 per day for light team use)
