import { NextRequest } from "next/server";
import { jsonOk, jsonFail, toErrorResponse } from "@/lib/api-response";
import { ingestWebSourceAction, listAiSourcesAction } from "@/actions/ai";
import { requireKnowledgeAdmin } from "@/lib/ai/knowledge-access";
import { prisma } from "@/lib/db";
import { upload, validateKnowledgeFile } from "@/lib/storage";
import { enqueueIndexJob } from "@/lib/ai/jobs";
import { knowledgeOrgId } from "@/lib/ai/org";
import { KnowledgeError, KNOWLEDGE_ERROR } from "@/lib/ai/errors";
import { newId } from "@/lib/id";

export async function GET() {
  try {
    return jsonOk(await listAiSourcesAction());
  } catch (e) {
    return toErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      return jsonOk(await ingestWebSourceAction(await req.json()), 201);
    }
    const user = await requireKnowledgeAdmin();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return jsonFail("NO_FILE", "File required");
    const mime = validateKnowledgeFile({ type: file.type, size: file.size, name: file.name });
    const buf = Buffer.from(await file.arrayBuffer());
    const stored = await upload(buf, file.name, mime, "ai");
    const category = String(form.get("category") || "") || undefined;
    const created = await prisma.knowledgeSource.create({
      data: {
        id: newId(),
        organizationId: await knowledgeOrgId(user.id),
        type: "FILE",
        title: file.name,
        status: "PENDING",
        filename: file.name,
        mimeType: mime,
        size: file.size,
        storageKey: stored.key,
        category,
        tags: [],
        createdBy: user.id,
        chunkCount: 0,
      },
    });
    await enqueueIndexJob(created.id);
    return jsonOk({ id: created.id }, 201);
  } catch (e) {
    if (e instanceof KnowledgeError) return jsonFail(e.code, e.message, 400);
    void KNOWLEDGE_ERROR;
    return toErrorResponse(e);
  }
}
