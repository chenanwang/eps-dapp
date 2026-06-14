-- Issue #112: user-scope service requests so a filer with no active Clerk
-- organization can still stage and view their own requests.

-- The owning organization becomes optional (a no-org filer has no billable
-- tenant to connect to). The existing FK already cascades on delete; dropping
-- NOT NULL keeps that intact while permitting a NULL org.
ALTER TABLE "ServiceRequest" ALTER COLUMN "orgId" DROP NOT NULL;

-- The verified Clerk user id of the filer — the new primary owner scope.
ALTER TABLE "ServiceRequest" ADD COLUMN "userId" TEXT;

-- Hot path: the dashboard lists a user's own requests newest-first.
CREATE INDEX "ServiceRequest_userId_idx" ON "ServiceRequest"("userId");
