import axios from "axios";
import { JobListing } from "../firebase";

export interface AngelListJob {
  id: number;
  title: string;
  company?: {
    name: string;
    location?: string;
  };
  description: string;
  tags?: Array<{ name: string }>;
  url?: string;
}

export async function scrapeAngelList(): Promise<JobListing[]> {
  try {
    const jobs: JobListing[] = [];

    // AngelList API endpoint for jobs (free, public access)
    const response = await axios.get("https://api.angel.co/1/jobs", {
      params: {
        page: 1,
        per_page: 50,
      },
      timeout: 10000,
    });

    const angelListJobs = response.data.jobs || [];

    for (const job of angelListJobs) {
      const skills = job.tags?.map((tag: { name: string }) => tag.name) || [];

      const jobListing: JobListing = {
        title: job.title || "N/A",
        company: job.company?.name || "Unknown",
        location: job.company?.location || "Remote",
        requiredSkills: skills,
        jobUrl: job.url || `https://angel.co/jobs/${job.id}`,
        postedDate: job.created_at || new Date().toISOString(),
        source: "angellist",
        externalId: `angellist-${job.id}`,
        requiredExperience: extractExperience(job.description || ""),
      };

      jobs.push(jobListing);
    }

    console.log(`✅ AngelList: Fetched ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error("❌ AngelList scraping error:", error);
    return [];
  }
}

function extractExperience(description: string): string {
  const patterns = [
    /(\d+)\+?\s*years?\s*of\s*experience/i,
    /(junior|mid-level|senior|lead|principal)/i,
    /(\d+)\+?\s*yoe/i,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) return match[0];
  }

  return "Not specified";
}
