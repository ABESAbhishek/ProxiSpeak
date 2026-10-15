
import { io, type Socket } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SOCKET_URL;

export const socket: Socket | null = SERVER_URL
  ? io(SERVER_URL, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })
  : null;
