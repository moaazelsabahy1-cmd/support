import type { ApiFailure, ApiSuccess } from "@/lib/api-response";

export const UNEXPECTED_API_RESPONSE = "Server returned an unexpected response.";

export async function readApiJson<T = unknown>(res: Response): Promise<ApiSuccess<T> | ApiFailure> {
  const text = await res.text();
  if (!text) {
    return {
      success: false,
      error: {
        code: statusCodeName(res.status),
        message: res.statusText || UNEXPECTED_API_RESPONSE,
        requestId: res.headers.get("x-request-id") || "",
      },
    };
  }
  try {
    const json = JSON.parse(text) as ApiSuccess<T> | ApiFailure;
    if (json && typeof json === "object" && "success" in json) return json;
  } catch {
    /* HTML or proxy body */
  }
  return {
    success: false,
    error: {
      code: statusCodeName(res.status) || "INTERNAL_ERROR",
      message: UNEXPECTED_API_RESPONSE,
      requestId: res.headers.get("x-request-id") || "",
    },
  };
}

function statusCodeName(status: number) {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "INTERNAL_ERROR";
  return "HTTP_ERROR";
}

export function apiErrorMessage(json: ApiFailure | ApiSuccess<unknown>, fallback: string) {
  if (json.success) return fallback;
  return json.error?.message || fallback;
}
