# T104 - Playwright E2E Tests - Core Flows Pass

Status: PENDING
Depends on: T101, T102, T103
Estimated turns: 50

## Goal
pnpm exec playwright test exits 0 on 5 critical user flows.
Tests run against http://localhost:3000 with test DB seeded.

## Critical Flows

### Flow 1: Sign Up -> Dashboard (tests/e2e/auth.spec.ts)
1. Navigate to /sign-up
2. Fill email + password (Clerk test mode)
3. Assert redirect to /dashboard
4. Assert "No service requests yet"

### Flow 2: Submit Service Request (tests/e2e/service-request.spec.ts)
1. Log in as test filer
2. Navigate to /serve-process
3. Fill: recipient 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045, case TEST-2026-001
4. Upload tests/fixtures/test-document.pdf
5. Assert "vitalik.eth" appears after ENS resolves (600ms debounce)
6. Click "Continue to Payment"
7. Assert payment form loads

### Flow 3: Dashboard (tests/e2e/dashboard.spec.ts)
1. Log in as filer with 3 seeded service requests
2. Assert table shows 3 rows with status badges
3. Click "Download Certificate" on DELIVERED row
4. Assert PDF download (Content-Type: application/pdf)

### Flow 4: Pricing Page (tests/e2e/pricing.spec.ts)
1. Navigate to /pricing unauthenticated
2. Assert service tiers visible
3. Assert "Pay with Crypto" tab visible

### Flow 5: Admin Queue (tests/e2e/admin.spec.ts)
1. Log in as admin
2. Navigate to /admin/queue
3. Click "Mark Delivered"
4. Assert status changes to DELIVERED

## Steps
1. cat playwright.config.ts && ls tests/e2e/ 2>/dev/null
2. mkdir -p tests/e2e tests/fixtures
3. Write seed script: tests/fixtures/seed-test-db.ts
4. Write each spec file
5. pnpm exec playwright test --reporter=list 2>&1
6. Fix failures
7. git add -A && git commit -m "test(T104): playwright e2e - 5 critical flows passing"

## Definition of Done
- pnpm exec playwright test exits 0
- All 5 flows pass
- No page.waitForTimeout() calls (use waitForSelector instead)
- Mark this file Status: DONE and commit
