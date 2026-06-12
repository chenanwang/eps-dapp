import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Confidential-document storage (CLAUDE.md hard rule #3): every uploaded legal
 * filing is encrypted at rest with AES-256-GCM and written to a PRIVATE
 * S3/MinIO object. Only key references (object key, iv, auth tag) and the
 * plaintext SHA-256 are persisted in Postgres — never the document bytes, and
 * never the encryption key. Document bytes are never logged.
 */

const ALGORITHM = "aes-256-gcm";
/** AES-256 key length. */
const KEY_BYTES = 32;
/** Standard 96-bit nonce for GCM. */
const IV_BYTES = 12;

/** Metadata returned for a stored document — the only thing persisted in the DB. */
export interface StoredDocument {
  /** Private object key inside the MinIO bucket. */
  objectKey: string;
  /** SHA-256 of the *plaintext* document, hex. Stable across re-reads. */
  sha256: string;
  /** AES-256-GCM initialization vector, hex. */
  iv: string;
  /** AES-256-GCM authentication tag, hex. */
  authTag: string;
}

/**
 * Load and validate the 32-byte AES key from `STORAGE_ENCRYPTION_KEY`. The env
 * value is hex (64 chars) or base64; either way it must decode to exactly 32
 * bytes. Throws (fail loud) if unset or the wrong length — we never silently
 * fall back to a weak/empty key.
 */
function loadKey(): Buffer {
  const raw = process.env.STORAGE_ENCRYPTION_KEY ?? "";
  if (!raw) {
    throw new Error(
      "STORAGE_ENCRYPTION_KEY is not set. Provide a 32-byte key as hex (64 chars) or base64.",
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `STORAGE_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (got ${key.length}). Use a 32-byte key as hex or base64.`,
    );
  }
  return key;
}

let s3Client: S3Client | null = null;

/**
 * Lazily construct a shared S3 client pointed at the MinIO endpoint.
 * `forcePathStyle` is required for MinIO (it doesn't do virtual-hosted-style
 * bucket subdomains). Region is irrelevant to MinIO but the SDK requires one.
 */
function getS3(): S3Client {
  if (s3Client) {
    return s3Client;
  }
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKeyId = process.env.MINIO_ACCESS_KEY;
  const secretAccessKey = process.env.MINIO_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "MinIO is not configured. Set MINIO_ENDPOINT, MINIO_ACCESS_KEY and MINIO_SECRET_KEY.",
    );
  }
  s3Client = new S3Client({
    endpoint,
    region: process.env.MINIO_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return s3Client;
}

/** Bucket holding encrypted documents (defaults to the canonical `eps-documents`). */
function bucket(): string {
  return process.env.MINIO_BUCKET ?? "eps-documents";
}

/**
 * Encrypt `buf` with AES-256-GCM and store it as a private MinIO object.
 *
 * - Computes the SHA-256 of the *plaintext* (stable identity for re-read checks).
 * - Generates a fresh random IV per document (never reused with the same key).
 * - Writes the ciphertext with no public ACL — the object inherits the private
 *   bucket policy and is not publicly readable.
 *
 * Returns only key references + hash; the plaintext and key never leave memory.
 */
export async function storeDocument(buf: Buffer): Promise<StoredDocument> {
  const key = loadKey();
  const sha256 = createHash("sha256").update(buf).digest("hex");

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(buf), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const objectKey = `documents/${randomUUID()}`;
  await getS3().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: objectKey,
      Body: ciphertext,
      ContentType: "application/octet-stream",
      // No ACL is set: the object stays private under the bucket's default
      // policy (MinIO buckets are private unless explicitly opened).
    }),
  );

  return {
    objectKey,
    sha256,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

/**
 * Decrypt ciphertext produced by {@link storeDocument} back to the original
 * plaintext. GCM verifies the auth tag, so tampered ciphertext throws.
 */
export function decryptDocument(
  ciphertext: Buffer,
  ivHex: string,
  authTagHex: string,
): Buffer {
  const key = loadKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
