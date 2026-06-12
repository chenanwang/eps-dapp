import { requireAuth } from "@/lib/auth";

export default async function DashboardPage() {
  // Rejects unauthenticated requests; userId/orgId are derived server-side only.
  const { userId, orgId } = await requireAuth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold">Dashboard</h1>
      <p className="text-foreground/70">Signed in as {userId}</p>
      <p className="text-foreground/70">Organization {orgId}</p>
    </main>
  );
}
