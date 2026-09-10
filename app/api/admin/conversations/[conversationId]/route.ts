import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse, requestIdFrom, AppError } from "@/lib/api-response";
import { requireRoles } from "@/lib/session";
import { getConversationForAdmin } from "@/lib/admin/agent-conversations";

export async function GET(req: NextRequest, ctx: { params: Promise<{ conversationId: string }> }) {
  try {
    const user = await requireRoles(["ADMIN", "SUPER_ADMIN"]);
    const { conversationId } = await ctx.params;
    return jsonOk(
      await getConversationForAdmin(user, conversationId, req.nextUrl.searchParams.get("agentId") || undefined),
    );
  } catch (e) {
    return toErrorResponse(e, requestIdFrom(req));
  }
}

export async function POST(req: NextRequest) {
  return toErrorResponse(new AppError("METHOD_NOT_ALLOWED", "Method not allowed", 405), requestIdFrom(req));
}
