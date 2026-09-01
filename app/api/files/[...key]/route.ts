import { NextRequest } from "next/server";
import { createReadStream, existsSync } from "fs";
import path from "path";
import { Readable } from "stream";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv, isConfigured } from "@/lib/env";
import { jsonFail } from "@/lib/api-response";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const objectKey = key.join("/");
  if (objectKey.includes("..")) return jsonFail("BAD_PATH", "Invalid path", 400);
  const env = getEnv();
  const r2 =
    isConfigured(env.R2_ACCESS_KEY_ID) &&
    isConfigured(env.R2_SECRET_ACCESS_KEY) &&
    isConfigured(env.R2_BUCKET_NAME);

  if (r2) {
    const endpoint =
      env.R2_ENDPOINT ||
      (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
    const s3 = new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
    const obj = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: objectKey }));
    const body = obj.Body as Readable;
    return new Response(Readable.toWeb(body) as ReadableStream, {
      headers: {
        "Content-Type": obj.ContentType || "application/octet-stream",
      },
    });
  }

  const dest = path.join(process.cwd(), "uploads", objectKey);
  if (!existsSync(dest)) return jsonFail("NOT_FOUND", "File not found", 404);
  const stream = createReadStream(dest);
  return new Response(Readable.toWeb(stream) as ReadableStream);
}
