import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash, randomBytes } from "node:crypto";

// Capture the ciphertext that storeDocument PUTs so the test can decrypt it
// without touching a real MinIO server. The S3 client is mocked at module load.
const sent: Array<{ input: { Bucket?: string; Key?: string; Body?: unknown; ACL?: unknown } }> = [];

vi.mock("@aws-sdk/client-s3", () => ({
  // PutObjectCommand just wraps its input; we read it back from the spy.
  PutObjectCommand: class {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  S3Client: class {
    async send(command: { input: { Bucket?: string; Key?: string; Body?: unknown; ACL?: unknown } }) {
      sent.push(command);
      return {};
    }
  },
}));

// A 32-byte key as hex (64 chars). Test-only value, never a real key.
const TEST_KEY = randomBytes(32).toString("hex");

describe("lib/storage", () => {
  beforeEach(() => {
    sent.length = 0;
    process.env.STORAGE_ENCRYPTION_KEY = TEST_KEY;
    process.env.MINIO_ENDPOINT = "http://localhost:9000";
    process.env.MINIO_ACCESS_KEY = "minioadmin";
    process.env.MINIO_SECRET_KEY = "minioadmin";
    process.env.MINIO_BUCKET = "eps-documents";
    vi.resetModules();
  });

  it("encrypts to a private object and round-trips back to identical bytes", async () => {
    const { storeDocument, decryptDocument } = await import("../lib/storage");

    const plaintext = Buffer.from("CONFIDENTIAL legal filing — §1746 declaration\n");
    const result = await storeDocument(plaintext);

    // SHA-256 is over the PLAINTEXT and stable.
    expect(result.sha256).toBe(createHash("sha256").update(plaintext).digest("hex"));
    expect(result.objectKey).toMatch(/^documents\//);
    expect(result.iv).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV, hex
    expect(result.authTag).toMatch(/^[0-9a-f]{32}$/); // 16-byte GCM tag, hex

    // Exactly one private PUT to the configured bucket, with no public ACL.
    expect(sent).toHaveLength(1);
    const put = sent[0].input;
    expect(put.Bucket).toBe("eps-documents");
    expect(put.Key).toBe(result.objectKey);
    expect(put.ACL).toBeUndefined();

    // The stored bytes are ciphertext, not the plaintext.
    const ciphertext = put.Body as Buffer;
    expect(ciphertext.equals(plaintext)).toBe(false);

    // Decrypting the stored object yields the original bytes exactly.
    const recovered = decryptDocument(ciphertext, result.iv, result.authTag);
    expect(recovered.equals(plaintext)).toBe(true);
  });

  it("rejects a tampered ciphertext via the GCM auth tag", async () => {
    const { storeDocument, decryptDocument } = await import("../lib/storage");

    const result = await storeDocument(Buffer.from("original"));
    const ciphertext = Buffer.from(sent[0].input.Body as Buffer);
    ciphertext[0] ^= 0xff; // flip a byte

    expect(() => decryptDocument(ciphertext, result.iv, result.authTag)).toThrow();
  });

  it("throws if STORAGE_ENCRYPTION_KEY is missing or wrong length", async () => {
    const { storeDocument } = await import("../lib/storage");

    delete process.env.STORAGE_ENCRYPTION_KEY;
    await expect(storeDocument(Buffer.from("x"))).rejects.toThrow(/STORAGE_ENCRYPTION_KEY/);

    process.env.STORAGE_ENCRYPTION_KEY = "abcd"; // 2 bytes, too short
    await expect(storeDocument(Buffer.from("x"))).rejects.toThrow(/32 bytes/);
  });
});
