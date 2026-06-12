-- Add the served-document SHA-256 to ServiceRequest so the worker can build the
-- on-chain memo (`${sha256}|${noticeToken}|${serviceId}`) at delivery and verify
-- it on the post-confirm re-read (T-305). Nullable: rows staged before this
-- column existed simply carry no hash.
ALTER TABLE "ServiceRequest" ADD COLUMN "documentSha256" TEXT;
