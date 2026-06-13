-- CreateTable
CREATE TABLE "CertificatePdf" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "pdfBase64" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificatePdf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CertificatePdf_noticeId_key" ON "CertificatePdf"("noticeId");

-- AddForeignKey
ALTER TABLE "CertificatePdf" ADD CONSTRAINT "CertificatePdf_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "ServiceRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
