import { expect, test } from "@playwright/test";

/**
 * T104 E2E — authentication boundary. There is no standalone `/sign-in` page in
 * this app (Clerk is mounted via middleware), so we assert the property that
 * actually matters: the protected dashboard is NOT served to an unauthenticated
 * caller. Clerk's `auth.protect()` redirects such a request rather than
 * returning the dashboard HTML. We use the request fixture with no redirect
 * following so we can observe the redirect directly (and so the suite runs in
 * sandboxes where a headless browser can't resolve the dev-server host).
 */
test("unauthenticated request to a protected route is redirected, not served", async ({ request }) => {
  const res = await request.get("/dashboard", { maxRedirects: 0 });
  // Either a redirect to Clerk sign-in (3xx) or an auth challenge — never a
  // 200 that leaks the dashboard, and never a 5xx crash.
  expect(res.status()).toBeGreaterThanOrEqual(300);
  expect(res.status()).toBeLessThan(500);
});

test("landing page is served without a server error", async ({ request }) => {
  const res = await request.get("/");
  expect(res.status(), "landing page must not 5xx").toBeLessThan(500);
});
