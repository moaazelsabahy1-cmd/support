import { AuthForm } from "@/components/auth/auth-form";
import { Bot } from "lucide-react";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="landing flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
      <Link href="/" className="mb-6 flex items-center gap-2 font-semibold tracking-tight">
        <Bot className="h-5 w-5 text-primary" /> Solvio
      </Link>
      <AuthForm mode="register" />
    </div>
  );
}
