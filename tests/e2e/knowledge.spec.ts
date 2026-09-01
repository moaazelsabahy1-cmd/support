/**
 * Knowledge pipeline E2E
 *
 * Skips OpenRouter/Qdrant-dependent assertions when those env vars are empty.
 * Fallback coverage: admin UI, Q&A CRUD, file upload, escalation UI.
 */
import { test, expect } from "@playwright/test";
import path from "path";
import { writeFile, mkdir } from "fs/promises";

const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim());
const hasQdrant = Boolean(process.env.QDRANT_URL && process.env.QDRANT_URL.trim());

test.describe("knowledge system", () => {
  test("admin can manage knowledge and customer can ask", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "admin@solvio.local");
    await page.fill("#password", "SolvioAdmin1!");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/(admin|dashboard)/, { timeout: 20_000 });

    await page.goto("/admin/ai/knowledge");
    await expect(page.getByRole("heading", { name: "AI Knowledge" })).toBeVisible();

    await page.getByRole("button", { name: "Q&A" }).click();
    await page.locator("input[name=question]").fill("What is the Solvio refund window for annual plans?");
    await page.locator("textarea[name=answer]").fill("Annual plans can be refunded within 14 days of purchase.");
    await page.getByRole("button", { name: "Add Q&A" }).click();
    await expect(page.getByText("What is the Solvio refund window for annual plans?")).toBeVisible({ timeout: 15_000 });

    if (hasOpenRouter) {
      await expect(page.getByText(/READY|PROCESSING|PENDING|FAILED/).first()).toBeVisible();
    } else {
      test.info().annotations.push({
        type: "skip-provider",
        description: "OPENROUTER_API_KEY unset: indexing stays PENDING/FAILED; chat will not generate answers.",
      });
    }

    await page.getByRole("button", { name: "Files" }).click();
    const dir = path.join(process.cwd(), "uploads", "e2e");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, "refund-policy.txt");
    await writeFile(filePath, "Solvio refunds annual plans within 14 days of purchase. Contact billing for help.");
    await page.locator("input[name=file]").setInputFiles(filePath);
    await page.getByRole("button", { name: "Upload file" }).click();
    await expect(page.getByText("refund-policy.txt")).toBeVisible({ timeout: 15_000 });

    await page.goto("/login");
    await page.fill("#email", "customer@solvio.local");
    await page.fill("#password", "SolvioCustomer1!");
    await page.click("button[type=submit]");
    await page.waitForURL(/\/dashboard/, { timeout: 20_000 });

    await page.goto("/assistant");
    await page.getByLabel("Ask Solvio").fill("What is the refund window for annual plans?");
    await page.getByRole("button", { name: "Send" }).click();

    if (hasOpenRouter) {
      await expect(page.locator("text=/14 days|enough information|human/i").first()).toBeVisible({ timeout: 30_000 });
      await page.getByLabel("Ask Solvio").fill("What is the secret launch date of Project Nebula?");
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByText(/enough information|don't have enough/i).first()).toBeVisible({ timeout: 30_000 });
    } else {
      await expect(page.getByText(/unavailable|OPENROUTER_API_KEY|human/i).first()).toBeVisible({ timeout: 15_000 });
    }

    const escalate = page.getByRole("button", { name: "Talk to a human agent" });
    if (await escalate.isVisible()) {
      await escalate.click();
      await expect(page.getByText(/human agent/i).first()).toBeVisible();
    }

    await page.goto("/chat");
    await expect(page).toHaveURL(/\/chat/);
  });
});

if (!hasQdrant) {
  // Qdrant unset: retrieval uses Mongo cosine similarity when embeddings exist.
}
