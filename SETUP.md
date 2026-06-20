# Quick Start Setup Guide

Follow these steps to get your job scraper running in 10 minutes.

## Step 1: Create Firebase Project (3 minutes)

1. Go to https://firebase.google.com
2. Click "Get Started" → Create a new project
3. Project name: `job-search-automation`
4. Skip analytics (optional)
5. Once created, go to Project Settings (⚙️ icon, top-left)
6. Copy these values:
   - `projectId` → FIREBASE_PROJECT_ID
   - `storageBucket` → FIREBASE_STORAGE_BUCKET
   - `authDomain` → FIREBASE_AUTH_DOMAIN
   - `messagingSenderId` → FIREBASE_MESSAGING_SENDER_ID
   - `appId` → FIREBASE_APP_ID

7. Generate API Key:
   - Go to Settings → Service Accounts
   - Copy "API Key" → FIREBASE_API_KEY

8. Create Firestore Database:
   - In Firebase console, go to Firestore Database
   - Click "Create Database"
   - Select "Start in production mode"
   - Choose region closest to you

## Step 2: Setup Trigger.dev Account (2 minutes)

1. Go to https://trigger.dev
2. Sign up with GitHub
3. Create a new project: `job-search-automation`
4. Copy the `TRIGGER_SECRET_KEY` from dashboard

## Step 3: Configure Environment Variables (2 minutes)

1. Open `.env.local` in your project root
2. Fill in all Firebase values from Step 1:
```env
TRIGGER_SECRET_KEY=your_trigger_secret_key_here

FIREBASE_API_KEY=your_firebase_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_DATABASE_URL=https://your_project.firebaseio.com
```

## Step 4: Install Dependencies (3 minutes)

```bash
npm install
```

## Step 5: Run Development Server

```bash
npm run dev
```

You should see:
```
✅ Trigger.dev Development Server Started
📡 Listening on http://localhost:3000
🚀 Ready for task triggers
```

## Step 6: Test the Scraper

### Option A: Wait for scheduled time
The scraper runs daily at 6 AM UTC. Or...

### Option B: Manually trigger (recommended for testing)

In another terminal:
```bash
npm run trigger -- scrape-daily-jobs
```

Or in Trigger.dev dashboard:
1. Go to your project dashboard
2. Find "scrape-daily-jobs" task
3. Click "Run" button
4. Monitor logs in real-time

## Expected Output

After running, you should see:
```
✅ Job Scraping Completed in 15.23s

📈 Results:
  • AngelList: 45 jobs
  • RemoteOK: 120 jobs
  • Indeed: 85 jobs
  • Glassdoor: 60 jobs
  • LinkedIn: 0 jobs

💾 Storage:
  • Saved: 310 new jobs
  • Duplicates: 0
  • Errors: 0
```

## Verify Jobs in Firebase

1. Open Firebase Console → Firestore Database
2. You should see a `jobs` collection with documents
3. Each document contains job details

## Deploy to Production

Once tested locally:

```bash
npm run deploy
```

This deploys to Trigger.dev cloud. Your task will run automatically every day at 6 AM UTC.

## Troubleshooting

### "Cannot find module firebase"
```bash
npm install
```

### "FIREBASE_API_KEY not found"
Make sure `.env.local` exists and has all variables filled

### "Connection refused to Firestore"
1. Check `.env.local` values are correct
2. Go to Firebase Console → Firestore → Security Rules
3. Temporarily allow all reads/writes for testing:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
(Later, restrict these for production)

### Web scraping returns 0 jobs
- Indeed/Glassdoor scraping requires proper User-Agent headers (already included)
- If still failing, the sites may have changed their HTML structure
- Check console logs for specific errors

### "Invalid project ID"
Verify FIREBASE_PROJECT_ID matches exactly in Firebase console

## Next Steps

1. ✅ Scraper running daily
2. ⏭️ Build skill matcher task
3. ⏭️ Build salary filter task
4. ⏭️ Build auto-apply task

Run `/new-client-system` to build the frontend dashboard to view jobs!

## Support

For issues:
1. Check Trigger.dev logs: https://trigger.dev/dashboard
2. Check Firebase logs: Firebase Console → Logs
3. Run locally first with `npm run dev` to debug
