import { scrapeAndStore } from "@/lib/scrape";
import { matchJob } from "@/lib/match";
import { getProfile } from "@/lib/profile";
import { db } from "@/lib/firebase-admin";
import type { ScrapedJob } from "@/lib/scrapers";

/** Admin test endpoint — verify scraping and matching works. */
export async function GET(req: Request) {
  try {
    const profile = await getProfile();

    // 1. Test scrape
    const scrapeResults: { stage: string; message: string; jobsFound: number; scrapersRan: number }[] = [];
    for await (const progress of scrapeAndStore()) {
      if (progress.type === "done") {
        const data = progress.data as { saved: number; duplicates: number; totalJobs: number; perSource: Array<{ source: string; fetched: number; ok: boolean }> };
        scrapeResults.push({
          stage: "scrape",
          message: progress.message,
          jobsFound: data.saved,
          scrapersRan: data.perSource.length,
        });
      }
    }

    // 2. Load jobs from Firestore
    const jobsSnap = await db().collection("jobs").limit(10).get();
    const jobs = jobsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<{ id: string; title: string; company: string; requiredSkills?: string[] }>;

    // 3. Test matching on first job
    const matchResults: { jobId: string; title: string; company: string; confidence: number; verdict: string }[] = [];
    for (const job of jobs) {
      const match = matchJob(job as any, profile);
      matchResults.push({
        jobId: job.id,
        title: job.title,
        company: job.company,
        confidence: match.confidence,
        verdict: match.verdict,
      });
    }

    // 4. Get profile summary
    const profileSummary = {
      name: profile.fullName,
      title: profile.title,
      skills: profile.skills.slice(0, 5),
      yearsExperience: profile.yearsExperience,
      automationLive: profile.automation.live,
    };

    return Response.json(
      {
        status: "ok",
        profile: profileSummary,
        scraping: scrapeResults,
        jobsLoaded: jobs.length,
        matches: matchResults,
        summary: {
          highConfidence: matchResults.filter((m) => m.confidence >= profile.preferences.minConfidence).length,
          needsReview: matchResults.filter((m) => m.confidence >= 50 && m.confidence < profile.preferences.minConfidence).length,
          skipped: matchResults.filter((m) => m.confidence < 50).length,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        status: "error",
        error: (error as Error).message,
        stack: (error as Error).stack?.split("\n").slice(0, 5),
      },
      { status: 500 },
    );
  }
}
