import "server-only";
import { db } from "./firebase-admin";
import type { Profile } from "./types";

const DOC = "profile/me";

export const DEFAULT_PROFILE: Profile = {
  fullName: "Gowtham Ravi",
  title: "Full Stack Engineer",
  email: "gowthamravi032@gmail.com",
  location: "Bengaluru, India",
  yearsExperience: 4,
  skills: [
    "TypeScript",
    "JavaScript",
    "React",
    "Node.js",
    "Next.js",
    "Python",
    "PostgreSQL",
    "MongoDB",
    "Firebase",
    "AWS",
    "Docker",
    "GraphQL",
  ],
  summary:
    "Full stack engineer who ships product-grade web apps end-to-end — from data models to polished, animated UIs. Comfortable owning features in production and automating the boring parts.",
  experience: [
    {
      company: "Freelance / Contract",
      role: "Full Stack Engineer",
      period: "2022 — Present",
      bullets: [
        "Built a job-search automation platform (Trigger.dev + Firebase) that scrapes 6 sources and auto-applies.",
        "Shipped React/Next.js dashboards with real-time Firestore data for client SaaS products.",
        "Cut manual ops time ~70% by automating multi-step workflows.",
      ],
    },
    {
      company: "Startup",
      role: "Software Engineer",
      period: "2020 — 2022",
      bullets: [
        "Owned Node.js + PostgreSQL backend services serving 50k+ users.",
        "Introduced Docker-based CI and reduced deploy time from 30m to 5m.",
      ],
    },
  ],
  preferences: {
    remoteOnly: false,
    minConfidence: 65,
    locations: ["Remote", "Bengaluru", "India"],
  },
  applyAnswers: {
    phone: "+91-9876543210",
    currentLocation: "Bengaluru, India",
    workAuthorized: true,
    needsSponsorship: false,
    noticePeriodDays: 30,
    willingToRelocate: false,
    remotePreference: "remote",
    expectedSalary: "₹25-30 LPA",
    currentSalary: "₹20 LPA",
    linkedinUrl: "https://linkedin.com/in/gowthamravi",
    githubUrl: "https://github.com/gowthamravi",
    portfolioUrl: "https://gowtham.dev",
    websiteUrl: "https://gowtham.dev",
    gender: "Decline to self-identify",
    ethnicity: "Decline to self-identify",
    veteranStatus: "Decline to self-identify",
    disabilityStatus: "Decline to self-identify",
    coverLetterDefault:
      "I'm excited to apply for this role. My background as a full stack engineer maps directly to your needs, and I'd welcome the chance to contribute.",
    customAnswers: {},
  },
  automation: {
    // Set to true to actually submit applications. false = dry-run (fills form, screenshots, no submit).
    live: true,
    dailyQuota: 50,
    sources: ["remoteok", "remotive", "arbeitnow", "jobicy", "themuse"],
    maxPerSource: 20,
    concurrency: 2,
    throttleMinMs: 4000,
    throttleMaxMs: 12000,
  },
};

export async function getProfile(): Promise<Profile> {
  const snap = await db().doc(DOC).get();
  if (!snap.exists) return DEFAULT_PROFILE;
  const stored = snap.data() as Partial<Profile>;
  // Shallow spread for top-level, but deep-merge the nested config objects so a
  // partial save (e.g. just one apply answer) never drops the rest of the defaults.
  return {
    ...DEFAULT_PROFILE,
    ...stored,
    preferences: { ...DEFAULT_PROFILE.preferences, ...stored.preferences },
    applyAnswers: { ...DEFAULT_PROFILE.applyAnswers, ...stored.applyAnswers },
    automation: { ...DEFAULT_PROFILE.automation, ...stored.automation },
  } as Profile;
}

export async function saveProfile(patch: Partial<Profile>): Promise<Profile> {
  const current = await getProfile();
  const next = { ...current, ...patch };
  await db().doc(DOC).set(next, { merge: true });
  return next;
}
