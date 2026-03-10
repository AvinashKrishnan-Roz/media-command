# ⚡ Media Command Dashboard

Real-time Meta Ads performance dashboard for 7 media buyers across 4 BMs and 5 ad accounts each.

---

## 🚀 Deploy to Vercel (5 minutes)

### Step 1 — Push to GitHub
1. Go to [github.com](https://github.com) → New repository → name it `media-command`
2. Upload all these files (drag & drop the folder)
3. Click **Commit changes**

### Step 2 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) → Sign up with GitHub
2. Click **Add New → Project**
3. Import your `media-command` repository
4. Click **Deploy** (leave all settings as default)

### Step 3 — Add your Meta API Token (CRITICAL)
1. In Vercel, go to your project → **Settings → Environment Variables**
2. Add a new variable:
   - **Name:** `REACT_APP_META_TOKEN`
   - **Value:** *(your Meta Ads API token)*
3. Click **Save**
4. Go to **Deployments → Redeploy** to apply the token

Your dashboard is now live at `https://media-command.vercel.app` (or similar URL).

---

## 🔑 Getting a Meta API Token

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create an app (type: **Business**)
3. Add the **Marketing API** product
4. Go to **Tools → Graph API Explorer**
5. Generate a token with these permissions:
   - `ads_read`
   - `ads_management`
   - `business_management`
6. For long-lived tokens, use the Token Debugger to extend expiry

---

## 🔄 How It Works

- **With token:** Fetches live data from all your Meta ad accounts every 5 minutes
- **Without token:** Runs in demo mode with realistic mock data
- **Auto-refresh:** Every 5 minutes automatically, or hit the ↺ REFRESH button

---

## 📊 Features

- 7 media buyer cards with spend, ROAS, leads, CTR
- Drill into each buyer → see all 20 accounts
- Filter by Business Manager (BM Alpha / Beta / Gamma / Delta)
- Sort accounts by: Spend, ROAS, Leads, CTR, CPM, CPL
- Budget utilization bars (green → yellow → red)
- Color-coded ROAS: 🟢 ≥2x · 🟡 ≥1.2x · 🔴 <1.2x
