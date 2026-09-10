"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (typeof window === "undefined") return null;
  if (socket) return socket;
  socket = io({
    path: process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io",
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
  return socket;
}

export function getWidgetSocket(widgetToken: string) {
  if (typeof window === "undefined") return null;
  return io({
    path: process.env.NEXT_PUBLIC_SOCKET_PATH || "/socket.io",
    withCredentials: false,
    auth: { widgetToken },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5000,
  });
}

/** Join a conversation room and re-join after reconnect. */
export function joinConversationRoom(socketClient: Socket | null, conversationId: string | null | undefined) {
  if (!socketClient || !conversationId) return () => undefined;
  const join = () => {
    socketClient.emit("join", { conversationId });
  };
  join();
  socketClient.on("connect", join);
  return () => {
    socketClient.off("connect", join);
    socketClient.emit("leave", { conversationId });
  };
}
