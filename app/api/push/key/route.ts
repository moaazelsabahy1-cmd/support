import { jsonOk } from "@/lib/api-response";
import { getEnv } from "@/lib/env";

export async function GET() {
  return jsonOk({ key: getEnv().PUSH_PUBLIC_KEY || "" });
}
