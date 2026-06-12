import { auth } from "@clerk/nextjs/server";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: no active session") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface AuthContext {
  userId: string;
  orgId: string;
}

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
