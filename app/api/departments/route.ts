import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { createDepartmentAction, listDepartmentsAction } from "@/actions/departments";

export async function GET() {
  try {
    return jsonOk(await listDepartmentsAction());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    return jsonOk(await createDepartmentAction(await req.json()), 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
