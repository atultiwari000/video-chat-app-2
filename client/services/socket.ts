import { io, Socket } from "socket.io-client";

class SocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (this.socket) {
      return this.socket;
    }

    this.socket = io(process.env.NEXT_PUBLIC_BACKEND_URL!, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 30000, 
    });

    this.socket.on("connect", () => {
    });

    this.socket.on("connect_error", (err) => {
      console.error("SocketService: Connection error", err.message);
    });

    return this.socket;
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default new SocketService();