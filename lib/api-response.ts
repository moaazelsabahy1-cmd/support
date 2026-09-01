import { ZodError } from "zod";

export type ApiError = { code: string; message: string };

export type ApiSuccess<T> = { success: true; data: T };
export type ApiFailure = { success: false; error: ApiError };
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T): ApiSuccess<T> {
  return { success: true, data };
}

export function fail(code: string, message: string, status = 400): ApiFailure & { status: number } {
  return { success: false, error: { code, message }, status };
}

export function jsonOk<T>(data: T, status = 200) {
  return Response.json(ok(data), { status });
}

export function jsonFail(code: string, message: string, status = 400) {
  const body: ApiFailure = {
    success: false,
    error: { code, message },
  };
  return Response.json(body, { status });
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

export function toErrorResponse(error: unknown) {
  if (error instanceof AppError) {
    return jsonFail(error.code, error.message, error.status);
  }
  if (error instanceof ZodError) {
    return jsonFail("VALIDATION", error.issues[0]?.message || "Invalid input", 400);
  }
  console.error(error);
  const isProd = process.env.NODE_ENV === "production";
  return jsonFail(
    "INTERNAL_ERROR",
    isProd ? "Something went wrong" : error instanceof Error ? error.message : "Unknown error",
    500,
  );
}
