import axios from "axios";
import { JobListing } from "../firebase";

export interface RemoteOKJob {
  id: string;
  jobTitle: string;
  companyName: string;
  location: string;
  description: string;
  url: string;
  postedDaysAgo: number;
}

export async function scrapeRemoteOK(): Promise<JobListing[]> {
  try {
    const jobs: JobListing[] = [];

    // RemoteOK API endpoint (free, public access)
    const response = await axios.get("https://remoteok.io/api", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      timeout: 10000,
    });

    const remoteOKJobs = response.data || [];

    if (!Array.isArray(remoteOKJobs)) {
      console.warn("⚠️ RemoteOK API returned unexpected format");
      return [];
    }

    for (const job of remoteOKJobs.slice(0, 50)) {
      if (!job.id || job.id === "fakelag") continue; // Skip fake lag indicator

      // Handle different field names from RemoteOK API
      const title = job.job_title || job.title || "N/A";
      const company = job.company_name || job.company || "Unknown";

      const skills = extractSkills(job.description || job.job_description || "");

      const jobListing: JobListing = {
        title,
        company,
        location: job.location || "Remote",
        requiredSkills: skills,
        jobUrl: job.url || job.job_url || `https://remoteok.io/remote-jobs/${job.id}`,
        postedDate: job.date_posted || job.posted_at || new Date().toISOString(),
        source: "remoteok",
        externalId: `remoteok-${job.id}`,
        requiredExperience: extractExperience(job.description || job.job_description || ""),
      };

      jobs.push(jobListing);
    }

    console.log(`✅ RemoteOK: Fetched ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ RemoteOK scraping error: ${errorMsg}`);
    return [];
  }
}

function extractSkills(description: string): string[] {
  const skillPatterns = [
    /(?:javascript|typescript|python|java|golang|rust|react|vue|angular|node|express|django|flask|postgres|mongodb)/gi,
  ];

  const skills = new Set<string>();

  for (const pattern of skillPatterns) {
    const matches = description.match(pattern);
    if (matches) {
      matches.forEach((skill) => skills.add(skill.toLowerCase()));
    }
  }

  return Array.from(skills);
}

function extractExperience(description: string): string {
  const patterns = [
    /(\d+)\+?\s*years?\s*of\s*experience/i,
    /(junior|mid-level|senior|lead|principal)/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) return match[0];
  }

  return "Not specified";
}
