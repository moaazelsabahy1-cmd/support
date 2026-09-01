"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function LandingThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <span className="inline-flex h-10 w-10" aria-hidden />;
  }

  const dark = resolvedTheme === "dark";
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="landing-btn-motion relative"
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform duration-200 dark:-rotate-90 dark:scale-0 motion-reduce:transition-none" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform duration-200 dark:rotate-0 dark:scale-100 motion-reduce:transition-none" />
    </Button>
  );
}
