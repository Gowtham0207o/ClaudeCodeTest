import fs from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { initializeFirestore } from "firebase-admin/firestore";

// Parse web/.env.local manually (no dotenv dep).
const env: Record<string, string> = {};
for (const line of fs.readFileSync(new URL("./.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
}

(async () => {
  try {
    const app = initializeApp({
      credential: cert({
        projectId: env.FIREBASE_PROJECT_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    const db = initializeFirestore(app, { preferRest: true });
    const result = await Promise.race([
      db.doc("profile/me").get().then((s) => `OK — doc exists=${s.exists}`),
      new Promise<string>((_, rej) => setTimeout(() => rej(new Error("timed out after 20s")), 20000)),
    ]);
    console.log(result);
  } catch (e) {
    console.error("ERR:", e instanceof Error ? e.message : e);
  } finally {
    process.exit(0);
  }
})();
