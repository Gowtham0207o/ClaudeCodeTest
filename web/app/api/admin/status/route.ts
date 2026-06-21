import { db } from "@/lib/firebase-admin";
import { getProfile } from "@/lib/profile";

/** Admin status dashboard — check system health. */
export async function GET(req: Request) {
  try {
    const profile = await getProfile();

    // 1. Count jobs in store
    const jobsCount = await db().collection("jobs").count().get();
    const jobsSnap = await db()
      .collection("jobs")
      .orderBy("fetchedAt", "desc")
      .limit(5)
      .get();
    const recentJobs = jobsSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        title: data.title,
        company: data.company,
        source: data.source,
        fetchedAt: data.fetchedAt,
      };
    });

    // 2. Count applications
    const appsCount = await db().collection("applications").count().get();
    const appsSnap = await db()
      .collection("applications")
      .orderBy("createdAt", "desc")
      .limit(5)
      .get();
    const recentApps = appsSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        jobTitle: data.jobTitle,
        company: data.company,
        status: data.status,
        confidence: data.confidence,
        appliedAt: data.appliedAt,
      };
    });

    // 3. Count runs
    const runsSnap = await db()
      .collection("runs")
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    const runs = runsSnap.docs.map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        trigger: data.trigger,
        live: data.live,
        status: data.status,
        createdAt: data.createdAt,
        counts: data.counts || {},
      };
    });

    // 4. Application stats
    const appliedSnap = await db()
      .collection("applications")
      .where("status", "==", "applied")
      .count()
      .get();
    const reviewSnap = await db()
      .collection("applications")
      .where("status", "==", "matched")
      .count()
      .get();
    const skippedSnap = await db()
      .collection("applications")
      .where("status", "==", "skipped")
      .count()
      .get();

    return Response.json(
      {
        status: "ok",
        profile: {
          name: profile.fullName,
          title: profile.title,
          automationLive: profile.automation.live,
          minConfidence: profile.preferences.minConfidence,
          dailyQuota: profile.automation.dailyQuota,
        },
        store: {
          totalJobs: jobsCount.data().count,
          recentJobs,
        },
        applications: {
          total: appsCount.data().count,
          applied: appliedSnap.data().count,
          forReview: reviewSnap.data().count,
          skipped: skippedSnap.data().count,
          recentApps,
        },
        runs: {
          total: runsSnap.size,
          recent: runs,
        },
        config: {
          sources: profile.automation.sources,
          maxPerSource: profile.automation.maxPerSource,
          concurrency: profile.automation.concurrency,
          throttleMs: `${profile.automation.throttleMinMs}-${profile.automation.throttleMaxMs}`,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        status: "error",
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
