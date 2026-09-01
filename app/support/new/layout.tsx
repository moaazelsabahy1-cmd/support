import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create a support ticket",
  description: "Submit a Solvio support request without signing in.",
};

export default function SupportNewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
