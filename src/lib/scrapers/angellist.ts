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
  created_at?: string;
}

export async function scrapeAngelList(): Promise<JobListing[]> {
  try {
    const jobs: JobListing[] = [];
    const apiKey = process.env.ANGELLIST_API_KEY || "demo";

    // Try real API first
    let useRealAPI = false;
    let response;

    try {
      // AngelList API v3 endpoint (updated)
      const apiUrl = "https://api.angel.co/v3/jobs";
      response = await axios.get(apiUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "JobScraper/1.0",
        },
        params: {
          page: 1,
          per_page: 50,
          keywords: "software engineer",
        },
        timeout: 10000,
      });
      useRealAPI = true;
    } catch (error: any) {
      // If real API fails and we're using demo key, use mock data
      if (!useRealAPI && apiKey === "demo") {
        console.warn("⚠️ Using demo AngelList data (add real API key for live data)");
        const mockJobs: AngelListJob[] = [
          {
            id: 1,
            title: "Senior Full Stack Engineer",
            company: { name: "TechStartup Inc", location: "San Francisco, CA" },
            description: "Looking for experienced Node.js and React developer",
            tags: [{ name: "JavaScript" }, { name: "React" }, { name: "Node.js" }],
            url: "https://angel.co/jobs/demo-1",
            created_at: new Date().toISOString(),
          },
          {
            id: 2,
            title: "Backend Developer (Python)",
            company: { name: "DataCo", location: "Remote" },
            description: "5+ years Python and PostgreSQL experience required",
            tags: [{ name: "Python" }, { name: "PostgreSQL" }, { name: "Django" }],
            url: "https://angel.co/jobs/demo-2",
            created_at: new Date().toISOString(),
          },
          {
            id: 3,
            title: "Frontend Engineer (React/TypeScript)",
            company: { name: "DevStudio", location: "New York, NY" },
            description: "Build scalable React applications with TypeScript",
            tags: [{ name: "React" }, { name: "TypeScript" }, { name: "CSS" }],
            url: "https://angel.co/jobs/demo-3",
            created_at: new Date().toISOString(),
          },
          {
            id: 4,
            title: "DevOps Engineer",
            company: { name: "CloudSys", location: "Remote" },
            description: "Kubernetes, Docker, and AWS expertise needed",
            tags: [{ name: "Kubernetes" }, { name: "Docker" }, { name: "AWS" }],
            url: "https://angel.co/jobs/demo-4",
            created_at: new Date().toISOString(),
          },
          {
            id: 5,
            title: "Full Stack Developer",
            company: { name: "Venture Co", location: "Boston, MA" },
            description: "JavaScript, Node.js, and MongoDB experience",
            tags: [{ name: "JavaScript" }, { name: "Node.js" }, { name: "MongoDB" }],
            url: "https://angel.co/jobs/demo-5",
            created_at: new Date().toISOString(),
          },
        ];
        response = { data: { jobs: mockJobs } };
      } else {
        throw error;
      }
    }

    const angelListJobs = response.data.jobs || response.data || [];

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
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ AngelList scraping error: ${errorMsg}`);
    console.error("💡 Tip: Get an AngelList API key from https://angel.co/api/documentation");
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
