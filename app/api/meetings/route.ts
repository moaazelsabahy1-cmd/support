import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { createMeetingAction, listMeetingsAction } from "@/actions/meetings";

export async function GET() {
  try {
    return jsonOk(await listMeetingsAction());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    return jsonOk(await createMeetingAction(await req.json()), 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
