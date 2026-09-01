"use client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-8">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">{process.env.NODE_ENV === "production" ? "Please try again." : error.message}</p>
      <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground" onClick={reset}>
        Retry
      </button>
    </div>
  );
}
