"use client";

import { Button } from "@/components/ui/button";
import { openSolvioHumanHandoff } from "@/components/marketing/open-assistant";
import { cn } from "@/lib/utils";

export function OpenHumanHandoffButton({
  children = "Talk to Human",
  className,
  variant = "outline",
  size,
}: {
  children?: React.ReactNode;
  className?: string;
  variant?: "default" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
}) {
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(className)}
      data-talk-to-human
      onClick={openSolvioHumanHandoff}
    >
      {children}
    </Button>
  );
}
