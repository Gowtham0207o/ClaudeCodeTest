import { scrapeAngelList } from "./src/lib/scrapers/angellist.js";
import { scrapeRemoteOK } from "./src/lib/scrapers/remoteok.js";
import { scrapeIndeed } from "./src/lib/scrapers/indeed.js";
import { scrapeGlassdoor } from "./src/lib/scrapers/glassdoor.js";
import { scrapeLinkedInRSS } from "./src/lib/scrapers/linkedin.js";
import { scrapeInstaHyre } from "./src/lib/scrapers/instahyre.js";

async function testScrapers() {
  console.log("🚀 Testing Job Scrapers - All Sources\n");

  try {
    console.log("📡 Testing AngelList scraper...");
    const angelListJobs = await scrapeAngelList();
    console.log(`✅ AngelList returned ${angelListJobs.length} jobs\n`);

    console.log("📡 Testing RemoteOK scraper...");
    const remoteOKJobs = await scrapeRemoteOK();
    console.log(`✅ RemoteOK returned ${remoteOKJobs.length} jobs\n`);

    console.log("📡 Testing Indeed scraper...");
    const indeedJobs = await scrapeIndeed();
    console.log(`✅ Indeed returned ${indeedJobs.length} jobs\n`);

    console.log("📡 Testing Glassdoor scraper...");
    const glassdoorJobs = await scrapeGlassdoor();
    console.log(`✅ Glassdoor returned ${glassdoorJobs.length} jobs\n`);

    console.log("📡 Testing LinkedIn scraper...");
    const linkedInJobs = await scrapeLinkedInRSS();
    console.log(`✅ LinkedIn returned ${linkedInJobs.length} jobs\n`);

    console.log("📡 Testing InstaHyre scraper...");
    const instaHyreJobs = await scrapeInstaHyre();
    console.log(`✅ InstaHyre returned ${instaHyreJobs.length} jobs\n`);

    // Summary
    const totalJobs =
      angelListJobs.length +
      remoteOKJobs.length +
      indeedJobs.length +
      glassdoorJobs.length +
      linkedInJobs.length +
      instaHyreJobs.length;

    console.log("📊 Summary:");
    console.log(`  • AngelList: ${angelListJobs.length} jobs`);
    console.log(`  • RemoteOK: ${remoteOKJobs.length} jobs`);
    console.log(`  • Indeed: ${indeedJobs.length} jobs`);
    console.log(`  • Glassdoor: ${glassdoorJobs.length} jobs`);
    console.log(`  • LinkedIn: ${linkedInJobs.length} jobs`);
    console.log(`  • InstaHyre: ${instaHyreJobs.length} jobs`);
    console.log(`\n  Total: ${totalJobs} jobs fetched`);

    // Show sample jobs
    if (angelListJobs.length > 0) {
      console.log("\n📋 Sample job from AngelList:");
      console.log(JSON.stringify(angelListJobs[0], null, 2));
    }

    if (instaHyreJobs.length > 0) {
      console.log("\n📋 Sample job from InstaHyre:");
      console.log(JSON.stringify(instaHyreJobs[0], null, 2));
    }
  } catch (error) {
    console.error("❌ Error during scraping:", error);
    process.exit(1);
  }
}

testScrapers();
