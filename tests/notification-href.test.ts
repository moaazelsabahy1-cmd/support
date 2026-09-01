import { describe, expect, it } from "vitest";
import { resolveNotificationHref } from "../lib/notification-href";

describe("resolveNotificationHref", () => {
  it("maps dashboard notification list to /notifications", () => {
    expect(resolveNotificationHref({ href: "/dashboard/notifications" })).toBe("/notifications");
  });

  it("maps admin notification detail to the admin list (no [id] page)", () => {
    expect(resolveNotificationHref({ href: "/admin/notifications/abc123" })).toBe("/admin/notifications");
  });

  it("maps support-agent notification routes to /notifications", () => {
    expect(resolveNotificationHref({ href: "/support-agent/notifications/xyz" })).toBe("/notifications");
  });

  it("still resolves href when the payload uses Mongo _id", () => {
    expect(
      resolveNotificationHref({
        _id: "507f1f77bcf86cd799439011",
        href: "/chat/aaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).toBe("/chat/aaaaaaaaaaaaaaaaaaaaaaaa");
  });

  it("prefers notification.data.url over href", () => {
    expect(
      resolveNotificationHref({
        href: "/notifications",
        data: { url: "/tickets/bbbbbbbbbbbbbbbbbbbbbbbb" },
      }),
    ).toBe("/tickets/bbbbbbbbbbbbbbbbbbbbbbbb");
    expect(
      resolveNotificationHref({
        href: "/notifications",
        data: { url: "/chat/cccccccccccccccccccccccc" },
      }),
    ).toBe("/chat/cccccccccccccccccccccccc");
  });

  it("maps dashboard messages and tickets onto live routes", () => {
    expect(resolveNotificationHref({ href: "/dashboard/messages" })).toBe("/chat");
    expect(resolveNotificationHref({ href: "/dashboard/messages/conv1" })).toBe("/chat/conv1");
    expect(resolveNotificationHref({ href: "/dashboard/tickets/tick1" })).toBe("/tickets/tick1");
  });
});
