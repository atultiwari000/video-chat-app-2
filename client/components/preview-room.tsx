"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Video, VideoOff, Mic, MicOff, Copy, Check } from "lucide-react";

const PreviewPageClient: React.FC = () => {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const roomFromUrl = typeof params?.roomId === "string" ? params.roomId : "";
  const usernameFromUrl = searchParams?.get("username") || "";

  const [userName, setUserName] = useState(
    usernameFromUrl ||
      (typeof window !== "undefined"
        ? sessionStorage.getItem("userName")
        : null) ||
      "You"
  );

  const [room, setRoom] = useState(
    roomFromUrl ||
      (typeof window !== "undefined" ? sessionStorage.getItem("room") : null) ||
      ""
  );
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const getMediaStream = async () => {
      try {
        setIsLoading(true);
        console.log("Requesting media stream...");
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        console.log("Media stream obtained:", stream);
        console.log("Video tracks:", stream.getVideoTracks());
        console.log("Audio tracks:", stream.getAudioTracks());

        setPreviewStream(stream);
        setPermissionError(null);
      } catch (error: any) {
        console.error("Error accessing media devices:", error);
        console.error("Error name:", error.name);
        console.error("Error message:", error.message);

        let errorMsg = "Unable to access camera/microphone.";

        if (error.name === "NotAllowedError") {
          errorMsg =
            "Camera/microphone access denied. Please allow permissions in browser settings.";
        } else if (error.name === "NotFoundError") {
          errorMsg = "No camera or microphone found on this device.";
        } else if (error.name === "NotReadableError") {
          errorMsg =
            "Camera or microphone is already in use by another application.";
        }

        setPermissionError(errorMsg);
      } finally {
        setIsLoading(false);
      }
    };

    getMediaStream();

    return () => {
      console.log("Cleaning up media stream...");
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current || !previewStream) {
      console.log("Video ref or stream not ready:", {
        hasVideoRef: !!videoRef.current,
        hasStream: !!previewStream,
      });
      return;
    }

    const videoEl = videoRef.current;
    console.log("Attaching stream to video element...");

    videoEl.srcObject = previewStream;

    videoEl.play().catch((err) => {
      console.error("Play failed:", err.name, err.message);
      if (err.name === "NotAllowedError") {
        console.log("Autoplay blocked - waiting for user interaction");
      }
    });

    return () => {
      console.log("Detaching stream from video element...");
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    };
  }, [previewStream]);

  const toggleVideo = () => {
    if (previewStream) {
      const videoTrack = previewStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (previewStream) {
      const audioTrack = previewStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinCall = () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("userName", userName);
      sessionStorage.setItem("room", room);
      sessionStorage.setItem("videoEnabled", String(videoEnabled));
      sessionStorage.setItem("audioEnabled", String(audioEnabled));
    }

    const finalUserName = userName || "You";
    router.push(
      `/room/${encodeURIComponent(room)}?username=${encodeURIComponent(
        finalUserName
      )}`
    );
  };

  const handleBack = () => {
    if (previewStream) {
      previewStream.getTracks().forEach((track) => {
        track.stop();
      });
      setPreviewStream(null);
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    router.push("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary rounded-lg flex items-center justify-center">
              <Video className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
            </div>
            <span className="text-lg sm:text-xl font-semibold">MeetFlow</span>
          </div>
        </div>
      </header>

      {/* Preview Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-6 sm:py-8">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
              Ready to join?
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Check your video and audio before entering
            </p>
          </div>

          <div className="space-y-4 sm:space-y-6">
            {/* Video Preview Card */}
            <div className="relative aspect-video bg-card rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-card z-10">
                  <div className="text-center">
                    <div className="animate-spin w-10 h-10 sm:w-12 sm:h-12 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
                    <p className="text-sm sm:text-base">Loading camera...</p>
                  </div>
                </div>
              )}

              {permissionError && (
                <div className="absolute inset-0 flex items-center justify-center bg-card z-10">
                  <div className="text-center p-4 sm:p-6">
                    <VideoOff className="w-12 h-12 sm:w-16 sm:h-16 text-destructive mb-4 mx-auto" />
                    <p className="text-sm sm:text-base text-destructive font-medium mb-2">
                      Camera access denied
                    </p>
                    <p className="text-xs sm:text-sm text-muted-foreground px-4">
                      {permissionError}
                    </p>
                  </div>
                </div>
              )}

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  transform: "scaleX(-1)",
                  display:
                    !isLoading && !permissionError && previewStream
                      ? "block"
                      : "none",
                }}
              />

              {!isLoading &&
                !permissionError &&
                previewStream &&
                !videoEnabled && (
                  <div className="absolute inset-0 flex items-center justify-center bg-card z-10">
                    <div className="text-center">
                      <div className="w-16 h-16 sm:w-24 sm:h-24 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-2xl sm:text-4xl font-bold mb-3 sm:mb-4 mx-auto">
                        {userName.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-sm sm:text-base text-card-foreground">
                        {userName}
                      </p>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-2">
                        Camera is off
                      </p>
                    </div>
                  </div>
                )}

              {!isLoading && !permissionError && previewStream && (
                <>
                  {/* Username overlay */}
                  <div className="absolute bottom-3 sm:bottom-5 left-3 sm:left-4 bg-black/60 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg z-20">
                    <p className="text-xs sm:text-sm font-medium text-white">
                      {userName}
                    </p>
                  </div>

                  {/* Preview Controls */}
                  <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-3 z-20">
                    <button
                      onClick={toggleAudio}
                      disabled={!previewStream}
                      className={`rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center transition-colors ${
                        audioEnabled
                          ? "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                          : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      } ${
                        !previewStream ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      title={
                        audioEnabled ? "Mute microphone" : "Unmute microphone"
                      }
                    >
                      {audioEnabled ? (
                        <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <MicOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>

                    <button
                      onClick={toggleVideo}
                      disabled={!previewStream}
                      className={`rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center transition-colors ${
                        videoEnabled
                          ? "bg-secondary hover:bg-secondary/80 text-secondary-foreground"
                          : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                      } ${
                        !previewStream ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      title={
                        videoEnabled ? "Turn off camera" : "Turn on camera"
                      }
                    >
                      {videoEnabled ? (
                        <Video className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <VideoOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Meeting Info Card */}
            <div className="p-3 sm:p-4 bg-card rounded-lg sm:rounded-xl border border-border">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Room code
                  </p>
                  <p className="font-mono font-semibold text-base sm:text-lg truncate">
                    {room}
                  </p>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors flex-shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="text-xs sm:text-sm">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="text-xs sm:text-sm">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 sm:gap-4">
              <button
                onClick={handleBack}
                className="flex-1 px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border-2 border-border hover:bg-secondary/50 rounded-lg sm:rounded-xl font-semibold transition-colors text-sm sm:text-base"
              >
                Back
              </button>

              <button
                onClick={handleJoinCall}
                disabled={permissionError !== null}
                className={`flex-1 px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg sm:rounded-xl font-semibold transition-colors text-sm sm:text-base ${
                  permissionError
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                Join now
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default PreviewPageClient;
