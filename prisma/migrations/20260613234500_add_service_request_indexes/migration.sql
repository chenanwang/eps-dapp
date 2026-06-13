-- T107 production hardening: index the hot query paths on ServiceRequest.
-- The worker claims rows by status; the dashboard lists an org's requests
-- newest-first. CONCURRENTLY is intentionally omitted so this runs inside the
-- migration transaction; the table is small at this stage.
CREATE INDEX IF NOT EXISTS "ServiceRequest_status_idx" ON "ServiceRequest"("status");
CREATE INDEX IF NOT EXISTS "ServiceRequest_createdAt_idx" ON "ServiceRequest"("createdAt");
CREATE INDEX IF NOT EXISTS "ServiceRequest_orgId_status_createdAt_idx" ON "ServiceRequest"("orgId", "status", "createdAt");
