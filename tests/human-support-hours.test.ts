import { describe, expect, it } from "vitest";
import {
  dateAtCairo,
  HUMAN_SUPPORT_TIMEZONE,
  isHumanSupportOpen,
  humanSupportHoursMessage,
  assertHumanSupportOpen,
  parseHandoffAgentsPayload,
} from "../lib/ai/human-support-hours";
import { AppError } from "../lib/api-response";

describe("isHumanSupportOpen Africa/Cairo", () => {
  it("is closed at 08:59 and open at 09:00", () => {
    expect(isHumanSupportOpen(dateAtCairo(2026, 1, 15, 8, 59))).toBe(false);
    expect(isHumanSupportOpen(dateAtCairo(2026, 1, 15, 9, 0))).toBe(true);
  });

  it("is open at noon and 23:59", () => {
    expect(isHumanSupportOpen(dateAtCairo(2026, 6, 15, 12, 0))).toBe(true);
    expect(isHumanSupportOpen(dateAtCairo(2026, 6, 15, 23, 59))).toBe(true);
  });

  it("is closed at midnight and 02:00", () => {
    expect(isHumanSupportOpen(dateAtCairo(2026, 1, 16, 0, 0))).toBe(false);
    expect(isHumanSupportOpen(dateAtCairo(2026, 1, 16, 0, 1))).toBe(false);
    expect(isHumanSupportOpen(dateAtCairo(2026, 1, 16, 2, 0))).toBe(false);
  });

  it("uses Africa/Cairo not UTC-only hours", () => {
    const nineCairo = dateAtCairo(2026, 1, 15, 9, 0);
    expect(HUMAN_SUPPORT_TIMEZONE).toBe("Africa/Cairo");
    expect(isHumanSupportOpen(nineCairo)).toBe(true);
    const cairoHour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Africa/Cairo",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(nineCairo),
    );
    expect(cairoHour).toBe(9);
  });

  it("assertHumanSupportOpen throws HUMAN_SUPPORT_CLOSED", () => {
    expect(() => assertHumanSupportOpen(dateAtCairo(2026, 1, 16, 2, 0))).toThrow(AppError);
    try {
      assertHumanSupportOpen(dateAtCairo(2026, 1, 16, 2, 0));
    } catch (e) {
      expect((e as AppError).code).toBe("HUMAN_SUPPORT_CLOSED");
      expect((e as AppError).status).toBe(403);
    }
    expect(humanSupportHoursMessage()).toMatch(/9:00 AM to 12:00 AM/);
  });

  it("parses agent-list payloads with open and message", () => {
    expect(parseHandoffAgentsPayload({ agents: [], open: false, message: "closed" })).toMatchObject({
      open: false,
      message: "closed",
    });
    expect(parseHandoffAgentsPayload([])).toMatchObject({ open: true, agents: [] });
  });
});
