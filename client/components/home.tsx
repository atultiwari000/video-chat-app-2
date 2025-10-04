"use client";

// import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Video } from "lucide-react";
import { useHome } from "@/hooks/useHome";

import { useSocket } from "@/context/Socket";

export default function Home() {
  const {
    userName,
    setUserName,
    room,
    setRoom,
    socket,
    handleSubmitForm,
    joinPreviewPage,
  } = useHome();
  // const [userName, setUsername] = useState("");
  // const [room, setRoom] = useState("");
  const router = useRouter();
  console.log("useSocket() value:", useSocket()); // put this inside Home component and check console

  const handleJoinMeeting = () => {
    if (userName.trim() && room.trim()) {
      // router.push(
      //   `/preview/${room}?userName=${encodeURIComponent(userName)}&action=join`
      // );
      joinPreviewPage();
    }
  };

  const handleCreateMeeting = () => {
    if (userName.trim()) {
      const randomCode = Math.random().toString(36).substring(2, 10);
      const url = `/preview/${encodeURIComponent(
        randomCode
      )}?username=${encodeURIComponent(userName)}&action=create`;
      router.push(url);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">MeetFlow</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h1 className="text-5xl md:text-7xl font-bold mb-6 text-balance">
              Video meetings made simple
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
              Connect instantly. No downloads, no hassle. Just fast, reliable
              video calls.
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <Card className="border-border">
              <CardHeader>
                <CardTitle>Get started</CardTitle>
                <CardDescription>
                  Enter your details to join or create a meeting
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="userName">userName *</Label>
                  <Input
                    id="userName"
                    placeholder="Enter your name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room-code">
                    Room code (optional for creating)
                  </Label>
                  <Input
                    id="room-code"
                    placeholder="Enter room code to join"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && room.trim() && handleJoinMeeting()
                    }
                    className="flex-1"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <Button
                    onClick={handleJoinMeeting}
                    disabled={!userName.trim() || !room.trim()}
                    variant="outline"
                    className="flex-1 bg-transparent"
                    size="lg"
                  >
                    Join meeting
                  </Button>
                  <Button
                    onClick={handleCreateMeeting}
                    disabled={!userName.trim()}
                    className="flex-1"
                    size="lg"
                  >
                    Create meeting
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        <div style={{ marginTop: "20px", fontSize: "12px", color: "#666" }}>
          <p>Debug Info:</p>
          <p>Socket Connected: {socket ? "Yes" : "No"}</p>
          <p>Current Username: {userName || "Not set"}</p>
          <p>Current Room: {room || "Not set"}</p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© 2025 MeetFlow. Built for seamless collaboration.</p>
        </div>
      </footer>
    </div>
  );
}
