import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Clerk's server `auth()` so we can assert the helper's behaviour without
// a live session. The mock stands in for the verified session token resolution.
const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
}));

import { requireAuth, UnauthorizedError } from "../lib/auth";

describe("requireAuth", () => {
  beforeEach(() => {
    authMock.mockReset();
  });

  it("throws UnauthorizedError when there is no userId (unauthenticated)", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });
    await expect(requireAuth()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when the user has no active organization", async () => {
    authMock.mockResolvedValue({ userId: "user_123", orgId: null });
    await expect(requireAuth()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("returns userId/orgId derived from the session token", async () => {
    authMock.mockResolvedValue({ userId: "user_123", orgId: "org_456" });
    await expect(requireAuth()).resolves.toEqual({
      userId: "user_123",
      orgId: "org_456",
    });
  });
});
