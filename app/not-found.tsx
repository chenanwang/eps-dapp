import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">404 - Page Not Found</h1>
      <p className="max-w-md text-foreground/70">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link
        href="/"
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background transition-opacity hover:opacity-90"
      >
        Back to home
      </Link>
    </main>
  );
}
