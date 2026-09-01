import webpush from "web-push";
import { prisma } from "@/lib/db";
import { getEnv, isConfigured } from "@/lib/env";

function configured() {
  const env = getEnv();
  return isConfigured(env.PUSH_PUBLIC_KEY) && isConfigured(env.PUSH_PRIVATE_KEY);
}

export function pushConfigured() {
  return configured();
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; href?: string },
) {
  if (!configured()) return;
  const env = getEnv();
  webpush.setVapidDetails(env.PUSH_SUBJECT, env.PUSH_PUBLIC_KEY!, env.PUSH_PRIVATE_KEY!);
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        const keys = sub.keys as { p256dh: string; auth: string };
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys },
          JSON.stringify(payload),
        );
      } catch (error) {
        console.warn("push failed", error);
      }
    }),
  );
}
