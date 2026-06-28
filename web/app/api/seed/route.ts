import { db } from "@/lib/firebase-admin";
import { getProfile, saveProfile } from "@/lib/profile";
import type { Job } from "@/lib/types";

export const dynamic = "force-dynamic";

const SAMPLE: Omit<Job, "id">[] = [
  {
    title: "Senior Full Stack Engineer",
    company: "Vercel",
    location: "Remote",
    requiredExperience: "5+ years",
    requiredSkills: ["TypeScript", "React", "Next.js", "Node.js", "PostgreSQL"],
    jobUrl: "https://example.com/jobs/vercel-fullstack",
    source: "remoteok",
    postedDate: new Date().toISOString(),
  },
  {
    title: "Frontend Engineer (React)",
    company: "Linear",
    location: "Remote",
    requiredExperience: "3+ years",
    requiredSkills: ["TypeScript", "React", "GraphQL", "CSS"],
    jobUrl: "https://example.com/jobs/linear-fe",
    source: "angellist",
    postedDate: new Date().toISOString(),
  },
  {
    title: "Backend Engineer — Python",
    company: "Stripe",
    location: "Bengaluru, India",
    requiredExperience: "4+ years",
    requiredSkills: ["Python", "PostgreSQL", "AWS", "Docker"],
    jobUrl: "https://example.com/jobs/stripe-be",
    source: "instahyre",
    postedDate: new Date().toISOString(),
  },
  {
    title: "Platform Engineer",
    company: "Datadog",
    location: "Remote",
    requiredExperience: "5+ years",
    requiredSkills: ["Go", "Kubernetes", "AWS", "Docker"],
    jobUrl: "https://example.com/jobs/datadog-platform",
    source: "glassdoor",
    postedDate: new Date().toISOString(),
  },
  {
    title: "Full Stack Developer (Node + React)",
    company: "Notion",
    location: "Remote",
    requiredExperience: "3+ years",
    requiredSkills: ["JavaScript", "React", "Node.js", "MongoDB"],
    jobUrl: "https://example.com/jobs/notion-fs",
    source: "indeed",
    postedDate: new Date().toISOString(),
  },
  {
    title: "Staff Machine Learning Engineer",
    company: "OpenAI",
    location: "San Francisco, CA",
    requiredExperience: "8+ years",
    requiredSkills: ["Python", "PyTorch", "Distributed Systems", "CUDA"],
    jobUrl: "https://example.com/jobs/openai-ml",
    source: "linkedin",
    postedDate: new Date().toISOString(),
  },
  {
    title: "Software Engineer, Frontend Platform",
    company: "Figma",
    location: "Remote",
    requiredExperience: "4+ years",
    requiredSkills: ["TypeScript", "React", "Next.js", "GraphQL"],
    jobUrl: "https://example.com/jobs/figma-fe",
    source: "remoteok",
    postedDate: new Date().toISOString(),
  },
  {
    title: "DevOps Engineer",
    company: "Cloudflare",
    location: "Remote",
    requiredExperience: "4+ years",
    requiredSkills: ["AWS", "Docker", "Kubernetes", "Terraform"],
    jobUrl: "https://example.com/jobs/cloudflare-devops",
    source: "glassdoor",
    postedDate: new Date().toISOString(),
  },
];

export async function POST() {
  try {
    await getProfile().then((p) => saveProfile(p)); // ensure profile doc exists

    const existing = await db().collection("jobs").limit(1).get();
    let inserted = 0;
    if (existing.empty) {
      const batch = db().batch();
      for (const job of SAMPLE) {
        const ref = db().collection("jobs").doc();
        batch.set(ref, { ...job, fetchedAt: new Date().toISOString() });
        inserted++;
      }
      await batch.commit();
    }

    const count = (await db().collection("jobs").count().get()).data().count;
    return Response.json({ inserted, totalJobs: count });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Seed failed" },
      { status: 500 },
    );
  }
}
