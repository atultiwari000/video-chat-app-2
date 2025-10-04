"use client";

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

export default function Home() {
  const {
    userName,
    setUserName,
    room,
    setRoom,
    handleSubmitForm,
    joinPreviewPage,
  } = useHome();
  const router = useRouter();

  const handleJoinMeeting = () => {
    if (userName.trim() && room.trim()) {
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
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-lg flex items-center justify-center">
              <Video className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
            </div>
            <span className="text-lg sm:text-xl font-semibold">MeetFlow</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-16">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-8 sm:mb-12">
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold mb-4 sm:mb-6 text-balance">
              Video meetings made simple
            </h1>
            <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto text-balance px-4">
              Connect instantly. No downloads, no hassle. Just fast, reliable
              video calls.
            </p>
          </div>

          <div className="max-w-2xl mx-auto px-4 sm:px-0">
            <Card className="border-border">
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-xl sm:text-2xl">
                  Get started
                </CardTitle>
                <CardDescription className="text-sm sm:text-base">
                  Enter your details to join or create a meeting
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="userName" className="text-sm sm:text-base">
                    userName *
                  </Label>
                  <Input
                    id="userName"
                    placeholder="Enter your name"
                    value={userName}
                    maxLength={40}
                    onChange={(e) => setUserName(e.target.value)}
                    className="flex-1 h-10 sm:h-11 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room-code" className="text-sm sm:text-base">
                    Room code
                  </Label>
                  <Input
                    id="room-code"
                    placeholder="Enter room code to join"
                    value={room}
                    maxLength={10}
                    onChange={(e) => setRoom(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && room.trim() && handleJoinMeeting()
                    }
                    className="flex-1 h-10 sm:h-11 text-base"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Button
                    onClick={handleJoinMeeting}
                    disabled={!userName.trim() || !room.trim()}
                    variant="outline"
                    className="flex-1 bg-transparent h-11 sm:h-12 text-base"
                    size="lg"
                  >
                    Join meeting
                  </Button>
                  <Button
                    onClick={handleCreateMeeting}
                    disabled={!userName.trim()}
                    className="flex-1 h-11 sm:h-12 text-base"
                    size="lg"
                  >
                    Create meeting
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
