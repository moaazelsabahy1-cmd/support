import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse, requestIdFrom, AppError } from "@/lib/api-response";
import { requireRoles } from "@/lib/session";
import { listConversationsForAgent } from "@/lib/admin/agent-conversations";

export async function GET(req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  try {
    const user = await requireRoles(["ADMIN", "SUPER_ADMIN"]);
    const { agentId } = await ctx.params;
    return jsonOk(
      await listConversationsForAgent(user, agentId, {
        q: req.nextUrl.searchParams.get("q") || undefined,
        status: req.nextUrl.searchParams.get("status") || undefined,
        from: req.nextUrl.searchParams.get("from") || undefined,
        to: req.nextUrl.searchParams.get("to") || undefined,
        page: Number(req.nextUrl.searchParams.get("page") || 1),
        pageSize: Number(req.nextUrl.searchParams.get("pageSize") || 20),
      }),
    );
  } catch (e) {
    return toErrorResponse(e, requestIdFrom(req));
  }
}

export async function POST(req: NextRequest) {
  return toErrorResponse(new AppError("METHOD_NOT_ALLOWED", "Method not allowed", 405), requestIdFrom(req));
}
