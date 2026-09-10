import { NextRequest } from "next/server";
import { jsonFail, jsonOk, toErrorResponse } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { answerQuestion } from "@/lib/ai/agent";
import {
  authorizeWidgetSite,
  corsHeadersForOrigin,
  resolveWidgetSite,
  widgetAnswerInput,
  widgetRequestKey,
  type ResolvedWidgetSite,
} from "@/lib/ai/widget-site";
import { widgetGuestEmail } from "@/lib/ai/widget-guest";
import { prisma } from "@/lib/db";
import { listPublicHandoffAgents } from "@/lib/ai/handoff-queue";
import { humanSupportHoursState } from "@/lib/ai/human-support-hours";
import {
  escalateWidgetToHuman,
  listWidgetConversation,
  sendWidgetConversationMessage,
} from "@/lib/ai/widget-handoff";

function withCors(res: Response, origin: string | null, allowed: boolean) {
  const headers = corsHeadersForOrigin(origin, allowed);
  Object.entries(headers).forEach(([k, v]) => res.headers.set(k, v));
  return res;
}

async function requireWidget(req: NextRequest): Promise<ResolvedWidgetSite | Response> {
  const origin = req.headers.get("origin");
  const key = widgetRequestKey(req.headers, req.nextUrl.searchParams);
  const site = await resolveWidgetSite(key);
  if (!site) {
    return withCors(jsonFail("UNAUTHORIZED", "Invalid widget key", 401), origin, false);
  }
  const auth = authorizeWidgetSite(site, req.headers, req.nextUrl.searchParams);
  if (!auth.allowed) {
    return withCors(jsonFail("UNAUTHORIZED", "This website is not allowed to use this widget", 401), origin, false);
  }
  return site;
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const result = await requireWidget(req);
  const allowed = !(result instanceof Response);
  if (result instanceof Response) return result;
  return withCors(new Response(null, { status: 204 }), origin, allowed);
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  try {
    const siteOrRes = await requireWidget(req);
    if (siteOrRes instanceof Response) return siteOrRes;
    const site = siteOrRes;
    const ip = req.headers.get("x-forwarded-for") || "local";
    if (!rateLimit(`widget:${site.id}:${ip}`, 40, 60_000).ok) {
      return withCors(jsonFail("RATE_LIMIT", "Too many requests", 429), origin, true);
    }
    const body = await req.json();
    const sessionId = body.sessionId || crypto.randomUUID();

    if (body.listAgents) {
      return withCors(
        jsonOk({
          agents: await listPublicHandoffAgents(site.organizationId),
          ...humanSupportHoursState(),
        }),
        origin,
        true,
      );
    }

    if (body.listMessages) {
      const data = await listWidgetConversation({
        widgetToken: String(body.widgetToken || ""),
        sessionId,
      });
      return withCors(jsonOk(data), origin, true);
    }

    if (body.escalate) {
      if (!rateLimit(`widget-escalate:${site.id}:${ip}`, 8, 60_000).ok) {
        return withCors(jsonFail("RATE_LIMIT", "Too many handoff requests", 429), origin, true);
      }
      const data = await escalateWidgetToHuman({
        site,
        sessionId,
        name: body.name,
        selectedAgentId: body.selectedAgentId,
      });
      return withCors(jsonOk(data), origin, true);
    }

    if (body.send || (body.widgetToken && body.conversationId && body.message)) {
      const data = await sendWidgetConversationMessage({
        widgetToken: String(body.widgetToken || ""),
        sessionId,
        body: String(body.message || body.body || ""),
      });
      return withCors(jsonOk(data), origin, true);
    }

    const message = String(body.message || "").trim();
    if (!message) return withCors(jsonFail("VALIDATION", "Enter a question to send.", 400), origin, true);

    const existingGuest = await prisma.user.findUnique({ where: { email: widgetGuestEmail(sessionId) } });
    if (existingGuest) {
      const paused = await prisma.conversation.findFirst({
        where: { customerId: existingGuest.id, sourceSessionId: sessionId, aiPaused: true },
      });
      if (paused) {
        return withCors(
          jsonFail("HANDOFF_ACTIVE", "An agent is handling this conversation. Send your message in the live chat.", 409),
          origin,
          true,
        );
      }
    }

    const result = await answerQuestion({
      ...widgetAnswerInput(site, message, sessionId),
    });
    return withCors(jsonOk({ ...result, sessionId }), origin, true);
  } catch (e) {
    return withCors(toErrorResponse(e), origin, true);
  }
}
