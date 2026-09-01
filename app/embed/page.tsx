import { Suspense } from "react";
import { EmbedWidget } from "@/components/ai/embed-widget";

export const metadata = {
  title: "Assistant",
  robots: { index: false, follow: false },
};

export default function EmbedPage() {
  return (
    <Suspense fallback={<div className="p-3 text-sm text-muted-foreground">Loading…</div>}>
      <EmbedWidget />
    </Suspense>
  );
}
