import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getEnv, isConfigured } from "@/lib/env";
import { AppError } from "@/lib/api-response";

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const EXT_BY_MIME: Record<string, string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
  "image/gif": ["gif"],
  "application/pdf": ["pdf"],
  "text/plain": ["txt"],
  "text/markdown": ["md", "markdown"],
  "application/msword": ["doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
};

const KNOWLEDGE_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function maxSize() {
  try {
    return getEnv().KNOWLEDGE_MAX_FILE_BYTES || 15 * 1024 * 1024;
  } catch {
    return 15 * 1024 * 1024;
  }
}

function r2Configured() {
  const env = getEnv();
  return (
    isConfigured(env.R2_ACCESS_KEY_ID) &&
    isConfigured(env.R2_SECRET_ACCESS_KEY) &&
    isConfigured(env.R2_BUCKET_NAME)
  );
}

function s3() {
  const env = getEnv();
  const endpoint =
    env.R2_ENDPOINT ||
    (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
  return new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: env.R2_SECRET_ACCESS_KEY || "",
    },
  });
}

export function validateFile(file: { type: string; size: number; name: string }) {
  if (file.size > maxSize()) {
    throw new AppError("FILE_TOO_LARGE", "File exceeds the configured size limit", 400);
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED_MIME.has(mime)) {
    throw new AppError("FILE_TYPE", "This file type is not allowed", 400);
  }
  const ext = path.extname(file.name).replace(".", "").toLowerCase();
  const allowedExt = EXT_BY_MIME[mime] || [];
  if (ext && !allowedExt.includes(ext)) {
    throw new AppError("FILE_EXT", "File extension does not match type", 400);
  }
  return mime;
}

export function validateKnowledgeFile(file: { type: string; size: number; name: string }) {
  const ext = path.extname(file.name).replace(".", "").toLowerCase();
  let mime = file.type || "application/octet-stream";
  if (mime === "application/octet-stream") {
    if (ext === "pdf") mime = "application/pdf";
    if (ext === "txt") mime = "text/plain";
    if (ext === "md" || ext === "markdown") mime = "text/markdown";
    if (ext === "docx") mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  validateFile({ type: mime, size: file.size, name: file.name });
  if (!KNOWLEDGE_MIME.has(mime)) {
    throw new AppError("UNSUPPORTED_FILE", "Knowledge files must be PDF, DOCX, TXT, or MD", 400);
  }
  return mime;
}

export async function upload(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folder = "attachments",
) {
  validateFile({ type: mimeType, size: buffer.length, name: filename });
  const ext = path.extname(filename) || "";
  const key = `${folder}/${randomUUID()}${ext}`;
  const env = getEnv();

  if (r2Configured()) {
    await s3().send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
  } else {
    const dest = path.join(process.cwd(), "uploads", key);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, buffer);
  }

  return { key, url: getUrl(key) };
}

export async function deleteObject(key: string) {
  const env = getEnv();
  if (r2Configured()) {
    await s3().send(
      new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      }),
    );
    return;
  }
  const dest = path.join(process.cwd(), "uploads", key);
  await unlink(dest).catch(() => undefined);
}

export async function readStored(key: string) {
  if (r2Configured()) {
    const env = getEnv();
    const res = await s3().send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new AppError("STORAGE", "Could not read stored file", 500);
    return Buffer.from(bytes);
  }
  const dest = path.join(process.cwd(), "uploads", key);
  return (await import("fs/promises")).readFile(dest);
}

export function getUrl(key: string) {
  const env = getEnv();
  if (r2Configured() && env.R2_PUBLIC_URL) {
    return `${env.R2_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }
  return `/api/files/${key}`;
}

export function storageMode() {
  return r2Configured() ? "r2" : "local";
}
