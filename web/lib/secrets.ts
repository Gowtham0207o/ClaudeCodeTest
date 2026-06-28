import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { JobSource } from "./types";

/**
 * Secrets helper for the apply engine.
 *
 * Board login credentials (LinkedIn/Indeed/Workday) are read from environment
 * variables — never persisted in Firestore in plaintext. The AES-256-GCM
 * encrypt/decrypt helpers exist for when credentials need to be stored at rest
 * (e.g. saved from the settings UI into Firestore): they're sealed with a key
 * derived from CREDENTIAL_KEY so a DB leak alone never exposes passwords.
 */

export interface BoardCredentials {
  username: string;
  password: string;
}

function key(): Buffer {
  const secret = process.env.CREDENTIAL_KEY;
  if (!secret) {
    throw new Error(
      "CREDENTIAL_KEY is not set — required to encrypt/decrypt stored board credentials.",
    );
  }
  // Derive a 32-byte key from whatever the user set (any length).
  return scryptSync(secret, "jobsync.credential.salt.v1", 32);
}

/** Encrypt a plaintext secret → "iv:tag:ciphertext" (all base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

/** Decrypt a value produced by encryptSecret. */
export function decryptSecret(sealed: string): string {
  const [ivB64, tagB64, dataB64] = sealed.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Malformed sealed secret.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Per-board login credentials, from env. Returns null when the board doesn't
 * need a login or none are configured (the adapter then runs unauthenticated /
 * dry-run). Env names: LINKEDIN_EMAIL/LINKEDIN_PASSWORD, INDEED_EMAIL/…, etc.
 */
export function getBoardCredentials(board: JobSource | string): BoardCredentials | null {
  const prefix = board.toUpperCase();
  const username = process.env[`${prefix}_EMAIL`] || process.env[`${prefix}_USERNAME`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!username || !password) return null;
  return { username, password };
}
