# Inventory Search App — Setup Guide

This guide walks you through deploying the app from scratch. It takes about 20–30 minutes.

---

## What you'll need

- A GitHub account (you already have one)
- A Vercel account (free) — vercel.com
- A Mailgun account (free) — mailgun.com

---

## Step 1 — Put the code on GitHub

1. Go to github.com and click the **+** icon → **New repository**
2. Name it `inventory-search`, leave it **Private**, click **Create repository**
3. On your computer, open Terminal and run these commands one at a time:

```
cd path/to/inventory-app
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/inventory-search.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your actual GitHub username.

---

## Step 2 — Deploy to Vercel

1. Go to vercel.com and sign up (use "Continue with GitHub")
2. Click **Add New → Project**
3. Find your `inventory-search` repository and click **Import**
4. Leave all settings as default and click **Deploy**
5. Vercel will build and deploy the app. When it's done, you'll get a URL like `https://inventory-search-abc123.vercel.app`

---

## Step 3 — Add Blob storage

Vercel Blob is where the inventory data is stored between emails.

1. In your Vercel project, click the **Storage** tab
2. Click **Create Database → Blob**
3. Name it anything (e.g. `inventory-blob`) and click **Create**
4. Click **Connect to Project** and select your `inventory-search` project
5. That's it — Vercel automatically adds the storage token to your project

---

## Step 4 — Set up Mailgun

Mailgun gives your app an email address. When Cin7 sends the daily report to that address, Mailgun forwards the Excel attachment to your app.

### 4a — Create a Mailgun account

1. Go to mailgun.com and sign up for a free account
2. Verify your email address when prompted

### 4b — Get your inbound email address

1. In the Mailgun dashboard, go to **Receiving → Create Route** (or **Inbound Routes**)
2. Click **Add Inbound Route** (or similar — the UI varies slightly)
3. Set:
   - **Expression type:** Catch-all (or match `inventory@sandboxXXXXXX.mailgun.org`)
   - **Forward to URL:** `https://your-vercel-url.vercel.app/api/webhook`
     (replace with your actual Vercel URL from Step 2)
4. Save the route

Your inbound email address will be something like:
`inventory@sandboxXXXXXX.mailgun.org`

Make a note of it — you'll give this address to Cin7 in Step 6.

### 4c — Get your webhook signing key

1. In Mailgun, go to **Settings → Webhooks**
2. Copy the **HTTP webhook signing key** — it looks like `key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

---

## Step 5 — Add the signing key to Vercel

1. In your Vercel project, go to **Settings → Environment Variables**
2. Add a new variable:
   - **Name:** `MAILGUN_SIGNING_KEY`
   - **Value:** paste the signing key from Step 4c
3. Click **Save**
4. Go to **Deployments** and click **Redeploy** on the latest deployment so it picks up the new variable

---

## Step 6 — Update Cin7

Tell Cin7 to send the daily inventory report to your new Mailgun email address instead of (or in addition to) where it currently goes.

1. In Cin7, go to **Reports → Scheduled Reports**
2. Find your inventory report
3. Add (or change) the recipient email to your Mailgun address from Step 4b
4. Save

---

## Step 7 — Test it

The easiest way to test is to manually send the Excel file to your Mailgun address as an email attachment, or wait for the next scheduled Cin7 report.

Once an email arrives, visit your Vercel URL — the inventory should appear within seconds.

---

## Your app URL

Bookmark your Vercel URL and add it to your phone's home screen:
- On iPhone: open the URL in Safari → Share → **Add to Home Screen**
- On Android: open in Chrome → menu → **Add to Home Screen**

---

## Troubleshooting

**The app loads but shows "No report loaded yet"**
The app is working but hasn't received an email yet. Send a test email with the Excel attached.

**Search doesn't return results**
Make sure the email was received successfully. In Mailgun, go to **Logs** to see if the webhook was triggered.

**The webhook failed**
Check your Vercel logs: go to your project → **Functions** tab → click on `webhook` to see the error message.
