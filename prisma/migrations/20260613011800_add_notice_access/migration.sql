-- First-access logging for public notices (T-402).
-- Adds an optional service-owner contact on the org (the "To" for the
-- first-access alert email), a one-row-per-notice NoticeAccess record (the
-- unique noticeId makes recording the first view idempotent), and a
-- CertificateAddendum carrying the masked "First Viewed" detail the certificate
-- (T-403) regenerates from. Neither table holds document or caption bytes
-- (hard rule #3); the addendum stores only a MASKED ip.

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "ownerEmail" TEXT;

-- CreateTable
CREATE TABLE "NoticeAccess" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateAddendum" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL,
    "viewerIp" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateAddendum_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoticeAccess_noticeId_key" ON "NoticeAccess"("noticeId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateAddendum_noticeId_key" ON "CertificateAddendum"("noticeId");

-- AddForeignKey
ALTER TABLE "NoticeAccess" ADD CONSTRAINT "NoticeAccess_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateAddendum" ADD CONSTRAINT "CertificateAddendum_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
