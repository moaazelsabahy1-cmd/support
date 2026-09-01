import Link from "next/link";

export default function KbLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="font-semibold">Solvio</Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/knowledge-base">Articles</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
