# Job Search Automation System

Automated job scraping and application system built with Trigger.dev and Firebase.

## Features

✅ **Daily Job Scraping** - Automatically scrapes jobs from:
- AngelList (startup jobs)
- RemoteOK (remote positions)
- Indeed (all positions)
- Glassdoor (company-specific jobs)
- LinkedIn (limited, via RSS)

✅ **Smart Filtering** - Coming soon:
- Skill matching
- Salary filtering
- Company scoring

✅ **Auto-Apply** - Coming soon:
- Automatic form filling
- Application tracking
- Follow-up scheduling

## Project Structure

```
src/
├── trigger/
│   └── scrape-daily-jobs.ts        # Main scheduled scraping task
├── lib/
│   ├── firebase.ts                 # Firebase configuration & utilities
│   └── scrapers/
│       ├── angellist.ts            # AngelList scraper
│       ├── remoteok.ts             # RemoteOK scraper
│       ├── indeed.ts               # Indeed scraper (web scrape)
│       ├── glassdoor.ts            # Glassdoor scraper (web scrape)
│       └── linkedin.ts             # LinkedIn scraper (RSS feed)
├── trigger.config.ts               # Trigger.dev configuration
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript configuration
└── .env.example                    # Environment variables template
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Firebase

1. Create a Firebase project at [firebase.google.com](https://firebase.google.com)
2. Get your Firebase config from Project Settings
3. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
4. Fill in your Firebase credentials in `.env.local`

### 3. Configure Trigger.dev

1. Sign up at [trigger.dev](https://trigger.dev)
2. Get your `TRIGGER_SECRET_KEY` from the dashboard
3. Add it to `.env.local`:
```
TRIGGER_SECRET_KEY=your_secret_key_here
```

### 4. Run Locally

```bash
npm run dev
```

This starts the Trigger.dev development server. Your scheduled task will run at the configured time (6 AM daily).

### 5. Deploy to Production

```bash
npm run deploy
```

## How It Works

### Daily Scraping Task (`scrape-daily-jobs`)

Runs automatically every day at **6 AM UTC**:

1. **Scrapes all sources in parallel**
   - AngelList API (official, free)
   - RemoteOK API (official, free)
   - Indeed (ethical web scraping)
   - Glassdoor (ethical web scraping)
   - LinkedIn (RSS feeds)

2. **Extracts key information**
   - Job title
   - Company name
   - Location
   - Required skills
   - Required experience
   - Job URL

3. **Stores in Firebase**
   - Checks for duplicates
   - Saves new jobs to Firestore
   - Maintains scraping history

4. **Logs results**
   - Shows statistics per source
   - Tracks duplicates and errors
   - Performance metrics

## Environment Variables

Create `.env.local` with:

```env
# Trigger.dev
TRIGGER_SECRET_KEY=your_secret_key

# Firebase
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_DATABASE_URL=https://your_project.firebaseio.com

# Optional
ANGELLIST_API_KEY=your_angellist_key
```

## Firebase Database Schema

### `jobs` Collection

```typescript
{
  title: string                  // Job title
  company: string                // Company name
  location: string               // Job location
  requiredExperience: string     // Experience requirement
  requiredSkills: string[]       // Array of required skills
  jobUrl: string                 // Link to job posting
  postedDate: string             // When job was posted
  source: string                 // Source (angellist|indeed|remoteok|glassdoor|linkedin)
  externalId: string             // Unique ID per source
  fetchedAt: string              // When we fetched it
}
```

## Next Steps

The following tasks are planned:

1. **Skill Matcher Task** - Compare job requirements against your skills
2. **Salary Filter Task** - Filter jobs by salary range
3. **Company Scorer Task** - Evaluate company reputation
4. **Auto-Apply Task** - Submit applications automatically
5. **Follow-up Scheduler** - Track and follow up on applications

## Troubleshooting

### No jobs being scraped?
- Check that Firebase credentials are correct in `.env.local`
- Ensure rate limiting isn't blocking requests (use delays between scrapes)
- Check Trigger.dev logs for errors

### Firebase connection fails?
- Verify all Firebase environment variables are set
- Check that Firestore database is created in Firebase console
- Ensure Firebase security rules allow read/write

### Web scraping sites are blocking?
- Adding delays between requests
- Rotating User-Agent headers
- Consider switching to official APIs where available

## Cost

**Completely FREE:**
- Trigger.dev: Free tier includes 500 task runs/month
- Firebase: Free tier includes 1 GB storage + 50k reads/writes
- Job APIs: All sources used are free

## Contributing

Feel free to extend this with:
- Additional job sources
- Better skill extraction
- Company reputation scoring
- Application form automation

## License

MIT
