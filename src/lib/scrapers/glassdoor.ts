import axios from "axios";
import * as cheerio from "cheerio";
import { JobListing } from "../firebase";

export async function scrapeGlassdoor(): Promise<JobListing[]> {
  try {
    const jobs: JobListing[] = [];

    // Glassdoor job search (ethical scraping with rate limiting)
    const url = "https://www.glassdoor.com/Job/software-engineer-jobs-SRCH_KO0,16.htm";

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // Parse Glassdoor job listings
    $("div[data-job-id]").each((index, element) => {
      const title = $(element).find("a.jobLink").first().text().trim();
      const company = $(element).find("a.employerLink").first().text().trim();
      const location = $(element).find("span.jobLabel.location").first().text().trim();
      const description = $(element).find("div.jobSnippet").text().trim();
      const jobUrl = $(element).find("a.jobLink").first().attr("href");

      if (title && company) {
        const skills = extractSkills(description);

        const jobListing: JobListing = {
          title,
          company,
          location: location || "Remote",
          requiredSkills: skills,
          jobUrl: jobUrl || undefined,
          source: "glassdoor",
          externalId: `glassdoor-${index}-${Date.now()}`,
          requiredExperience: extractExperience(description),
        };

        jobs.push(jobListing);
      }
    });

    console.log(`✅ Glassdoor: Fetched ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error("❌ Glassdoor scraping error:", error);
    return [];
  }
}

function extractSkills(text: string): string[] {
  const skillKeywords = [
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "C++",
    "Go",
    "Rust",
    "React",
    "Vue",
    "Angular",
    "Node.js",
    "Express",
    "Django",
    "Flask",
    "PostgreSQL",
    "MongoDB",
    "SQL",
    "AWS",
    "Docker",
    "Kubernetes",
  ];

  const foundSkills = new Set<string>();

  skillKeywords.forEach((skill) => {
    if (new RegExp(skill, "i").test(text)) {
      foundSkills.add(skill);
    }
  });

  return Array.from(foundSkills);
}

function extractExperience(text: string): string {
  const patterns = [
    /(\d+)\+?\s*years?\s*of\s*experience/i,
    /(entry.?level|junior|mid.?level|senior|lead)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return "Not specified";
}
