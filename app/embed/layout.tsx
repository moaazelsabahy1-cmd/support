import type { ReactNode } from "react";

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return <div className="h-dvh overflow-hidden bg-background">{children}</div>;
}
