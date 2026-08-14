# LARYA Operational Dashboard - Complete Setup Guide

## Overview

**Purpose:** Weekly and monthly operational reports showing deal funnel progression, conversion rates, team performance, partner quality, and revenue forecasts.

**What You Get:**
- ✅ Weekly Report (Friday 9 AM SPT) - Funnel analysis for previous week
- ✅ Monthly Report (1st of month 9 AM SPT) - Full month funnel + rankings + forecasts
- ✅ Interactive Dashboard Widget - View any period's data
- ✅ Slack Integration - Auto-posts formatted reports to #sales
- ✅ Revenue Forecasting - Projects next month revenue based on current aprovados

**Key Metrics:**
- Lead Entrou → Reunião → Simulação Enviada → Aprovado → Vistoria → Emissão
- Conversion % at each stage
- By sales rep, by partner, by pipeline
- Revenue (based on valor do financiamento × 0.01)
- Forecast: Aprovados → Projected emissões next month

---

## Prerequisites

1. **HubSpot API Key** (with deal/contact read permissions)
2. **Slack Webhook URL** (for #sales channel)
3. **GitHub account** (to host code)
4. **Vercel account** (to deploy serverless functions)

---

## Step 1: Verify HubSpot Field Names

Before deployment, confirm these HubSpot fields exist on your Deals:

**Core Fields:**
- `dealname` ✓
- `pipeline` ✓
- `dealstage` ✓
- `hubspot_owner_id` ✓
- `createdate` ✓
- `amount` (optional)

**Financial Fields (for commission calc):**
- `valor_do_financiamento` OR `valor_do_emprestimo` (Script multiplies by 0.01)

**Partner Tracking:**
- `nome_de_parceiro` (partner name - primary source)
- `indicacao_parceiro` (partner indicator - fallback)
- `pipeline` value (e.g., "Parceiros - Indicações")

**Stage Dates (Optional but recommended):**
- `stage_lead_entrou_date`
- `stage_reuniao_date`
- `stage_simulacao_enviada_date`
- `stage_aprovado_date`
- `stage_vistoria_date`
- `stage_emissao_date`

If your field names differ, update them in `dashboard-data-queries.js` lines 18-28.

---

## Step 2: Create Slack Webhook (If Not Done)

1. Go to https://api.slack.com/apps
2. Click **"Create New App"** → **"From scratch"**
3. **App Name:** `LARYA Operational Dashboard`
4. **Workspace:** Select your workspace
5. Left sidebar → **"Incoming Webhooks"** → Toggle ON
6. Click **"Add New Webhook to Workspace"**
7. Select **#sales** channel → **Allow**
8. Copy the **Webhook URL**

Save for later (Step 5).

---

## Step 3: Get HubSpot API Key (If Not Done)

1. Log in to HubSpot
2. Settings (top right gear) → **Integrations** → **Private Apps**
3. Click **"Create private app"**
4. **Name:** `LARYA Dashboard`
5. **Scopes:** Enable
   - `crm.objects.deals.read`
   - `crm.objects.contacts.read`
6. Click **Create app**
7. Click **Show** next to "Access token"
8. Copy the token (starts with `pat_`)

Save for later (Step 5).

---

## Step 4: Prepare GitHub Repository

Create a new GitHub repo named `larya-operational-dashboard`.

Upload these files:

```
larya-operational-dashboard/
├── api/
│   ├── weekly.js                 (Vercel serverless function)
│   ├── monthly.js                (Vercel serverless function)
│   └── dashboard-data-queries.js (Shared data layer - move to root or lib/)
├── dashboard.html                (Interactive widget)
├── dashboard-data-queries.js     (Data queries module)
├── weekly-report-generator.js    (Weekly report builder)
├── monthly-report-generator.js   (Monthly report builder)
├── package.json
├── vercel.json
├── .gitignore
└── README.md
```

**Important:** Make sure the `require()` paths in the API files match your folder structure. Adjust as needed:

```javascript
// In api/weekly.js and api/monthly.js:
const DashboardData = require('../dashboard-data-queries');
const WeeklyReportGenerator = require('../weekly-report-generator');
// etc.
```

---

## Step 5: Deploy to Vercel

1. Go to https://vercel.com
2. Sign in or create account with GitHub
3. Click **"Add New"** → **"Project"**
4. Find and select your `larya-operational-dashboard` repository
5. Click **Import**

### Configure Environment Variables

After import, go to **Settings** → **Environment Variables**

Add two variables:

**Variable 1:**
- **Name:** `HUBSPOT_API_KEY`
- **Value:** `pat-na1-...` (your HubSpot token)
- **Environments:** Production, Preview, Development
- Click **Add**

**Variable 2:**
- **Name:** `SLACK_WEBHOOK_URL`
- **Value:** `https://hooks.slack.com/services/...` (your Slack webhook)
- **Environments:** Production, Preview, Development
- Click **Add**

### Redeploy

1. Go to **Deployments** tab
2. Find your latest deployment
3. Click **...** → **Redeploy**
4. Wait for deployment to complete

### Set Up Cron Jobs

1. Go to **Settings** → **Cron Jobs**
2. Click **"Create Cron Job"**

**Cron Job 1 (Weekly):**
- **Schedule:** `0 9 ? * FRI`
- **Timezone:** `America/Sao_Paulo`
- **Path:** `/api/weekly`
- Click **Save**

**Cron Job 2 (Monthly):**
- **Schedule:** `0 9 1 * ?`
- **Timezone:** `America/Sao_Paulo`
- **Path:** `/api/monthly`
- Click **Save**

### Dashboard URL

Your interactive dashboard is now available at:
```
https://your-project.vercel.app/
```
or
```
https://your-project.vercel.app/dashboard
```

---

## Step 6: Test

### Manual Test - Weekly Report

```bash
curl https://your-project.vercel.app/api/weekly
```

Should see:
```json
{
  "timestamp": "2026-08-15T14:30:00.000Z",
  "success": true,
  "message": "Weekly report posted to Slack"
}
```

Check #sales channel for report!

### Manual Test - Monthly Report

```bash
curl https://your-project.vercel.app/api/monthly
```

### Manual Test - Dashboard

Visit: `https://your-project.vercel.app/`

Should see interactive funnel with weekly/monthly toggle.

---

## Step 7: Verify Slack Messages

Check #sales channel:

**Weekly Report includes:**
- Funnel visualization (Lead Entrou → Meeting → Aprovado → Vistoria → Emissão)
- Conversion % at each stage
- By sales rep table (leads, meeting %, aprovado %, revenue)
- By partner table (leads, approval %, emissão %, revenue)
- Quick forecast

**Monthly Report includes:**
- Full month funnel with %
- Stage conversion rates
- Top performers by leads (top 5)
- Top performers by revenue (top 5)
- Partner quality rankings with ⭐ ratings
- Revenue forecast for next month

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Missing environment variables" | Verify API key and webhook URL added in Vercel Settings |
| "No data returned" | Check deals exist in HubSpot for the period; verify API scopes enabled |
| "Cron not running" | Verify cron path is exactly `/api/weekly` or `/api/monthly` |
| "Invalid HubSpot fields" | Check field names match in `dashboard-data-queries.js` properties object |
| "Slack post failed" | Verify webhook URL is still active; regenerate if needed |
| 500 error | Check Vercel logs: Deployments → Click → Logs tab |

---

## Customization

### Change Stage Names

Edit `dashboard-data-queries.js` line 20:

```javascript
this.stages = {
  'Lead Entrou': 'lead_entrou',
  'Reunião': 'reuniao',
  // Add/modify as needed
};
```

### Change Commission Calculation

Edit `dashboard-data-queries.js` `getCommissionForecast()` method (line ~115):

```javascript
getCommissionForecast(deal) {
  const valor = parseFloat(deal.properties.valor_do_financiamento || 0);
  return valor > 0 ? valor * 0.01 : 0;  // Change 0.01 to your commission %
}
```

### Change Forecast Conversion Rate

Edit `weekly-report-generator.js` and `monthly-report-generator.js`:

```javascript
const forecast = await this.dashboardData.calculateForecast(0.85);
// Change 0.85 (85%) to your historical Aprovado→Emissão conversion rate
```

### Modify Report Format

Edit the `buildXxxSection()` methods in:
- `weekly-report-generator.js`
- `monthly-report-generator.js`

### Customize Dashboard Widget

Edit `dashboard.html` - modify styles, layout, mock data, etc.

---

## Monitoring

### View Cron Executions

Vercel → **Settings** → **Cron Jobs** → Click job → View run history

### Check Logs

Vercel → **Deployments** → Latest deployment → **Logs** tab

Filter by function: `weekly` or `monthly`

### Manual Trigger

Vercel → **Settings** → **Cron Jobs** → Click job → **...** → **Trigger**

---

## Schedule Summary

| Report | Day | Time | Timezone |
|--------|-----|------|----------|
| Weekly | Friday | 9 AM | America/Sao_Paulo |
| Monthly | 1st of month | 9 AM | America/Sao_Paulo |
| Dashboard | Any time | Live | Any |

---

## What Data is Tracked

### By Stage
- Count of deals in each stage
- Total commission value
- % conversion to next stage

### By Sales Rep
- Total leads generated
- Leads by stage
- Conversion % at key stages
- Total revenue

### By Partner/Source
- Total leads
- Approval %
- Emissão %
- Revenue
- Quality score (⭐ based on emissão rate)

### Forecast
- Current aprovados count & value
- Projected emissões next month
- Projected revenue (based on historical conversion)

---

## FAQ

**Q: Why is it multiplying by 0.01?**  
A: This represents 1% commission on the deal amount. Adjust in code if your rate differs.

**Q: Can I change the reporting time?**  
A: Yes. Modify cron schedule in Vercel Settings or vercel.json. Use https://crontab.guru for reference.

**Q: Can I add more pipelines?**  
A: Yes, they auto-track. No code changes needed.

**Q: How far back does it report?**  
A: Weekly reports previous full week (Mon-Sun). Monthly reports previous calendar month.

**Q: Can I see real-time data?**  
A: Yes, visit the dashboard URL anytime for live HubSpot data.

**Q: What if partner field is empty?**  
A: Falls back to pipeline name or `hs_analytics_source`.

---

## Support

- HubSpot API: https://developers.hubspot.com/docs/api/overview
- Slack API: https://api.slack.com
- Vercel Docs: https://vercel.com/docs
- Cron Syntax: https://crontab.guru

---

## File Reference

| File | Purpose |
|------|---------|
| `dashboard-data-queries.js` | Core HubSpot query logic + funnel calc |
| `weekly-report-generator.js` | Formats weekly Slack message |
| `monthly-report-generator.js` | Formats monthly Slack message |
| `api/weekly.js` | Vercel endpoint for weekly report |
| `api/monthly.js` | Vercel endpoint for monthly report |
| `dashboard.html` | Interactive widget (static) |
| `vercel.json` | Cron job scheduling |
| `package.json` | Dependencies |

---

## Next Steps

1. ✅ Verify HubSpot fields
2. ✅ Create Slack webhook
3. ✅ Get HubSpot API key
4. ✅ Upload files to GitHub
5. ✅ Deploy to Vercel
6. ✅ Add environment variables
7. ✅ Configure cron jobs
8. ✅ Test
9. ✅ Monitor reports
