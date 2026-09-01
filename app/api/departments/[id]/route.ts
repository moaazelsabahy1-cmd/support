import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { deleteDepartmentAction, updateDepartmentAction } from "@/actions/departments";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await updateDepartmentAction(id, await req.json()));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return jsonOk(await deleteDepartmentAction(id));
  } catch (e) {
    return toErrorResponse(e);
  }
}
