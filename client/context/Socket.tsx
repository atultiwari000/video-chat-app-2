// client/context/Socket.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import socketService from "@/services/socket";
import type { Socket } from "socket.io-client";

const SocketContext = createContext<Socket | null>(null);
export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const s = socketService.connect();
    setSocket(s);

    // ensure re-render once the underlying socket is connected
    const onConnect = () => {
      setSocket(s); // re-set to trigger consumer re-render
    };
    const onError = (err: any) =>
      console.error("SocketProvider connect_error", err);

    s.on("connect", onConnect);
    s.on("connect_error", onError);

    return () => {
      s.off("connect", onConnect);
      s.off("connect_error", onError);

      setSocket(null);
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
};
