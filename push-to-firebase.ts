import admin from "firebase-admin";
import { config } from "dotenv";
import { scrapeAngelList } from "./src/lib/scrapers/angellist.js";
import { scrapeRemoteOK } from "./src/lib/scrapers/remoteok.js";
import { scrapeIndeed } from "./src/lib/scrapers/indeed.js";
import { scrapeGlassdoor } from "./src/lib/scrapers/glassdoor.js";
import { scrapeLinkedInRSS } from "./src/lib/scrapers/linkedin.js";
import { scrapeInstaHyre } from "./src/lib/scrapers/instahyre.js";
import { JobListing } from "./src/lib/firebase.js";

// Load environment variables from .env
config();

// Initialize Firebase Admin SDK
// All credential fields come from the environment (.env / .env.local) — never
// hardcode service-account identifiers in source.
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_ADMIN_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_ADMIN_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_ADMIN_CLIENT_CERT_URL,
  universe_domain: "googleapis.com",
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as any),
});

const db = admin.firestore();

async function isDuplicateJob(
  externalId: string,
  source: string
): Promise<boolean> {
  try {
    const snapshot = await db
      .collection("jobs")
      .where("externalId", "==", externalId)
      .where("source", "==", source)
      .get();
    return snapshot.docs.length > 0;
  } catch (error) {
    console.error("Error checking for duplicate:", error);
    return false;
  }
}

async function saveJobToFirebase(job: JobListing): Promise<string> {
  try {
    const docRef = await db.collection("jobs").add({
      ...job,
      fetchedAt: new Date().toISOString(),
      savedAt: new Date(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error saving job:", error);
    throw error;
  }
}

async function pushJobsToFirebase() {
  console.log("🚀 Starting job scraping and Firebase push...\n");

  const startTime = Date.now();
  const results = {
    angellist: 0,
    remoteok: 0,
    indeed: 0,
    glassdoor: 0,
    linkedin: 0,
    instahyre: 0,
    saved: 0,
    duplicates: 0,
    errors: 0,
  };

  try {
    // Scrape all sources in parallel
    console.log("📡 Fetching jobs from all sources...");
    const [angelListJobs, remoteOKJobs, indeedJobs, glassdoorJobs, linkedInJobs, instaHyreJobs] =
      await Promise.all([
        scrapeAngelList().catch((e) => {
          console.error("AngelList error:", e.message);
          results.errors++;
          return [];
        }),
        scrapeRemoteOK().catch((e) => {
          console.error("RemoteOK error:", e.message);
          results.errors++;
          return [];
        }),
        scrapeIndeed().catch((e) => {
          console.error("Indeed error:", e.message);
          results.errors++;
          return [];
        }),
        scrapeGlassdoor().catch((e) => {
          console.error("Glassdoor error:", e.message);
          results.errors++;
          return [];
        }),
        scrapeLinkedInRSS().catch((e) => {
          console.error("LinkedIn error:", e.message);
          results.errors++;
          return [];
        }),
        scrapeInstaHyre().catch((e) => {
          console.error("InstaHyre error:", e.message);
          results.errors++;
          return [];
        }),
      ]);

    results.angellist = angelListJobs.length;
    results.remoteok = remoteOKJobs.length;
    results.indeed = indeedJobs.length;
    results.glassdoor = glassdoorJobs.length;
    results.linkedin = linkedInJobs.length;
    results.instahyre = instaHyreJobs.length;

    // Combine all jobs
    const allJobs = [
      ...angelListJobs,
      ...remoteOKJobs,
      ...indeedJobs,
      ...glassdoorJobs,
      ...linkedInJobs,
      ...instaHyreJobs,
    ];

    console.log(`\n📊 Total jobs fetched: ${allJobs.length}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    // Save to Firebase, checking for duplicates
    console.log("💾 Saving to Firebase...\n");
    for (const job of allJobs) {
      try {
        const isDuplicate = await isDuplicateJob(
          job.externalId || "",
          job.source
        );

        if (isDuplicate) {
          console.log(`⏭️  SKIP: ${job.title} (${job.source}) - Already exists`);
          results.duplicates++;
          continue;
        }

        const docId = await saveJobToFirebase(job);
        console.log(`✅ SAVED: ${job.title}`);
        console.log(`   Company: ${job.company}`);
        console.log(`   Location: ${job.location}`);
        console.log(`   Source: ${job.source}`);
        console.log(`   Firebase ID: ${docId}\n`);
        results.saved++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`❌ ERROR: Failed to save ${job.title}: ${errorMsg}\n`);
        results.errors++;
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    const summary = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Job Scraping & Firebase Push Completed in ${duration}s

📈 Jobs Fetched from All Sources:
  • AngelList: ${results.angellist} jobs
  • RemoteOK: ${results.remoteok} jobs
  • Indeed: ${results.indeed} jobs
  • Glassdoor: ${results.glassdoor} jobs
  • LinkedIn: ${results.linkedin} jobs
  • InstaHyre: ${results.instahyre} jobs

💾 Firebase Storage:
  • Saved: ${results.saved} new jobs
  • Duplicates: ${results.duplicates} (skipped)
  • Errors: ${results.errors}

✨ Total Unique Jobs Added: ${results.saved}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    console.log(summary);

    // Verify Firebase has the data
    const jobCount = await db.collection("jobs").count().get();
    console.log(`\n📋 Verification: Firebase now contains ${jobCount.data().count} total jobs\n`);

    return {
      success: true,
      message: "Jobs successfully scraped and saved to Firebase",
      stats: results,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Fatal error during scraping: ${errorMsg}`);

    return {
      success: false,
      message: "Job scraping failed",
      error: errorMsg,
      stats: results,
      timestamp: new Date().toISOString(),
    };
  } finally {
    await admin.app().delete();
  }
}

pushJobsToFirebase().then((result) => {
  console.log("\n📊 Final Result:");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
});
