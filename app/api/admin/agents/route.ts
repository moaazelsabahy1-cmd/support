import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse, requestIdFrom, AppError } from "@/lib/api-response";
import { requireRoles } from "@/lib/session";
import { listAdminAgents } from "@/lib/admin/agent-conversations";

export async function GET(req: NextRequest) {
  try {
    const user = await requireRoles(["ADMIN", "SUPER_ADMIN"]);
    return jsonOk(await listAdminAgents(user, req.nextUrl.searchParams.get("q") || undefined));
  } catch (e) {
    return toErrorResponse(e, requestIdFrom(req));
  }
}

export async function POST(req: NextRequest) {
  return toErrorResponse(new AppError("METHOD_NOT_ALLOWED", "Method not allowed", 405), requestIdFrom(req));
}
