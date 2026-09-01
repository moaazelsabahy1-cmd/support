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
