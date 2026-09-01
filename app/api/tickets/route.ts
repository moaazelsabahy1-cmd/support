import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import { createTicketAction, listTicketsAction } from "@/actions/tickets";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const data = await listTicketsAction({
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 20),
      q: searchParams.get("q") || undefined,
      status: searchParams.get("status") || undefined,
      priority: searchParams.get("priority") || undefined,
      departmentId: searchParams.get("departmentId") || undefined,
      assigned: (searchParams.get("assigned") as "me" | "unassigned" | "all") || undefined,
    });
    return jsonOk(data);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = await createTicketAction(body);
    return jsonOk(data, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}
