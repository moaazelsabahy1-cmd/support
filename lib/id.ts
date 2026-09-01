import { randomBytes } from "crypto";

export function newId() {
  return randomBytes(12).toString("hex");
}

export function isHexId(id: string) {
  return /^[a-f0-9]{24}$/i.test(id);
}
