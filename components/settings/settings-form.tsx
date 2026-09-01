"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { updateProfileAction } from "@/actions/users";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { PushToggle } from "@/components/pwa/push-toggle";

export function SettingsForm({ isAdmin }: { isAdmin: boolean }) {
  const [admin, setAdmin] = useState<{
    appName: string;
    branding: { primaryColor: string };
    widget: {
      greeting: string;
      allowedOrigins: string[];
      publicKey?: string;
      title?: string;
      assistantName?: string;
      language?: string;
      logoUrl?: string;
    };
    embedSnippet?: string;
    integrations: Record<string, boolean>;
    openaiChatModel?: string;
    openrouterModel?: string;
  } | null>(null);
  useEffect(() => {
    if (isAdmin) fetch("/api/settings").then((r) => r.json()).then((j) => j.success && setAdmin(j.data));
  }, [isAdmin]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Card>
        <h2 className="font-semibold">Profile</h2>
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await updateProfileAction({ name: String(f.get("name")), phone: String(f.get("phone")) });
            toast.success("Profile saved");
          }}
        >
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" />
          </div>
          <Button type="submit">Save profile</Button>
        </form>
      </Card>
      <Card>
        <h2 className="font-semibold">Appearance</h2>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </Card>
      <Card>
        <h2 className="font-semibold">Notifications</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          In-app notifications are always on. Enable push if VAPID keys are configured.
        </p>
        <PushToggle />
      </Card>
      {isAdmin && admin ? (
        <Card>
          <h2 className="font-semibold">Admin · General and integrations</h2>
          <p className="mt-2 text-sm text-muted-foreground">Secrets never leave the server. Status only:</p>
          {(admin.openrouterModel || admin.openaiChatModel) ? (
            <p className="mt-2 text-sm text-muted-foreground">Chat model: {admin.openrouterModel || admin.openaiChatModel}</p>
          ) : null}
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {Object.entries(admin.integrations).map(([k, v]) => (
              <li key={k}>
                {k}: {v ? "configured" : "fallback"}
              </li>
            ))}
          </ul>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              await fetch("/api/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  appName: f.get("appName"),
                  branding: { primaryColor: f.get("primaryColor") },
                  widget: {
                    greeting: f.get("greeting"),
                    title: f.get("widgetTitle"),
                    assistantName: f.get("assistantName"),
                    language: f.get("language"),
                    logoUrl: f.get("logoUrl"),
                    allowedOrigins: String(f.get("origins") || "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                }),
              });
              toast.success("Settings saved");
            }}
          >
            <div>
              <Label>App name</Label>
              <Input name="appName" defaultValue={admin.appName} />
            </div>
            <div>
              <Label>Primary color</Label>
              <Input name="primaryColor" defaultValue={admin.branding.primaryColor} />
            </div>
            <div>
              <Label>Widget title</Label>
              <Input name="widgetTitle" defaultValue={admin.widget.title || "Assistant"} />
            </div>
            <div>
              <Label>Assistant name</Label>
              <Input name="assistantName" defaultValue={admin.widget.assistantName || "Assistant"} />
            </div>
            <div>
              <Label>Welcome message</Label>
              <Input name="greeting" defaultValue={admin.widget.greeting} />
            </div>
            <div>
              <Label>Language</Label>
              <Input name="language" defaultValue={admin.widget.language || "en"} />
            </div>
            <div>
              <Label>Logo URL</Label>
              <Input name="logoUrl" defaultValue={admin.widget.logoUrl || ""} />
            </div>
            <div>
              <Label>Allowed origins (comma-separated, exact origins)</Label>
              <Input name="origins" defaultValue={admin.widget.allowedOrigins?.join(",") || ""} />
            </div>
            <div>
              <Label>Public widget key</Label>
              <Input readOnly value={admin.widget.publicKey || ""} />
            </div>
            <div>
              <Label>Embed snippet</Label>
              <textarea
                readOnly
                className="mt-1 min-h-20 w-full rounded-md border bg-muted p-2 font-mono text-xs"
                value={admin.embedSnippet || ""}
              />
            </div>
            <Button type="submit">Save admin settings</Button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
