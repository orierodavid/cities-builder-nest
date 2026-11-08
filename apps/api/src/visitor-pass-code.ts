import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const VERSION = "v1";

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update("cb-nest:visitor-pass-code-encryption:v1\0").update(secret).digest();
}

/** Encrypt a six-digit visitor bearer code before persisting it for later owner retrieval. */
export function encryptVisitorAccessCode(code: string, secret: string): string {
  if (!/^\\d{6}$/.test(code)) throw new Error("Visitor access code must contain six digits.");
  if (!secret) throw new Error("Visitor access-code encryption is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

/** Return null for legacy rows or ciphertext that cannot be authenticated/decrypted. */
export function decryptVisitorAccessCode(ciphertext: string | null, secret: string): string | null {
  if (!ciphertext || !secret) return null;
  const [version, ivText, tagText, encryptedText, extra] = ciphertext.split(".");
  if (version !== VERSION || !ivText || !tagText || !encryptedText || extra !== undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
    return /^\\d{6}$/.test(decrypted) ? decrypted : null;
  } catch {
    return null;
  }
}
