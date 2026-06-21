#!/usr/bin/env node

/**
 * Quick validation that all critical pieces are in place.
 * Run: node scripts/validate-setup.js
 */

const fs = require("fs");
const path = require("path");

const checks = [
  {
    name: "Playwright installed",
    test: () => fs.existsSync(path.join(__dirname, "../node_modules/playwright")),
    fix: "npm install playwright && npx playwright install chromium",
  },
  {
    name: "Firebase Admin SDK installed",
    test: () => fs.existsSync(path.join(__dirname, "../node_modules/firebase-admin")),
    fix: "npm install firebase-admin",
  },
  {
    name: ".env.local exists",
    test: () => fs.existsSync(path.join(__dirname, "../.env.local")),
    fix: "Copy web/.env.local template or check git-ignored file",
  },
  {
    name: "CRON_SECRET in .env.local",
    test: () => {
      const env = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf-8");
      return env.includes("CRON_SECRET=");
    },
    fix: "Add CRON_SECRET=jobsync_cron_secret_admin_2026 to web/.env.local",
  },
  {
    name: "Firebase credentials in .env.local",
    test: () => {
      const env = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf-8");
      return env.includes("FIREBASE_ADMIN_PRIVATE_KEY=");
    },
    fix: "Ensure FIREBASE_ADMIN_* vars are in web/.env.local",
  },
  {
    name: "automation.live is true",
    test: () => {
      const profile = fs.readFileSync(path.join(__dirname, "../lib/profile.ts"), "utf-8");
      return profile.includes("live: true");
    },
    fix: "Run: Edit web/lib/profile.ts and set live: true",
  },
  {
    name: "Role filtering is strict",
    test: () => {
      const scrapers = fs.readFileSync(path.join(__dirname, "../lib/scrapers/index.ts"), "utf-8");
      return scrapers.includes("backend|frontend") && scrapers.includes("developer|engineer");
    },
    fix: "Check web/lib/scrapers/index.ts isRelevantRole() function",
  },
];

console.log("\n🔍 JobSync Setup Validation\n");

let passed = 0;
let failed = 0;

for (const check of checks) {
  try {
    const result = check.test();
    if (result) {
      console.log(`✅ ${check.name}`);
      passed++;
    } else {
      console.log(`❌ ${check.name}`);
      console.log(`   → ${check.fix}\n`);
      failed++;
    }
  } catch (err) {
    console.log(`❌ ${check.name} (error: ${err.message})`);
    console.log(`   → ${check.fix}\n`);
    failed++;
  }
}

console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

if (failed === 0) {
  console.log("✨ All checks passed! Ready to test.\n");
  console.log("Next steps:");
  console.log("  npm run dev");
  console.log("  curl http://localhost:3000/api/admin/test\n");
  process.exit(0);
} else {
  console.log("⚠️  Please fix the issues above.\n");
  process.exit(1);
}
