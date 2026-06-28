import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, initializeFirestore, type Firestore } from "firebase-admin/firestore";

let cached: Firestore | null = null;

function getApp(): App {
  const existing = getApps();
  if (existing.length) return existing[0];

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY in web/.env.local",
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

/**
 * Recursively drop `undefined` values so Firestore writes never throw
 * "Cannot use undefined as a Firestore value". (firebase-admin's
 * initializeFirestore doesn't reliably honour ignoreUndefinedProperties in this
 * version, so we prune at the write sites instead.)
 */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => clean(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = clean(v);
    }
    return out as T;
  }
  return value;
}

export function db(): Firestore {
  if (cached) return cached;
  const app = getApp();
  // Prefer the REST transport over gRPC: it rides plain HTTPS, which works in
  // sandboxed/locked-down networks where gRPC's HTTP/2 stream stalls and hangs.
  try {
    // ignoreUndefinedProperties: pipeline docs carry optional fields (error,
    // confirmation, screenshotUrl…) that are often undefined — don't make the
    // Admin SDK throw on them. (Assigned via a variable so the extra setting
    // isn't rejected by the object-literal excess-property check.)
    const settings = { preferRest: true, ignoreUndefinedProperties: true };
    cached = initializeFirestore(app, settings);
  } catch {
    // initializeFirestore throws if Firestore was already initialized for this app.
    cached = getFirestore(app);
  }
  return cached;
}
