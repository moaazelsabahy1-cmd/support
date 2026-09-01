import { NextRequest } from "next/server";
import { jsonFail, jsonOk, toErrorResponse } from "@/lib/api-response";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { deleteObject, getUrl, upload, validateFile } from "@/lib/storage";
import { recordTicketAttachmentHistory } from "@/actions/attachments";
import { newId } from "@/lib/id";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    const ticketId = form.get("ticketId")?.toString();
    if (!(file instanceof File)) return jsonFail("NO_FILE", "File is required");
    const mime = validateFile({ type: file.type, size: file.size, name: file.name });
    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await upload(buf, file.name, mime);
    const doc = await prisma.attachment.create({
      data: {
        id: newId(),
        ownerId: user.id,
        ticketId: ticketId || null,
        filename: file.name,
        mimeType: mime,
        size: file.size,
        key: stored.key,
      },
    });
    if (ticketId) await recordTicketAttachmentHistory(ticketId, user.id, "attachment_added", file.name);
    return jsonOk({
      id: doc.id,
      url: stored.url,
      filename: file.name,
      key: stored.key,
    }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireUser();
    const { id } = await req.json();
    const doc = await prisma.attachment.findUnique({ where: { id } });
    if (!doc) return jsonFail("NOT_FOUND", "Attachment not found", 404);
    if (doc.ownerId !== user.id && !["ADMIN", "SUPER_ADMIN"].includes(user.role)) {
      return jsonFail("FORBIDDEN", "Cannot delete this file", 403);
    }
    await deleteObject(doc.key);
    await prisma.attachment.delete({ where: { id: doc.id } });
    if (doc.ticketId) {
      await recordTicketAttachmentHistory(doc.ticketId, user.id, "attachment_deleted", doc.filename);
    }
    return jsonOk({ ok: true });
  } catch (e) {
    return toErrorResponse(e);
  }
}

export { getUrl };
