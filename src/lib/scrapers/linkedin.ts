import axios from "axios";
import { JobListing } from "../firebase";

export async function scrapeLinkedInRSS(): Promise<JobListing[]> {
  try {
    const jobs: JobListing[] = [];

    // LinkedIn RSS feed (limited but free and official)
    // Note: LinkedIn RSS feeds are limited, this is a fallback approach
    const rssUrl =
      "https://www.linkedin.com/jobs/search/?keywords=software%20engineer&location=India&geoId=102713980&trk=guest_homepage-basic_search-bar_search-submit&position=1&pageNum=0";

    // Since LinkedIn heavily restricts scraping, we'll provide a note
    console.log("⚠️ LinkedIn: Full scraping requires enterprise API access");
    console.log(
      "Alternative: Use LinkedIn official job posting RSS feeds or Composio integration"
    );

    return jobs;
  } catch (error) {
    console.error("❌ LinkedIn scraping error:", error);
    return [];
  }
}

function extractSkills(text: string): string[] {
  const skillKeywords = [
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "React",
    "Vue",
    "Node.js",
    "PostgreSQL",
    "MongoDB",
  ];

  const foundSkills = new Set<string>();

  skillKeywords.forEach((skill) => {
    if (new RegExp(skill, "i").test(text)) {
      foundSkills.add(skill);
    }
  });

  return Array.from(foundSkills);
}
