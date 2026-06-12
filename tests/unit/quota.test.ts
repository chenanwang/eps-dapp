import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Prisma mock ----------------------------------------------------------
// Stand-in for the `Subscription` table. `findFirst` returns whatever the test
// stages; `updateMany` simulates the atomic conditional increment (returns the
// number of rows whose `usageCount < limit` guard still held); `update` is the
// rollover reset path.
const findFirstMock = vi.fn<(arg: unknown) => Promise<unknown>>();
const updateManyMock = vi.fn<(arg: unknown) => Promise<{ count: number }>>();
const updateMock = vi.fn<(arg: unknown) => Promise<unknown>>();

vi.mock("@/lib/db", () => ({
  prisma: {
    subscription: {
      findFirst: (arg: unknown) => findFirstMock(arg),
      updateMany: (arg: unknown) => updateManyMock(arg),
      update: (arg: unknown) => updateMock(arg),
    },
  },
}));

import {
  checkAndDecrementQuota,
  QuotaExceededError,
  NoActiveSubscriptionError,
  TIER_QUOTA,
} from "@/lib/quota";

const HOUR = 60 * 60 * 1000;

function activeSub(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    id: "sub_1",
    orgId: "org-internal-1",
    tierId: "tier2",
    status: "ACTIVE",
    periodStart: new Date(now - HOUR),
    periodEnd: new Date(now + 30 * 24 * HOUR), // a month out (not elapsed)
    usageCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  findFirstMock.mockReset();
  updateManyMock.mockReset();
  updateMock.mockReset();
});

describe("checkAndDecrementQuota", () => {
  it("passes and atomically increments when under the limit", async () => {
    findFirstMock.mockResolvedValue(activeSub({ tierId: "tier2", usageCount: 3 }));
    // The conditional increment's guard held -> one row updated.
    updateManyMock.mockResolvedValue({ count: 1 });

    const result = await checkAndDecrementQuota("org_clerk_abc");

    expect(result).toEqual({ usageCount: 4, limit: TIER_QUOTA.tier2 });
    // Increment is guarded by `usageCount < limit`, so it can never overshoot.
    expect(updateManyMock).toHaveBeenCalledWith({
      where: { id: "sub_1", usageCount: { lt: TIER_QUOTA.tier2 } },
      data: { usageCount: { increment: 1 } },
    });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("throws QuotaExceededError when already at the limit", async () => {
    // Tier1 limit is 1; the period already used its single fulfilment.
    findFirstMock.mockResolvedValue(activeSub({ tierId: "tier1", usageCount: 1 }));
    // Guard `usageCount < 1` matches no row -> zero updated.
    updateManyMock.mockResolvedValue({ count: 0 });

    await expect(checkAndDecrementQuota("org_clerk_abc")).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    // Nothing reset; the failed guard is the whole enforcement.
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("resets usageCount and passes when the period has elapsed", async () => {
    const now = Date.now();
    // At the limit, but the period ended an hour ago -> rollover, not rejection.
    findFirstMock.mockResolvedValue(
      activeSub({
        tierId: "tier1",
        usageCount: 1,
        periodStart: new Date(now - 40 * 24 * HOUR),
        periodEnd: new Date(now - HOUR),
      }),
    );
    updateMock.mockResolvedValue({});

    const result = await checkAndDecrementQuota("org_clerk_abc");

    expect(result).toEqual({ usageCount: 1, limit: TIER_QUOTA.tier1 });
    // Rollover resets the meter to 0 and counts this call as the new period's first unit.
    expect(updateMock).toHaveBeenCalledTimes(1);
    const arg = updateMock.mock.calls[0][0] as {
      where: { id: string };
      data: { usageCount: number; periodStart: Date; periodEnd: Date };
    };
    expect(arg.where).toEqual({ id: "sub_1" });
    expect(arg.data.usageCount).toBe(1);
    expect(arg.data.periodEnd.getTime()).toBeGreaterThan(now);
    // Hot-path atomic increment is bypassed on rollover.
    expect(updateManyMock).not.toHaveBeenCalled();
  });

  it("throws NoActiveSubscriptionError when the org has no active subscription", async () => {
    findFirstMock.mockResolvedValue(null);

    await expect(checkAndDecrementQuota("org_clerk_abc")).rejects.toBeInstanceOf(
      NoActiveSubscriptionError,
    );
  });
});
