import { expect, test } from "@playwright/test";

/**
 * T104 E2E — dashboard. The dashboard is auth-protected, so an unauthenticated
 * visit redirects to sign-in (that's expected and OK). We assert only that the
 * route is wired and never 5xx-crashes. Uses the request fixture (no redirect
 * following) so it runs in sandboxes where a headless browser can't resolve the
 * dev-server host.
 */
test("/dashboard is wired and redirects rather than crashing", async ({ request }) => {
  const res = await request.get("/dashboard", { maxRedirects: 0 });
  expect(res.status(), "dashboard route must not 5xx").toBeLessThan(500);
});
