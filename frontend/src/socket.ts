import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL?.replace('/api', '') ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: false });
  }
  return socket;
}

export function joinTournament(tournamentId: string) {
  const s = getSocket();
  if (!s.connected) s.connect();
  s.emit('join_tournament', tournamentId);
}

export function leaveTournament(tournamentId: string) {
  getSocket().emit('leave_tournament', tournamentId);
}
