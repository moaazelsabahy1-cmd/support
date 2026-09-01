import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { createUserAction, listUsersAction } from "@/actions/users";
import type { Role } from "@/types";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    return jsonOk(
      await listUsersAction({
        role: (sp.get("role") as Role) || undefined,
        q: sp.get("q") || undefined,
        page: Number(sp.get("page") || 1),
      }),
    );
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    return jsonOk(await createUserAction(await req.json()), 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
