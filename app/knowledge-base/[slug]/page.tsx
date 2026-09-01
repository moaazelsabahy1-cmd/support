import { getArticleBySlugAction } from "@/actions/knowledge";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type ArticlePayload = {
  article: { title: string; excerpt: string; body: string };
  related: { slug: string; title: string }[];
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { article } = (await getArticleBySlugAction(slug)) as ArticlePayload;
    return { title: article.title, description: article.excerpt };
  } catch {
    return { title: "Article" };
  }
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let payload: ArticlePayload | null = null;
  try {
    payload = (await getArticleBySlugAction(slug)) as ArticlePayload;
  } catch {
    payload = null;
  }
  if (!payload) notFound();
  const { article, related } = payload;
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-4xl font-semibold">{article.title}</h1>
      <p className="mt-3 text-muted-foreground">{article.excerpt}</p>
      <div className="prose mt-8 max-w-none whitespace-pre-wrap dark:prose-invert">{article.body}</div>
      <h2 className="mt-10 font-semibold">Related</h2>
      <ul className="mt-3 space-y-1">
        {related.map((r) => (
          <li key={r.slug}>
            <Link className="text-primary" href={`/knowledge-base/${r.slug}`}>
              {r.title}
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
