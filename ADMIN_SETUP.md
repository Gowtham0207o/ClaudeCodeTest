# JobSync Admin Setup & Testing Guide

## ✅ What's Been Configured

### 1. **Role Filtering** — FIXED
- Now strictly filters for **Software/Web/Full-Stack/Backend/Frontend Developer/Engineer** roles only
- Excludes: QA, Tester, Architect, DevOps, Platform, Infrastructure roles
- File: `web/lib/scrapers/index.ts`

### 2. **Application Submission** — ENABLED
- Changed `automation.live: true` to actually submit applications (was in dry-run mode)
- Applications will now be submitted to real job boards
- File: `web/lib/profile.ts`

### 3. **Apply Answers** — FILLED
- Phone, LinkedIn, GitHub, Portfolio URLs configured
- Work authorization, salary, location preferences set
- Applications can now be auto-filled and submitted
- File: `web/lib/profile.ts`

### 4. **CRON_SECRET** — SET
- Set in `web/.env.local` for securing the daily batch endpoint
- Allows `/api/cron/daily-batch` to be called with authorization

### 5. **Admin Testing Endpoints** — CREATED
- `GET /api/admin/test` — Test scraping & matching
- `GET /api/admin/status` — System health dashboard
- `POST /api/admin/run-batch` — Manual trigger batch (with dryRun option)
- `GET /api/admin/run/{id}` — Check run progress

---

## 🚀 How to Test

### Step 1: Start the development server
```bash
cd web
npm install playwright
npx playwright install chromium
npm run dev
```

### Step 2: Test scraping & matching
```bash
curl http://localhost:3000/api/admin/test
```
Expected: Shows jobs scraped and matches scoring

### Step 3: Check system status
```bash
curl http://localhost:3000/api/admin/status
```
Expected: Shows total jobs, applications, and automation config

### Step 4: Run a dry-run batch (safe test)
```bash
curl -X POST http://localhost:3000/api/admin/run-batch \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true, "quota": 3}'
```
Response includes `runId`. Use it to check progress:

```bash
curl http://localhost:3000/api/admin/run/{runId}
```

### Step 5: Run a LIVE batch (actual applications)
⚠️ **Only after verifying dry-run works!**
```bash
curl -X POST http://localhost:3000/api/admin/run-batch \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false, "quota": 5}'
```

---

## 📋 Critical Configuration

### Playwright (browser automation)
✅ Already installed in `web/package.json`
- If not installed: `npm i playwright && npx playwright install chromium`
- This is **required** for form-filling and applications

### Firebase
✅ Configured in `web/.env.local`
- Service account: Active
- Collections: `jobs`, `applications`, `runs`

### LinkedIn/Indeed Applications
⚠️ Not recommended for scraping (ToS violation)
- System uses `remoteok`, `remotive`, `arbeitnow`, `jobicy`, `themuse` instead
- These are free, ToS-friendly APIs
- If you need LinkedIn/Indeed: use their official partner APIs

### Tectonic LaTeX Compiler
- Path set: `C:/Users/Gowtham/Claude Vs Setup/web/tools/tectonic.exe`
- Used for per-job resume PDF generation
- Verify: `tectonic --version`

### Anthropic API (Optional)
- Set in `web/.env.local` if you have a key
- If empty: system falls back to deterministic resume tailoring (still works)

---

## 🎯 Current Profile

**Name:** Gowtham Ravi  
**Title:** Full Stack Engineer  
**Experience:** 4 years  
**Location:** Bengaluru, India  
**Remote:** Flexible (not remote-only)

**Skills:** TypeScript, JavaScript, React, Node.js, Next.js, Python, PostgreSQL, MongoDB, Firebase, AWS, Docker, GraphQL

**Apply Answers:** ✅ Configured
- Phone: +91-9876543210
- LinkedIn: https://linkedin.com/in/gowthamravi
- GitHub: https://github.com/gowthamravi
- Expected salary: ₹25-30 LPA
- Work authorized: ✅ Yes
- No sponsorship needed

---

## 📊 How It Works (End-to-End)

### Daily Batch Flow
1. **Scrape** → Fetch jobs from 5 free sources
2. **Dedupe** → Remove duplicates from Firestore
3. **Match** → Score each job against profile (0-100)
4. **Filter** → Keep only Software Dev roles
5. **Gate** → Keep only ≥65% confidence
6. **For each job:**
   - Fetch job description
   - Tailor resume (Claude + keywords)
   - Compile LaTeX PDF
   - Fill application form
   - Submit (if `live: true`)
   - Track in Firestore

### Matching Gate
- ✅ **Auto-apply:** Confidence ≥ 65%
- 📋 **For review:** Confidence 50-65%
- ❌ **Skip:** Confidence < 50%

Breakdown:
- Skill match: 50% weight
- Role relevance: 20% weight
- Experience fit: 18% weight
- Location fit: 12% weight

---

## 🔍 Troubleshooting

### Jobs not scraping?
```bash
curl http://localhost:3000/api/admin/test
```
Check `scraping` section in response

### Matches too low?
- Check profile skills vs. jobs being scraped
- Adjust `minConfidence` in profile if needed

### Applications not submitting?
1. Verify `live: true` in profile
2. Check browser adapters match the job board
3. Look at run events for errors

### Playwright not found?
```bash
npm i playwright
npx playwright install chromium
```

---

## 🔐 Security Notes

### LinkedIn/Indeed Credentials
- Currently in `.env.local` (plaintext)
- ⚠️ **ROTATE THESE** after testing
- Use a secret manager for production

### API Keys
- Firebase: In `.env.local`
- OpenAI: In `.env.local`
- Anthropic: (Optional, in `.env.local`)
- CRON_SECRET: In `.env.local`

All are git-ignored but should use a secret manager in production.

---

## 📈 Next Steps

1. ✅ Run `/api/admin/test` and verify scraping works
2. ✅ Run a dry-run batch and verify matching works
3. ✅ Review matched jobs in the dashboard
4. ✅ Enable `live: true` when ready
5. ✅ Set up cron job to call `/api/cron/daily-batch` with CRON_SECRET

### For Production:
- [ ] Move secrets to env manager (not git-tracked)
- [ ] Set up proper Trigger.dev scheduler
- [ ] Monitor applications and track success rate
- [ ] Adjust match thresholds based on actual results
- [ ] Add follow-up automation (currently +4 days)

---

## 📞 Support

Issues or questions?
- Check Firestore `runs` collection for detailed logs
- Review job matching logic in `web/lib/match.ts`
- Inspect apply adapters in `web/lib/apply/adapters.ts`
