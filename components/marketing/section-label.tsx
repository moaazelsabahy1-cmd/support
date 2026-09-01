import { cn } from "@/lib/utils";

export function SectionLabel({ children, className }: { children: string; className?: string }) {
  return (
    <p
      className={cn(
        "mx-auto mb-4 w-fit rounded-full border border-border px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}
