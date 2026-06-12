-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('STAGED', 'IN_PROGRESS', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "caseCaption" TEXT NOT NULL,
    "plaintiffName" TEXT NOT NULL,
    "defendantName" TEXT NOT NULL,
    "recipientWallet" TEXT NOT NULL,
    "courtOrderFlag" BOOLEAN NOT NULL DEFAULT false,
    "attestedAt" TIMESTAMP(3) NOT NULL,
    "noticeToken" TEXT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'STAGED',
    "txSignature" TEXT,
    "slot" BIGINT,
    "blockTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_noticeToken_key" ON "ServiceRequest"("noticeToken");

-- CreateIndex
CREATE INDEX "ServiceRequest_orgId_idx" ON "ServiceRequest"("orgId");

-- AddForeignKey
ALTER TABLE "ServiceRequest" ADD CONSTRAINT "ServiceRequest_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
