import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <Link className="text-primary" href="/">Go home</Link>
    </div>
  );
}
