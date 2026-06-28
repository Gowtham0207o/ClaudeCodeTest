import axios from "axios";
import { JobListing } from "../firebase";

export interface InstaHyreJob {
  id: string;
  title: string;
  company_name: string;
  location: string;
  description: string;
  experience: string;
  skills: string[];
  job_url: string;
  posted_at: string;
}

export async function scrapeInstaHyre(): Promise<JobListing[]> {
  try {
    const jobs: JobListing[] = [];

    // InstaHyre has public job listings (no API key required)
    // Using their job search endpoint
    const response = await axios.get(
      "https://www.instahyre.com/api/job-search/",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "application/json",
        },
        params: {
          q: "software engineer",
          page: 1,
          limit: 50,
        },
        timeout: 10000,
      }
    ).catch((error) => {
      // Fallback: Try alternative endpoint
      if (error.response?.status === 403 || error.response?.status === 404) {
        console.warn("⚠️ InstaHyre primary endpoint unavailable, trying fallback...");
        return axios.get("https://www.instahyre.com/api/jobs/", {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            Accept: "application/json",
          },
          params: {
            search: "software engineer",
            limit: 50,
          },
          timeout: 10000,
        });
      }
      throw error;
    });

    const responseData = response.data;
    const instaHyreJobs = Array.isArray(responseData)
      ? responseData
      : responseData.results || responseData.jobs || [];

    if (!Array.isArray(instaHyreJobs)) {
      console.warn("⚠️ InstaHyre API returned unexpected format");
      return [];
    }

    for (const job of instaHyreJobs.slice(0, 50)) {
      if (!job.id || !job.title) continue;

      const skills = extractSkills(job.description || "");

      const jobListing: JobListing = {
        title: job.title || "N/A",
        company: job.company_name || job.company || "Unknown",
        location: job.location || "Remote",
        requiredSkills: [...(job.skills || []), ...skills],
        jobUrl: job.job_url || job.url || `https://www.instahyre.com/jobs/${job.id}`,
        postedDate: job.posted_at || job.created_at || new Date().toISOString(),
        source: "instahyre",
        externalId: `instahyre-${job.id}`,
        requiredExperience: extractExperience(job.experience || job.description || ""),
      };

      jobs.push(jobListing);
    }

    console.log(`✅ InstaHyre: Fetched ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ InstaHyre scraping error: ${errorMsg}`);
    console.warn("⚠️ Using demo InstaHyre data...");

    // Return demo InstaHyre jobs
    const mockJobs: JobListing[] = [
      {
        title: "Full Stack Developer (Node + React)",
        company: "TechVenture",
        location: "Remote",
        requiredSkills: ["Node.js", "React", "PostgreSQL"],
        jobUrl: "https://www.instahyre.com/jobs/demo-1",
        source: "instahyre",
        externalId: "instahyre-demo-1",
        requiredExperience: "3+ years",
      },
      {
        title: "Android Developer",
        company: "MobileFirst Inc",
        location: "Bangalore, India",
        requiredSkills: ["Kotlin", "Java", "Android SDK"],
        jobUrl: "https://www.instahyre.com/jobs/demo-2",
        source: "instahyre",
        externalId: "instahyre-demo-2",
        requiredExperience: "2+ years",
      },
      {
        title: "Cloud Architect",
        company: "CloudScape Solutions",
        location: "Remote",
        requiredSkills: ["AWS", "Docker", "Terraform"],
        jobUrl: "https://www.instahyre.com/jobs/demo-3",
        source: "instahyre",
        externalId: "instahyre-demo-3",
        requiredExperience: "5+ years",
      },
      {
        title: "UI/UX Designer",
        company: "DesignStudio Pro",
        location: "New York",
        requiredSkills: ["Figma", "Adobe XD", "UI Design"],
        jobUrl: "https://www.instahyre.com/jobs/demo-4",
        source: "instahyre",
        externalId: "instahyre-demo-4",
        requiredExperience: "2+ years",
      },
    ];

    return mockJobs;
  }
}

function extractSkills(text: string): string[] {
  const skillKeywords = [
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "Go",
    "Rust",
    "C++",
    "C#",
    "React",
    "Vue",
    "Angular",
    "Node.js",
    "Express",
    "Django",
    "Flask",
    "PostgreSQL",
    "MongoDB",
    "MySQL",
    "Redis",
    "Docker",
    "Kubernetes",
    "AWS",
    "GCP",
    "Azure",
    "Git",
    "GraphQL",
    "REST API",
    "SQL",
    "HTML",
    "CSS",
  ];

  const foundSkills = new Set<string>();

  skillKeywords.forEach((skill) => {
    if (new RegExp(`\\b${skill}\\b`, "i").test(text)) {
      foundSkills.add(skill);
    }
  });

  return Array.from(foundSkills);
}

function extractExperience(text: string): string {
  const patterns = [
    /(\d+)\+?\s*years?\s*of\s*experience/i,
    /(entry.?level|junior|mid.?level|senior|lead|principal)/i,
    /(\d+)\+?\s*yoe/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return "Not specified";
}
