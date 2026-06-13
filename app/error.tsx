"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-foreground/70">
        An unexpected error occurred. You can try again, and if the problem
        persists please contact support.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
