import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { getAdminSettingsAction, saveAdminSettingsAction } from "@/actions/settings";

export async function GET() {
  try {
    return jsonOk(await getAdminSettingsAction());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    return jsonOk(await saveAdminSettingsAction(await req.json()));
  } catch (e) {
    return toErrorResponse(e);
  }
}
