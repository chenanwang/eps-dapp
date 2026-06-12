import { auth } from "@clerk/nextjs/server";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: no active session") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden: requires organization admin role") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export interface AuthContext {
  userId: string;
  orgId: string;
}

/** Clerk role slug for an organization administrator. */
export const ORG_ADMIN_ROLE = "org:admin";

/**
 * Resolve the current request's auth context from the Clerk session token,
 * verified server-side. `userId` and `orgId` come from the token only — never
 * from client-supplied input. Throws {@link UnauthorizedError} when there is no
 * authenticated user, or when the user has no active organization.
 *
 * Use this in API route handlers and server components that must not run for
 * unauthenticated requests.
 */
export async function requireAuth(): Promise<AuthContext> {
  const { userId, orgId } = await auth();

  if (!userId) {
    throw new UnauthorizedError();
  }
  if (!orgId) {
    throw new UnauthorizedError("Unauthorized: no active organization");
  }

  return { userId, orgId };
}

/**
 * Like {@link requireAuth}, but additionally requires the caller to hold the
 * `org:admin` role in their active organization. The role is read from the
 * verified Clerk session token via `has()` — never from client input.
 *
 * @throws {UnauthorizedError} when there is no authenticated user / active org.
 * @throws {ForbiddenError} when the user is authenticated but not an org admin.
 */
export async function requireOrgAdmin(): Promise<AuthContext> {
  const { userId, orgId, has } = await auth();

  if (!userId) {
    throw new UnauthorizedError();
  }
  if (!orgId) {
    throw new UnauthorizedError("Unauthorized: no active organization");
  }
  if (!has({ role: ORG_ADMIN_ROLE })) {
    throw new ForbiddenError();
  }

  return { userId, orgId };
}
