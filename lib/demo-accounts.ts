export const DEMO_ACCOUNTS = [
  { label: "Admin", email: "admin@solvio.local", password: "SolvioAdmin1!" },
  { label: "Customer", email: "customer@solvio.local", password: "SolvioCustomer1!" },
] as const;

/** Four Human Support agents (same users as the Talk to Human picker). */
export const HANDOFF_AGENT_ACCOUNTS = [
  { label: "Maya", name: "Maya Chen", email: "agent@solvio.local", password: "SolvioAgent1!" },
  { label: "Luis", name: "Luis Park", email: "agent2@solvio.local", password: "SolvioAgent1!" },
  { label: "Nina", name: "Nina Okonkwo", email: "agent3@solvio.local", password: "SolvioAgent1!" },
  { label: "Omar", name: "Omar Haddad", email: "agent4@solvio.local", password: "SolvioAgent1!" },
] as const;

export function postLoginPath(role?: string | null, email?: string | null) {
  const r = String(role || "").toUpperCase();
  if (r === "ADMIN" || r === "SUPER_ADMIN") return "/admin";
  if (r === "AGENT") return "/agent";
  if (email && HANDOFF_AGENT_ACCOUNTS.some((a) => a.email === email)) return "/agent";
  if (email === "admin@solvio.local") return "/admin";
  return "/dashboard";
}
