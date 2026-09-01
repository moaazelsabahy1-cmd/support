import { NextRequest } from "next/server";
import { jsonFail, jsonOk, toErrorResponse } from "@/lib/api-response";
import { rateLimit } from "@/lib/rate-limit";
import { answerQuestion } from "@/lib/ai/agent";
import { prisma } from "@/lib/db";
import { createPublicTicket } from "@/lib/public-tickets";
import { newId } from "@/lib/id";
import {
  authorizeWidgetSite,
  corsHeadersForOrigin,
  resolveWidgetSite,
  widgetAnswerInput,
  widgetRequestKey,
  type ResolvedWidgetSite,
} from "@/lib/ai/widget-site";

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
  try {
    const origin = req.headers.get("origin");
    const siteOrRes = await requireWidget(req);
    if (siteOrRes instanceof Response) return siteOrRes;
    const site = siteOrRes;
    const ip = req.headers.get("x-forwarded-for") || "local";
    if (!rateLimit(`widget:${site.id}:${ip}`, 40, 60_000).ok) {
      return withCors(jsonFail("RATE_LIMIT", "Too many requests", 429), origin, true);
    }
    const body = await req.json();
    const sessionId = body.sessionId || crypto.randomUUID();
    if (body.escalate) {
      const logs = await prisma.aiChatLog.findMany({
        where: { sessionId },
        orderBy: { createdAt: "desc" },
        take: 6,
      });
      const latest = logs[0];
      const context = logs
        .slice()
        .reverse()
        .map((l) => `Q: ${l.question || l.message}\nA: ${l.answer || l.response}`)
        .join("\n\n");
      let ticketNumber: string | undefined;
      try {
        const ticket = await createPublicTicket({
          name: body.name || "Widget visitor",
          email: body.email || "widget@unknown.local",
          title: "Widget AI escalation",
          description: [
            latest ? `Last question: ${latest.question || latest.message}` : "Customer requested a human from the widget.",
            latest ? `AI response: ${latest.answer || latest.response}` : "",
            context,
          ]
            .filter(Boolean)
            .join("\n\n"),
          category: "General",
        });
        ticketNumber = ticket.number;
      } catch {
        /* still record contact submission */
      }
      await prisma.contactSubmission.create({
        data: {
          id: newId(),
          name: body.name || "Widget visitor",
          email: body.email || "widget@unknown.local",
          message: `Human escalation for session ${sessionId}`,
          sessionId,
          ticketNumber,
          aiContext: context.slice(0, 8000),
        },
      });
      await prisma.aiChatLog.updateMany({ where: { sessionId }, data: { escalated: true } });
      return withCors(jsonOk({ sessionId, human: true, ticketNumber }), origin, true);
    }
    const message = String(body.message || "").trim();
    if (!message) return withCors(jsonFail("VALIDATION", "Enter a question to send.", 400), origin, true);
    const result = await answerQuestion({
      ...widgetAnswerInput(site, message, sessionId),
    });
    return withCors(jsonOk({ ...result, sessionId }), origin, true);
  } catch (e) {
    return toErrorResponse(e);
  }
}
