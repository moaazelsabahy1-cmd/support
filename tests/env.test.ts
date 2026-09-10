import { describe, expect, it } from "vitest";
import { LOCAL_DATABASE_URL, parseEnv } from "../lib/env";

describe("parseEnv", () => {
  it("accepts local development defaults", () => {
    const env = parseEnv({
      NODE_ENV: "development",
      DATABASE_URL: LOCAL_DATABASE_URL,
      BETTER_AUTH_SECRET: "dev-secret-change-me-32chars-min",
    } as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toBe(LOCAL_DATABASE_URL);
  });

  it("rejects production with the local database URL", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        DATABASE_URL: LOCAL_DATABASE_URL,
        BETTER_AUTH_SECRET: "production-secret-change-me-32ch",
      } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });

  it("skips the local DATABASE_URL check during next build", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      NEXT_PHASE: "phase-production-build",
      DATABASE_URL: LOCAL_DATABASE_URL,
      BETTER_AUTH_SECRET: "production-secret-change-me-32ch",
    } as NodeJS.ProcessEnv);
    expect(env.NODE_ENV).toBe("production");
  });

  it("rejects production without DATABASE_URL", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        BETTER_AUTH_SECRET: "production-secret-change-me-32ch",
      } as NodeJS.ProcessEnv),
    ).toThrow(/DATABASE_URL/);
  });

  it("accepts production postgres URL", () => {
    const env = parseEnv({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://solvio:prod@db.internal:5432/solvio",
      BETTER_AUTH_SECRET: "production-secret-change-me-32ch",
      BETTER_AUTH_URL: "https://chatens.com",
      NEXT_PUBLIC_APP_URL: "https://chatens.com",
    } as NodeJS.ProcessEnv);
    expect(env.DATABASE_URL).toContain("db.internal");
  });
});
