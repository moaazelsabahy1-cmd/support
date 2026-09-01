"use client";

import { Button } from "@/components/ui/button";
import { openSolvioAssistant } from "@/components/marketing/open-assistant";
import { cn } from "@/lib/utils";

export function OpenAssistantButton({
  children,
  className,
  variant = "outline",
  size,
}: {
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Button type="button" variant={variant} size={size} className={cn(className)} onClick={openSolvioAssistant}>
      {children}
    </Button>
  );
}
