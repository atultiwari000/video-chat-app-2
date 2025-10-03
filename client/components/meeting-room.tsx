"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Monitor,
  MessageSquare,
  Users,
  Settings,
  PhoneOff,
  Send,
  Copy,
  Check,
  Maximize,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoom } from "@/hooks/useRoom";

interface Message {
  id: number;
  sender: string;
  text: string;
  timestamp: Date;
  isLocal: boolean;
}

export default function MeetingRoom() {
  const router = useRouter();

  // Use the working hooks
  const {
    localUserName,
    remoteUserName,
    remoteSocketId,
    room,
    myStream,
    remoteStream,
    myVideoRef,
    remoteVideoRef,
    endCall,
    toggleVideo,
    toggleAudio,
    isVideoEnabled,
    isAudioEnabled,
    connectionState,
  } = useRoom();

  // UI state
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { messages, sendMessage } = useRoom();

  // Sync UI state with actual track state
  useEffect(() => {
    if (myStream) {
      setIsVideoOn(isVideoEnabled());
      setIsAudioOn(isAudioEnabled());
    }
  }, [myStream, isVideoEnabled, isAudioEnabled]);

  // Add system message when participant joins
  // useEffect(() => {
  //   if (remoteSocketId) {
  //     const now = new Date();
  //     setMessages((prev) => [
  //       ...prev,
  //       {
  //         id: now.getTime(),
  //         sender: "System",
  //         text: `${remoteUserName} joined the meeting`,
  //         timestamp: now,
  //         isLocal: false,
  //       },
  //     ]);
  //   }
  // }, [remoteSocketId, remoteUserName]);

  const handleToggleVideo = () => {
    const newState = toggleVideo();
    setIsVideoOn(newState ?? false);
  };

  const handleToggleAudio = () => {
    const newState = toggleAudio();
    setIsAudioOn(newState ?? false);
  };

  const handleLeaveMeeting = () => {
    const confirmEnd = window.confirm(
      "Are you sure you want to leave the meeting?"
    );
    if (confirmEnd) {
      endCall();
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  const handleSendMessage = () => {
    if (messageInput.trim()) {
      if (messageInput.trim()) {
        sendMessage(messageInput);
        setMessageInput("");
      }
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Video className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-sm font-semibold">Meeting Room</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground font-mono">{room}</p>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handleCopyCode}
              >
                {codeCopied ? (
                  <Check className="w-3 h-3 text-green-500" />
                ) : (
                  <Copy className="w-3 h-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={connectionState === "connected" ? "default" : "secondary"}
            className="gap-1"
          >
            {connectionState === "connected" ? "🟢" : "🟡"} {connectionState}
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <Users className="w-3 h-3" />
            {remoteSocketId ? "2" : "1"}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Area */}
        <div className="flex-1 p-4 relative">
          {!remoteSocketId || !remoteStream ? (
            // Waiting state - show only local video large
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <Card className="relative w-full max-w-3xl aspect-video overflow-hidden">
                {isVideoOn && myStream ? (
                  <video
                    ref={myVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-muted flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                        <span className="text-4xl font-semibold text-primary">
                          {localUserName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-lg font-medium">{localUserName}</p>
                    </div>
                  </div>
                )}

                {/* Local user label */}
                <div className="absolute bottom-4 left-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-lg flex items-center gap-2">
                  <p className="text-sm font-medium">{localUserName}</p>
                  <Badge variant="secondary" className="text-xs">
                    You
                  </Badge>
                </div>

                {/* Mic status indicator */}
                <div className="absolute bottom-4 right-4">
                  <div
                    className={cn(
                      "rounded-full p-2",
                      !isAudioOn
                        ? "bg-destructive"
                        : "bg-background/80 backdrop-blur-sm"
                    )}
                  >
                    {!isAudioOn ? (
                      <MicOff className="w-4 h-4 text-white" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </div>
                </div>
              </Card>

              {/* Waiting message */}
              <div className="text-center">
                <div className="inline-flex items-center gap-2 bg-muted px-4 py-2 rounded-full mb-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <p className="text-sm font-medium">
                    Waiting for others to join...
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Share the room code:{" "}
                  <span className="font-mono font-semibold">{room}</span>
                </p>
              </div>
            </div>
          ) : (
            // Active call state - show both videos
            <div className="h-full flex gap-4">
              {/* Remote participant video (larger) */}
              <Card className="flex-1 relative overflow-hidden">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover"
                />
                {!remoteStream && (
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
                        <span className="text-5xl font-semibold text-primary">
                          {remoteUserName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xl font-medium">{remoteUserName}</p>
                    </div>
                  </div>
                )}

                {/* Remote user label */}
                <div className="absolute bottom-4 left-4 bg-background/80 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                  <p className="text-sm font-medium">{remoteUserName}</p>
                </div>
              </Card>
              {/* Local video (picture-in-picture) */}
              <Card className="w-80">
                <Card className="relative aspect-video overflow-hidden">
                  {isVideoOn && myStream ? (
                    <video
                      ref={myVideoRef} // Use the same ref
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ transform: "scaleX(-1)" }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-muted flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                          <span className="text-2xl font-semibold text-primary">
                            {localUserName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-sm font-medium">{localUserName}</p>
                      </div>
                    </div>
                  )}

                  {/* Local user label */}
                  <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm px-2 py-1 rounded text-xs font-medium flex items-center gap-1">
                    {localUserName}
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1 py-0"
                    >
                      You
                    </Badge>
                  </div>

                  {/* Mic status */}
                  <div className="absolute bottom-2 right-2">
                    <div
                      className={cn(
                        "rounded-full p-1.5",
                        !isAudioOn
                          ? "bg-destructive"
                          : "bg-background/80 backdrop-blur-sm"
                      )}
                    >
                      {!isAudioOn ? (
                        <MicOff className="w-3 h-3 text-white" />
                      ) : (
                        <Mic className="w-3 h-3" />
                      )}
                    </div>
                  </div>
                </Card>
              </Card>
            </div>
          )}
        </div>

        {/* Chat Sidebar */}
        {showChat && (
          <div className="w-80 border-l border-border flex flex-col">
            <div className="p-4 border-b border-border">
              <h2 className="font-semibold">Meeting chat</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {remoteSocketId ? "2 participants" : "Only you"}
              </p>
            </div>

            <ScrollArea className="flex-1 p-4">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No messages yet
                </p>
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "rounded-lg p-3",
                        message.isLocal
                          ? "bg-primary text-primary-foreground ml-4"
                          : message.sender === "System"
                          ? "bg-muted/50 text-center"
                          : "bg-muted mr-4"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-semibold">
                          {message.sender}
                        </p>
                        <p className="text-[10px] opacity-70">
                          {message.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <p className="text-sm">{message.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            <div className="p-4 border-t border-border">
              <div className="flex gap-2">
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1"
                  disabled={!remoteSocketId}
                />
                <Button
                  size="icon"
                  onClick={handleSendMessage}
                  disabled={!messageInput.trim() || !remoteSocketId}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {!remoteSocketId && (
                <p className="text-xs text-muted-foreground mt-2">
                  Chat will be available when someone joins
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="border-t border-border px-4 py-4">
        <div className="flex items-center justify-center gap-3">
          <Button
            variant={!isAudioOn ? "destructive" : "secondary"}
            size="lg"
            onClick={handleToggleAudio}
            className="gap-2"
          >
            {!isAudioOn ? (
              <MicOff className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
            {!isAudioOn ? "Unmute" : "Mute"}
          </Button>

          <Button
            variant={!isVideoOn ? "destructive" : "secondary"}
            size="lg"
            onClick={handleToggleVideo}
            className="gap-2"
          >
            {!isVideoOn ? (
              <VideoOff className="w-5 h-5" />
            ) : (
              <Video className="w-5 h-5" />
            )}
            {!isVideoOn ? "Start Video" : "Stop Video"}
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={() => setShowChat(!showChat)}
            className="gap-2 relative"
          >
            <MessageSquare className="w-5 h-5" />
            Chat
            {messages.length > 0 && !showChat && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {messages.length}
              </Badge>
            )}
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={toggleFullscreen}
            className="gap-2"
          >
            <Maximize className="w-5 h-5" />
            {isFullscreen ? "Exit" : "Fullscreen"}
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={() => alert("Screen sharing coming soon!")}
            className="gap-2"
          >
            <Monitor className="w-5 h-5" />
            Share
          </Button>

          <div className="flex-1" />

          <Button
            variant="destructive"
            size="lg"
            onClick={handleLeaveMeeting}
            className="gap-2"
          >
            <PhoneOff className="w-5 h-5" />
            Leave
          </Button>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Settings
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowSettings(false)}
              >
                ✕
              </Button>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">Audio</h3>
                <div className="space-y-2">
                  <Button variant="outline" className="w-full justify-start">
                    Select Microphone
                  </Button>
                  <Button variant="outline" className="w-full justify-start">
                    Select Speaker
                  </Button>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-2">Video</h3>
                <Button variant="outline" className="w-full justify-start">
                  Select Camera
                </Button>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground">
                  Room Code: <span className="font-mono">{room}</span>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Connection:{" "}
                  <span className="font-medium">{connectionState}</span>
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
