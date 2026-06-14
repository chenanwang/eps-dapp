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

/**
 * Auth context for routes scoped to the user rather than an organization. The
 * `orgId` is whatever active org the session carries, or `null` when the user
 * has none — both are valid (see {@link requireUser}).
 */
export interface UserAuthContext {
  userId: string;
  orgId: string | null;
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
 * Resolve the current request's auth context for USER-scoped routes. Requires
 * an authenticated user but NOT an active organization — `orgId` is returned as
 * `null` when the session has no active org. Use this where work belongs to the
 * individual filer rather than a billable org tenant (e.g. staging a service
 * request, issue #112), so a brand-new user with no organization is not blocked.
 *
 * `userId`/`orgId` come from the verified Clerk session token only — never from
 * client input.
 *
 * @throws {UnauthorizedError} when there is no authenticated user.
 */
export async function requireUser(): Promise<UserAuthContext> {
  const { userId, orgId } = await auth();

  if (!userId) {
    throw new UnauthorizedError();
  }

  return { userId, orgId: orgId ?? null };
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
