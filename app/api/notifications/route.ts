import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { listNotificationsAction, markNotificationsReadAction } from "@/actions/notifications";

export async function GET() {
  try {
    return jsonOk(await listNotificationsAction());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return jsonOk(await markNotificationsReadAction(body.ids));
  } catch (e) {
    return toErrorResponse(e);
  }
}
