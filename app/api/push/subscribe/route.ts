import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { newId } from "@/lib/id";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const sub = await req.json();
    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        id: newId(),
        userId: user.id,
        endpoint: sub.endpoint,
        keys: sub.keys,
      },
      update: {
        userId: user.id,
        keys: sub.keys,
      },
    });
    return jsonOk({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}
