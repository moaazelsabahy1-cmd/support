import { AuthForm } from "@/components/auth/auth-form";

export default function ResetPage() {
  return (
    <div className="landing flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <AuthForm mode="reset" />
    </div>
  );
}
