"use client";

import type React from "react";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MessageSquare,
  Users,
  PhoneOff,
  Copy,
  Check,
  Maximize,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRoom } from "@/hooks/useRoom";
import { ChatSidebar } from "./chatSideBar";
import { useSpeechCaptions } from "@/hooks/useSpeechRecognition";
import { Subtitles } from "lucide-react";

export default function MeetingRoom() {
  const router = useRouter();

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
    messages,
    sendMessage,
    roomFullError,
  } = useRoom();

  const {
    captionsEnabled,
    currentCaption,
    toggleCaptions,
    isSupported: captionsSupported,
  } = useSpeechCaptions(remoteStream);

  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [showChat, setShowChat] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);

    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  useEffect(() => {
    if (myStream) {
      setIsVideoOn(isVideoEnabled());
      setIsAudioOn(isAudioEnabled());
    }
  }, [myStream, isVideoEnabled, isAudioEnabled]);

  const pipVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && myStream) {
        el.srcObject = myStream;
        el.play().catch((e) => console.log("PIP play error:", e));
      }
    },
    [myStream]
  );

  const waitingVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      if (el && myStream) {
        const hasLiveTracks = myStream
          .getTracks()
          .some((t) => t.readyState === "live");
        if (hasLiveTracks) {
          el.srcObject = myStream;
          el.play().catch((e) => {
            if (e.name !== "AbortError") {
              console.log("Waiting video play error:", e);
            }
          });
        }
      }
    },
    [myStream]
  );

  const handleToggleVideo = async () => {
    const newState = await toggleVideo();
    setIsVideoOn(newState ?? false);
  };

  const handleToggleAudio = async () => {
    const newState = await toggleAudio();
    setIsAudioOn(newState ?? false);
  };

  const handleLeaveMeeting = () => {
    const confirmEnd = window.confirm(
      "Are you sure you want to leave? Your call will end."
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

  const handleMessageInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setMessageInput(e.target.value);
    },
    []
  );

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
      {roomFullError && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Room Full</h2>
                <p className="text-sm text-gray-500">Unable to join meeting</p>
              </div>
            </div>

            <p className="text-gray-700 mb-6">{roomFullError}</p>

            <button
              onClick={() => router.push("/")}
              className="w-full bg-primary text-white py-2 px-4 rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              Return to Home
            </button>
          </div>
        </div>
      )}
      {/* Header */}
      <header className="border-b border-border px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Video className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs sm:text-sm font-semibold truncate">
              Meeting Room
            </h1>
            <div className="flex items-center gap-1 sm:gap-2">
              <p className="text-[10px] sm:text-xs text-muted-foreground font-mono truncate">
                {room}
              </p>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0"
                onClick={handleCopyCode}
              >
                {codeCopied ? (
                  <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-green-500" />
                ) : (
                  <Copy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                )}
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <Badge
            variant={connectionState === "connected" ? "default" : "secondary"}
            className="gap-1 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5"
          >
            {connectionState === "connected" ? "🟢" : "🟡"}
            <span className="hidden sm:inline">{connectionState}</span>
          </Badge>
          <Badge
            variant="secondary"
            className="gap-1 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5"
          >
            <Users className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
            {remoteSocketId ? "2" : "1"}
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Area */}
        <div className="flex-1 p-2 sm:p-4 relative">
          {!remoteSocketId || !remoteStream ? (
            // Waiting state
            <div className="h-full flex flex-col items-center justify-center gap-3 sm:gap-4">
              <Card className="relative w-full max-w-3xl aspect-video overflow-hidden">
                {isVideoOn && myStream ? (
                  <video
                    key="local-waiting"
                    ref={waitingVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />
                ) : (
                  <div className="absolute inset-0 bg-muted flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                        <span className="text-2xl sm:text-4xl font-semibold text-primary">
                          {localUserName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-base sm:text-lg font-medium">
                        {localUserName}
                      </p>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 bg-background/80 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 sm:gap-2">
                  <p className="text-xs sm:text-sm font-medium">
                    {localUserName}
                  </p>
                  <Badge
                    variant="secondary"
                    className="text-[10px] sm:text-xs px-1 py-0"
                  >
                    You
                  </Badge>
                </div>

                <div className="absolute bottom-2 sm:bottom-4 right-2 sm:right-4">
                  <div
                    className={cn(
                      "rounded-full p-1.5 sm:p-2",
                      !isAudioOn
                        ? "bg-destructive"
                        : "bg-background/80 backdrop-blur-sm"
                    )}
                  >
                    {!isAudioOn ? (
                      <MicOff className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    ) : (
                      <Mic className="w-3 h-3 sm:w-4 sm:h-4" />
                    )}
                  </div>
                </div>
              </Card>

              <div className="text-center px-4">
                <div className="inline-flex items-center gap-2 bg-muted px-3 sm:px-4 py-1.5 sm:py-2 rounded-full mb-2">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  <p className="text-xs sm:text-sm font-medium">
                    Waiting for others to join...
                  </p>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Share the room code:{" "}
                  <span className="font-mono font-semibold">{room}</span>
                </p>
              </div>
            </div>
          ) : (
            // Active call state
            <div className="h-full flex flex-col md:flex-row gap-2 sm:gap-4">
              {/* Remote participant video */}
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
                      <div className="w-20 h-20 sm:w-32 sm:h-32 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                        <span className="text-3xl sm:text-5xl font-semibold text-primary">
                          {remoteUserName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <p className="text-lg sm:text-xl font-medium">
                        {remoteUserName}
                      </p>
                    </div>
                  </div>
                )}

                {captionsEnabled && currentCaption && (
                  <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 max-w-[90%] bg-black/90 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg text-xs sm:text-base backdrop-blur-sm shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
                    {currentCaption}
                  </div>
                )}

                <div className="absolute bottom-2 sm:bottom-4 left-2 sm:left-4 bg-background/80 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg">
                  <p className="text-xs sm:text-sm font-medium">
                    {remoteUserName}
                  </p>
                </div>

                {captionsEnabled && (
                  <div className="absolute top-2 sm:top-4 right-2 sm:right-4 bg-green-500/90 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg flex items-center gap-1 sm:gap-2">
                    <Subtitles className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                    <span className="text-[10px] sm:text-xs font-medium text-white">
                      Captions Active
                    </span>
                  </div>
                )}
              </Card>
              {/* Local video (PIP) */}
              <Card className="w-full md:w-64 lg:w-80 h-32 md:h-auto">
                <Card className="relative aspect-video overflow-hidden">
                  {isVideoOn && myStream ? (
                    <video
                      key="local-pip"
                      ref={pipVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ transform: "scaleX(-1)" }}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-muted flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-1 sm:mb-2">
                          <span className="text-lg sm:text-2xl font-semibold text-primary">
                            {localUserName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <p className="text-xs sm:text-sm font-medium">
                          {localUserName}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-1 sm:bottom-2 left-1 sm:left-2 bg-background/80 backdrop-blur-sm px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium flex items-center gap-1">
                    {localUserName}
                    <Badge
                      variant="secondary"
                      className="text-[8px] sm:text-[10px] px-0.5 sm:px-1 py-0"
                    >
                      You
                    </Badge>
                  </div>

                  <div className="absolute bottom-1 sm:bottom-2 right-1 sm:right-2">
                    <div
                      className={cn(
                        "rounded-full p-1 sm:p-1.5",
                        !isAudioOn
                          ? "bg-destructive"
                          : "bg-background/80 backdrop-blur-sm"
                      )}
                    >
                      {!isAudioOn ? (
                        <MicOff className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                      ) : (
                        <Mic className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
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
          <ChatSidebar
            messages={messages}
            onSendMessage={sendMessage}
            remoteSocketId={remoteSocketId}
            isMobile={isMobile}
            onClose={() => setShowChat(false)}
          />
        )}
      </div>

      {/* Controls Bar */}
      <div className="border-t border-border px-2 sm:px-4 py-2 sm:py-4">
        <div className="flex items-center justify-center gap-1.5 sm:gap-3">
          <Button
            variant={!isAudioOn ? "destructive" : "secondary"}
            size={isMobile ? "icon" : "lg"}
            onClick={handleToggleAudio}
            className={cn("gap-2", isMobile && "h-10 w-10")}
          >
            {!isAudioOn ? (
              <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
            <span className="hidden md:inline">
              {!isAudioOn ? "Unmute" : "Mute"}
            </span>
          </Button>

          <Button
            variant={!isVideoOn ? "destructive" : "secondary"}
            size={isMobile ? "icon" : "lg"}
            onClick={handleToggleVideo}
            className={cn("gap-2", isMobile && "h-10 w-10")}
          >
            {!isVideoOn ? (
              <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />
            ) : (
              <Video className="w-4 h-4 sm:w-5 sm:h-5" />
            )}
            <span className="hidden md:inline">
              {!isVideoOn ? "Start Video" : "Stop Video"}
            </span>
          </Button>

          <Button
            variant="secondary"
            size={isMobile ? "icon" : "lg"}
            onClick={() => setShowChat(!showChat)}
            className={cn("gap-2 relative", isMobile && "h-10 w-10")}
          >
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden md:inline">Chat</span>
            {messages.length > 0 && !showChat && (
              <Badge className="absolute -top-1 -right-1 h-4 w-4 sm:h-5 sm:w-5 p-0 flex items-center justify-center text-[10px]">
                {messages.length}
              </Badge>
            )}
          </Button>

          {!isMobile && (
            <>
              <Button
                variant={captionsEnabled ? "default" : "secondary"}
                size="lg"
                onClick={toggleCaptions}
                disabled={!remoteStream || !captionsSupported}
                className={cn(
                  "gap-2",
                  captionsEnabled && "bg-green-600 hover:bg-green-700"
                )}
                {...(!captionsSupported && {
                  title: "Captions not supported in this browser",
                })}
              >
                <Subtitles className="w-5 h-5" />
                {captionsEnabled ? "Captions On" : "Captions Off"}
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
            </>
          )}

          <div className="flex-1" />

          <Button
            variant="destructive"
            size={isMobile ? "icon" : "lg"}
            onClick={handleLeaveMeeting}
            className={cn("gap-2", isMobile && "h-10 w-10")}
          >
            <PhoneOff className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden md:inline">Leave</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
