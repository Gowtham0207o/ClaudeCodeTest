import { schedules } from "@trigger.dev/sdk/v3";
import { z } from "zod";
import { saveJobToFirebase, isDuplicateJob, JobListing } from "~/lib/firebase";
import { scrapeAngelList } from "~/lib/scrapers/angellist";
import { scrapeRemoteOK } from "~/lib/scrapers/remoteok";
import { scrapeIndeed } from "~/lib/scrapers/indeed";
import { scrapeGlassdoor } from "~/lib/scrapers/glassdoor";
import { scrapeLinkedInRSS } from "~/lib/scrapers/linkedin";

export const scrapeDailyJobs = schedules.task({
  id: "scrape-daily-jobs",
  cron: "0 6 * * *", // Runs daily at 6 AM
  run: async (payload) => {
    console.log("🚀 Starting daily job scraping...");

    const startTime = Date.now();
    const results = {
      angellist: 0,
      remoteok: 0,
      indeed: 0,
      glassdoor: 0,
      linkedin: 0,
      saved: 0,
      duplicates: 0,
      errors: 0,
    };

    try {
      // Scrape all sources in parallel
      console.log("📡 Fetching jobs from all sources...");
      const [angelListJobs, remoteOKJobs, indeedJobs, glassdoorJobs, linkedInJobs] =
        await Promise.all([
          scrapeAngelList().catch((e) => {
            console.error("AngelList error:", e);
            results.errors++;
            return [];
          }),
          scrapeRemoteOK().catch((e) => {
            console.error("RemoteOK error:", e);
            results.errors++;
            return [];
          }),
          scrapeIndeed().catch((e) => {
            console.error("Indeed error:", e);
            results.errors++;
            return [];
          }),
          scrapeGlassdoor().catch((e) => {
            console.error("Glassdoor error:", e);
            results.errors++;
            return [];
          }),
          scrapeLinkedInRSS().catch((e) => {
            console.error("LinkedIn error:", e);
            results.errors++;
            return [];
          }),
        ]);

      results.angellist = angelListJobs.length;
      results.remoteok = remoteOKJobs.length;
      results.indeed = indeedJobs.length;
      results.glassdoor = glassdoorJobs.length;
      results.linkedin = linkedInJobs.length;

      // Combine all jobs
      const allJobs = [
        ...angelListJobs,
        ...remoteOKJobs,
        ...indeedJobs,
        ...glassdoorJobs,
        ...linkedInJobs,
      ];

      console.log(`\n📊 Total jobs fetched: ${allJobs.length}`);

      // Save to Firebase, checking for duplicates
      console.log("💾 Saving to Firebase...");
      for (const job of allJobs) {
        try {
          const isDuplicate = await isDuplicateJob(
            job.externalId || "",
            job.source
          );

          if (isDuplicate) {
            results.duplicates++;
            continue;
          }

          await saveJobToFirebase(job);
          results.saved++;
        } catch (error) {
          console.error(`Error saving job: ${job.title}`, error);
          results.errors++;
        }
      }

      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);

      const summary = `
✅ Job Scraping Completed in ${duration}s

📈 Results:
  • AngelList: ${results.angellist} jobs
  • RemoteOK: ${results.remoteok} jobs
  • Indeed: ${results.indeed} jobs
  • Glassdoor: ${results.glassdoor} jobs
  • LinkedIn: ${results.linkedin} jobs

💾 Storage:
  • Saved: ${results.saved} new jobs
  • Duplicates: ${results.duplicates}
  • Errors: ${results.errors}
`;

      console.log(summary);

      return {
        success: true,
        message: "Daily job scraping completed successfully",
        stats: results,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("❌ Fatal error during scraping:", error);

      return {
        success: false,
        message: "Daily job scraping failed",
        error: error instanceof Error ? error.message : "Unknown error",
        stats: results,
        timestamp: new Date().toISOString(),
      };
    }
  },
});
