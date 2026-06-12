-- Add a failure-reason column to ServiceRequest so a terminally failed delivery
-- (send error, memo mismatch, timeout) can carry diagnostic context that the
-- dashboard surfaces on FAILED rows (T-306). Nullable: only failed rows set it.
-- Holds error/diagnostic text only — never document or caption bytes (hard rule #3).
ALTER TABLE "ServiceRequest" ADD COLUMN "failureReason" TEXT;
