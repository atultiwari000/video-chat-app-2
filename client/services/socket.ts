import { io, Socket } from "socket.io-client";

class SocketService {
  private socket: Socket | null = null;

  connect(): Socket {
    if (this.socket) {
      console.log("SocketService: Reusing existing socket");
      return this.socket;
    }

    console.log("SocketService: Creating new socket");
    this.socket = io("http://localhost:8000", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on("connect", () => {
      console.log("SocketService: Socket connected", this.socket?.id);
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