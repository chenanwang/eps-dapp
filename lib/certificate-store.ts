import { prisma } from "@/lib/db";
import { generateCertificatePdf } from "@/lib/certificate-pdf";

/**
 * Certificate persistence (T-403).
 *
 * The certificate PDF for a notice is generated once and stored base64-encoded
 * in the {@link CertificatePdf} table (`noticeId` unique), then reused on every
 * later download. {@link getOrCreateCertificatePdf} is the entry point the API
 * route calls: it returns the stored bytes if present, otherwise generates,
 * stores, and returns them.
 */

/**
 * Return the certificate PDF bytes for a notice, generating + storing them on
 * first request and reusing the stored copy thereafter.
 *
 * @throws when no service request exists for `noticeId` (surfaced by the
 *   generator's own lookup).
 */
export async function getOrCreateCertificatePdf(
  noticeId: string,
): Promise<Uint8Array> {
  const existing = await prisma.certificatePdf.findUnique({
    where: { noticeId },
    select: { pdfBase64: true },
  });
  if (existing) {
    return Uint8Array.from(Buffer.from(existing.pdfBase64, "base64"));
  }

  const bytes = await generateCertificatePdf(noticeId);
  const pdfBase64 = Buffer.from(bytes).toString("base64");

  // Concurrent first-requests could race on the unique `noticeId`; treat a
  // duplicate write as benign and fall back to the row the winner stored.
  try {
    await prisma.certificatePdf.create({ data: { noticeId, pdfBase64 } });
  } catch {
    const row = await prisma.certificatePdf.findUnique({
      where: { noticeId },
      select: { pdfBase64: true },
    });
    if (row) return Uint8Array.from(Buffer.from(row.pdfBase64, "base64"));
  }

  return bytes;
}
