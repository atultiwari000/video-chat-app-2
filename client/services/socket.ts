import { io, Socket } from "socket.io-client";

class SocketService {
  private socket: Socket | null = null;
  private connectionAttempts = 0;
  private maxAttempts = 5;

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    // If socket exists but disconnected, try to reconnect
    if (this.socket && !this.socket.connected) {
      this.socket.connect();
      return this.socket;
    }

    this.socket = io(process.env.NEXT_PUBLIC_BACKEND_URL!, {
      path: "/socket.io/",
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: false,
      // Add these for better production compatibility
      upgrade: true,
      rememberUpgrade: true,
    });

    this.socket.on("connect", () => {
      // console.log("Socket connected:", this.socket?.id);
      this.connectionAttempts = 0; // Reset on successful connection
    });

    this.socket.on("connect_error", (err) => {
      this.connectionAttempts++;
      console.error(`❌ Socket connection error (attempt ${this.connectionAttempts}/${this.maxAttempts}):`, err.message);
      
      if (this.connectionAttempts >= this.maxAttempts) {
        console.error("Max connection attempts reached. Please check:");
        console.error("1. Backend server is running");
        console.error("2. CORS is properly configured on backend");
        console.error("3. No firewall blocking the connection");
      }
    });

    this.socket.on("disconnect", (reason) => {
      // console.log("Socket disconnected:", reason);
      if (reason === "io server disconnect") {
        // Server disconnected us, reconnect manually
        this.socket?.connect();
      }
    });

    this.socket.on("reconnect", (attemptNumber) => {
      // console.log(`Reconnected after ${attemptNumber} attempts`);
      this.connectionAttempts = 0;
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

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export default new SocketService();