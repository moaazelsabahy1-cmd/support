import type { Server as IOServer } from "socket.io";

let io: IOServer | null = null;

export function setIO(server: IOServer) {
  io = server;
}

export function getIO() {
  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function emitToTicket(ticketId: string, event: string, payload: unknown) {
  io?.to(`ticket:${ticketId}`).emit(event, payload);
}

export function emitToConversation(conversationId: string, event: string, payload: unknown) {
  io?.to(`conversation:${conversationId}`).emit(event, payload);
}
