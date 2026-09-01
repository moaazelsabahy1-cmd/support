"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { signIn, signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";

export function AuthForm({ mode }: { mode: "login" | "register" | "forgot" | "reset" }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const form = new FormData(e.currentTarget);
    try {
      if (mode === "login") {
        const res = await signIn.email({
          email: String(form.get("email")),
          password: String(form.get("password")),
        });
        if (res.error) throw new Error(res.error.message);
        router.push("/dashboard");
        router.refresh();
      } else if (mode === "register") {
        const res = await signUp.email({
          name: String(form.get("name")),
          email: String(form.get("email")),
          password: String(form.get("password")),
        });
        if (res.error) throw new Error(res.error.message);
        toast.success("Account created");
        router.push("/dashboard");
      } else if (mode === "forgot") {
        const res = await fetch("/api/auth/forget-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: form.get("email"), redirectTo: "/reset-password" }),
        });
        if (!res.ok) throw new Error("Could not send reset email");
        toast.success("If that email exists, a reset link was sent");
      } else {
        const token = new URLSearchParams(window.location.search).get("token") || "";
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: form.get("password"), token }),
        });
        if (!res.ok) throw new Error("Reset failed");
        toast.success("Password updated");
        router.push("/login");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setPending(false);
    }
  }

  async function signInDemo(account: (typeof DEMO_ACCOUNTS)[number]) {
    setEmail(account.email);
    setPassword(account.password);
    setPending(true);
    try {
      const res = await signIn.email({ email: account.email, password: account.password });
      if (res.error) throw new Error(res.error.message);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setPending(false);
    }
  }

  const login = mode === "login";

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8">
      <h1 className="text-2xl font-bold tracking-tight">
        {login && "Sign in to your account"}
        {mode === "register" && "Create your Solvio account"}
        {mode === "forgot" && "Reset your password"}
        {mode === "reset" && "Choose a new password"}
      </h1>
      {login ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email and password to access your support tickets
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode === "register" ? (
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required />
          </div>
        ) : null}
        {mode !== "reset" ? (
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              {...(login ? { value: email, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value) } : {})}
            />
          </div>
        ) : null}
        {mode !== "forgot" ? (
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete={login ? "current-password" : "new-password"}
              {...(login ? { value: password, onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value) } : {})}
            />
          </div>
        ) : null}
        {login ? (
          <div className="text-right">
            <Link className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" href="/forgot-password">
              Forgot password
            </Link>
          </div>
        ) : null}
        <Button className="w-full" disabled={pending} type="submit">
          {pending ? "Please wait…" : login ? "Sign in" : "Continue"}
        </Button>
      </form>
      {login ? (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link className="text-primary hover:underline" href="/register">
              Sign up
            </Link>
          </p>
          <div className="mt-6 grid gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Demo accounts</p>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                disabled={pending}
                onClick={() => signInDemo(account)}
                className="rounded-xl border border-border bg-accent px-4 py-3 text-left text-sm transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <span className="font-medium text-foreground">{account.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{account.email}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          <Link className="text-primary" href="/login">
            Back to sign in
          </Link>
        </p>
      )}
    </div>
  );
}
