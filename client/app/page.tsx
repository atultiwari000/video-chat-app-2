import React from "react";
// import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/components/home";
// import RoomPage from "./pages/Room";
import { SocketProvider } from "@/context/Socket";
// import PreviewPage from "./pages/PreviewPage";

export default function Page() {
  return (
    <SocketProvider>
      <Home />
    </SocketProvider>
  );
}
