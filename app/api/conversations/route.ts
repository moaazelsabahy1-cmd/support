import { NextRequest } from "next/server";
import { jsonOk, toErrorResponse } from "@/lib/api-response";
import {
  getOrCreateConversationAction,
  listConversationsAction,
  listMessagesAction,
  sendMessageAction,
  closeConversationAction,
} from "@/actions/messages";

export async function GET() {
  try {
    return jsonOk(await listConversationsAction());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.listMessages) return jsonOk(await listMessagesAction(body.conversationId));
    if (body.close) return jsonOk(await closeConversationAction(body.conversationId));
    if (body.send) {
      return jsonOk(await sendMessageAction(body.conversationId, body.body, body.attachmentIds || []), 201);
    }
    return jsonOk(await getOrCreateConversationAction(body.customerId));
  } catch (e) {
    return toErrorResponse(e);
  }
}
