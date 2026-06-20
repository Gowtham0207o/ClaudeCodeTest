import axios from "axios";
import * as cheerio from "cheerio";
import { JobListing } from "../firebase";

export async function scrapeIndeed(): Promise<JobListing[]> {
  try {
    const jobs: JobListing[] = [];

    // Indeed job search URL (ethical scraping with proper headers)
    const url = "https://www.indeed.com/jobs?q=software+engineer&start=0";

    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);

    // Parse Indeed job listings
    $("div.job_seen_beacon").each((index, element) => {
      const title = $(element).find("h2 a").first().text().trim();
      const company = $(element).find("span.companyName").first().text().trim();
      const location = $(element).find("div.companyLocation").first().text().trim();
      const description = $(element).find("div.job-snippet ul li").text().trim();
      const jobUrl = $(element).find("h2 a").first().attr("href");

      if (title && company) {
        const skills = extractSkills(description);

        const jobListing: JobListing = {
          title,
          company,
          location: location || "Remote",
          requiredSkills: skills,
          jobUrl: jobUrl ? `https://www.indeed.com${jobUrl}` : undefined,
          source: "indeed",
          externalId: `indeed-${index}-${Date.now()}`,
          requiredExperience: extractExperience(description),
        };

        jobs.push(jobListing);
      }
    });

    console.log(`✅ Indeed: Fetched ${jobs.length} jobs`);
    return jobs;
  } catch (error) {
    console.error("❌ Indeed scraping error:", error);
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
    "HTML",
    "CSS",
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
  const match = text.match(/(\d+)\+?\s*years?\s*of\s*experience/i);
  return match ? match[0] : "Not specified";
}
