import { Server as HttpServer } from "http";
import { Server as SocketServer } from "socket.io";

export type WsEvent =
  | "pairings_updated"
  | "standings_updated"
  | "result_reported"
  | "round_started"
  | "timer_update"
  | "tournament_finished";

let io: SocketServer | null = null;

export function initWebSocket(server: HttpServer): SocketServer {
  io = new SocketServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL ?? "http://localhost:5173",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    console.log(`[WS] Client connected: ${socket.id}`);

    socket.on("join_tournament", (tournamentId: string) => {
      socket.join(`tournament:${tournamentId}`);
    });

    socket.on("leave_tournament", (tournamentId: string) => {
      socket.leave(`tournament:${tournamentId}`);
    });

    socket.on("disconnect", () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function broadcast(tournamentId: string, event: WsEvent, data: unknown) {
  if (!io) return;
  io.to(`tournament:${tournamentId}`).emit(event, data);
}
