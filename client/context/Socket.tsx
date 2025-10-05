"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import socketService from "@/services/socket";
import type { Socket } from "socket.io-client";

const SocketContext = createContext<Socket | null>(null);
export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "error" | "disconnected"
  >("connecting");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const s = socketService.connect();
    setSocket(s);

    const onConnect = () => {
      setConnectionStatus("connected");
      setRetryCount(0);
      setSocket(s); // trigger re-render
    };

    const onConnectError = (err: any) => {
      console.error("Connection error:", err.message);
      setConnectionStatus("error");
      setRetryCount((prev) => prev + 1);
    };

    const onDisconnect = (reason: string) => {
      console.log("Disconnected:", reason);
      setConnectionStatus("disconnected");
    };

    const onReconnect = (attemptNumber: number) => {
      setConnectionStatus("connected");
      setRetryCount(0);
    };

    const onReconnectAttempt = (attemptNumber: number) => {
      setConnectionStatus("connecting");
      setRetryCount(attemptNumber);
    };

    s.on("connect", onConnect);
    s.on("connect_error", onConnectError);
    s.on("disconnect", onDisconnect);
    s.on("reconnect", onReconnect);
    s.on("reconnect_attempt", onReconnectAttempt);

    return () => {
      s.off("connect", onConnect);
      s.off("connect_error", onConnectError);
      s.off("disconnect", onDisconnect);
      s.off("reconnect", onReconnect);
      s.off("reconnect_attempt", onReconnectAttempt);
      setSocket(null);
    };
  }, []);

  return (
    <SocketContext.Provider value={socket}>
      {connectionStatus !== "connected" && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            backgroundColor:
              connectionStatus === "error" ? "#ef4444" : "#f59e0b",
            color: "white",
            padding: "12px",
            textAlign: "center",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          {connectionStatus === "connecting" && (
            <>
              🔄 Connecting to server
              {retryCount > 0 ? ` (attempt ${retryCount})` : ""}...
            </>
          )}
          {connectionStatus === "error" && (
            <>❌ Connection failed. Retrying... (attempt {retryCount})</>
          )}
          {connectionStatus === "disconnected" && (
            <>⚠️ Disconnected from server. Reconnecting...</>
          )}
        </div>
      )}
      {children}
    </SocketContext.Provider>
  );
};
