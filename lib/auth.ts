import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { newId } from "@/lib/id";

function originVariants(...urls: string[]) {
  const out = new Set<string>();
  for (const url of urls) {
    if (!url) continue;
    out.add(url);
    try {
      const u = new URL(url);
      out.add(u.origin);
      if (u.hostname.startsWith("www.")) {
        out.add(`${u.protocol}//${u.hostname.slice(4)}`);
      } else if (u.hostname.includes(".")) {
        out.add(`${u.protocol}//www.${u.hostname}`);
      }
    } catch {
      /* ignore invalid */
    }
  }
  return [...out];
}

const env = getEnv();

export const auth = betterAuth({
  appName: "Solvio",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  advanced: {
    database: {
      generateId: () => newId(),
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      const { sendEmail } = await import("@/lib/email");
      await sendEmail({
        to: user.email,
        subject: "Reset your Solvio password",
        template: "password-reset",
        data: { name: user.name, url },
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "CUSTOMER",
        input: false,
      },
      departmentId: {
        type: "string",
        required: false,
        input: false,
      },
      status: {
        type: "string",
        defaultValue: "ACTIVE",
        input: false,
      },
      avatarUrl: {
        type: "string",
        required: false,
        input: true,
      },
      phone: {
        type: "string",
        required: false,
        input: true,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
  trustedOrigins: originVariants(env.NEXT_PUBLIC_APP_URL, env.BETTER_AUTH_URL),
  plugins: [nextCookies()],
});

export async function ensureAuthDb() {
  await prisma.$connect();
}
