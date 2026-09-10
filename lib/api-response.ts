import { ZodError } from "zod";

export type ApiError = { code: string; message: string; requestId: string };

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: ApiError };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function newRequestId() {
  return crypto.randomUUID();
}

export function requestIdFrom(req?: { headers: { get(name: string): string | null } }) {
  return req?.headers.get("x-request-id") || newRequestId();
}

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function fail(code: string, message: string, status = 400, requestId = newRequestId()): ApiFailure & { status: number } {
  return { success: false, error: { code, message, requestId }, status };
}

export function jsonOk<T>(data: T, status = 200) {
  return Response.json(ok(data), { status });
}

export function jsonFail(code: string, message: string, status = 400, requestId = newRequestId()) {
  const body: ApiFailure = {
    success: false,
    error: { code, message, requestId },
  };
  return Response.json(body, { status, headers: { "x-request-id": requestId } });
}

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function mapUnknownError(error: unknown): {
  code: string;
  message: string;
  status: number;
  prismaCode?: string;
} {
  const name = error instanceof Error ? error.name : "";
  const code =
    error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string"
      ? (error as { code: string }).code
      : "";
  const isPrisma = name.includes("Prisma") || /^P\d{4}$/.test(code);
  if (isPrisma && (code === "P1000" || code === "P1001" || code === "P1017" || name.includes("Initialization"))) {
    return { code: "DATABASE_UNAVAILABLE", message: "Database is unreachable.", status: 503, prismaCode: code || undefined };
  }
  if (isPrisma && (code === "P2021" || code === "P2022")) {
    return {
      code: "SCHEMA_MISMATCH",
      message: "Database schema is out of date. Run prisma migrate deploy.",
      status: 503,
      prismaCode: code,
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "The request could not be completed. Quote the request id if you contact support.",
    status: 500,
  };
}

export function toErrorResponse(error: unknown, requestId = newRequestId()) {
  if (error instanceof AppError) {
    return jsonFail(error.code, error.message, error.status, requestId);
  }
  if (error instanceof ZodError) {
    return jsonFail("VALIDATION", error.issues[0]?.message || "Invalid input", 400, requestId);
  }
  const mapped = mapUnknownError(error);
  console.error({
    requestId,
    code: mapped.code,
    prismaCode: mapped.prismaCode,
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return jsonFail(mapped.code, mapped.message, mapped.status, requestId);
}
