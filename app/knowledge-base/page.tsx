import Link from "next/link";
import { listArticlesAction } from "@/actions/knowledge";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Knowledge Base",
  description: "Help articles for Solvio customers",
};

export const dynamic = "force-dynamic";

export default async function KbPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const data = await listArticlesAction({ q, publishedOnly: true }) as {
    items: { _id: string; slug: string; title: string; excerpt: string; categoryId: string; featured: boolean }[];
    categories: { _id: string; name: string }[];
  };
  const { items, categories } = data;
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Knowledge Base</h1>
      <form className="mt-6">
        <input name="q" defaultValue={q} placeholder="Search articles" className="h-11 w-full rounded-xl border border-border bg-card px-4" />
      </form>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {categories.map((c) => (
          <div key={String(c._id)} className="rounded-2xl border p-4">
            <h2 className="font-semibold">{c.name}</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {items
                .filter((a) => String(a.categoryId) === String(c._id))
                .map((a) => (
                <li key={a.slug}><Link className="text-primary" href={`/knowledge-base/${a.slug}`}>{a.title}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-10">
        <h2 className="font-semibold">Featured</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-2">
          {items.filter((a: { featured: boolean }) => a.featured).map((a: { slug: string; title: string; excerpt: string }) => (
            <li key={a.slug} className="rounded-2xl border p-4">
              <Link href={`/knowledge-base/${a.slug}`} className="font-medium">{a.title}</Link>
              <p className="mt-1 text-sm text-muted-foreground">{a.excerpt}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
