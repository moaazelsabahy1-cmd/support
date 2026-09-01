"use client";

export function PushToggle() {
  return (
    <button
      className="mt-3 inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm"
      type="button"
      onClick={async () => {
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
        const perm = await Notification.requestPermission();
        if (perm !== "granted") return;
        const reg = await navigator.serviceWorker.register("/sw.js");
        const res = await fetch("/api/push/key");
        const json = await res.json();
        if (!json.success || !json.data.key) return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(json.data.key),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub),
        });
      }}
    >
      Enable push notifications
    </button>
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}
