/**
 * Role/status filters for listHandoffAgents. Requires Postgres.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma, ensureAppDefaults } from "../lib/db";
import { listHandoffAgents, listPublicHandoffAgents } from "../lib/ai/handoff-queue";
import { newId } from "../lib/id";

const ORG = `org_list_${Date.now().toString(36)}`;
const ids: string[] = [];

describe("listHandoffAgents filters", () => {
  beforeAll(async () => {
    await ensureAppDefaults();
    await prisma.organization.create({ data: { id: ORG, name: "List Org" } });
    const specs = [
      { role: "AGENT" as const, status: "ACTIVE" as const, name: "Keep One" },
      { role: "AGENT" as const, status: "ACTIVE" as const, name: "Keep Two" },
      { role: "AGENT" as const, status: "ACTIVE" as const, name: "Keep Three" },
      { role: "AGENT" as const, status: "ACTIVE" as const, name: "Keep Four" },
      { role: "CUSTOMER" as const, status: "ACTIVE" as const, name: "Not Agent" },
      { role: "ADMIN" as const, status: "ACTIVE" as const, name: "Admin User" },
      { role: "AGENT" as const, status: "DEACTIVATED" as const, name: "Inactive Agent" },
    ];
    for (let i = 0; i < specs.length; i++) {
      const id = newId();
      ids.push(id);
      await prisma.user.create({
        data: {
          id,
          name: specs[i].name,
          email: `list-filter-${i}-${Date.now()}@solvio.local`,
          emailVerified: true,
          role: specs[i].role,
          status: specs[i].status,
          organizationId: ORG,
          createdAt: new Date(Date.now() + i * 1000),
        },
      });
    }
  }, 30_000);

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } }).catch(() => undefined);
    await prisma.organization.deleteMany({ where: { id: ORG } }).catch(() => undefined);
  }, 30_000);

  it("returns four ACTIVE AGENT users and excludes invalid roles and inactive agents", async () => {
    const listed = await listHandoffAgents(ORG);
    expect(listed.map((a) => a.name)).toEqual(["Keep One", "Keep Two", "Keep Three", "Keep Four"]);
    expect(listed.some((a) => a.name === "Not Agent" || a.name === "Admin User" || a.name === "Inactive Agent")).toBe(
      false,
    );
    const cards = await listPublicHandoffAgents(ORG);
    expect(cards).toHaveLength(4);
  });
});
