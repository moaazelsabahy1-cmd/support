import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { listTrainingPairsAction, upsertTrainingPairAction, deleteTrainingPairAction } from "@/actions/ai";

export async function GET(req: NextRequest) {
  try {
    return jsonOk(await listTrainingPairsAction(req.nextUrl.searchParams.get("q") || undefined));
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.deleteId) return jsonOk(await deleteTrainingPairAction(body.deleteId));
    return jsonOk(await upsertTrainingPairAction(body.id ?? null, body), 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
