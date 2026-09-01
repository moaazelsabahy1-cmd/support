self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Do not intercept Socket.IO or API traffic.
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : { title: "Solvio", body: "New notification" };
  event.waitUntil(
    self.registration.showNotification(data.title || "Solvio", {
      body: data.body,
      data,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data && event.notification.data.href;
  event.waitUntil(self.clients.openWindow(href || "/dashboard"));
});
