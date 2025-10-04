"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { Video, VideoOff, Mic, MicOff, Copy, Check } from "lucide-react";

const PreviewPageClient: React.FC = () => {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  // Get values from URL
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

  // Get media stream on mount
  useEffect(() => {
    let stream: MediaStream | null = null;

    const getMediaStream = async () => {
      try {
        setIsLoading(true);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        setPreviewStream(stream);
        setPermissionError(null);
        // Wait for next tick to ensure state is updated
        await new Promise((resolve) => setTimeout(resolve, 100));

        if (videoRef.current) {
          videoRef.current.srcObject = stream;

          try {
            await videoRef.current.play();
          } catch (playErr: any) {
            // Ignore AbortError - it's usually harmless
            if (playErr.name !== "AbortError") {
              console.error("Error playing video:", playErr);
            }
          }
        }
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

    // Cleanup on unmount - use the local stream variable
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, []);

  // Update video element when stream changes
  useEffect(() => {
    const updateVideoSrc = async () => {
      if (videoRef.current && previewStream) {
        // Pause and clear existing source before setting new one
        try {
          videoRef.current.pause();
        } catch (e) {
          // Ignore if video wasn't playing
        }

        videoRef.current.srcObject = previewStream;

        // Wait a bit before attempting to play
        try {
          await videoRef.current.play();
        } catch (err: any) {
          if (err.name !== "AbortError") {
            console.error("Error playing video:", err);
          }
        }
      }
    };

    updateVideoSrc();
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

    // Make sure userName is not empty
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

    // Clear the video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    router.push("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-semibold">MeetFlow</span>
          </div>
        </div>
      </header>

      {/* Preview Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              Ready to join?
            </h1>
            <p className="text-muted-foreground">
              Check your video and audio before entering
            </p>
          </div>

          <div className="space-y-6">
            {/* Video Preview Card */}
            <div className="relative aspect-video bg-card rounded-2xl overflow-hidden shadow-2xl">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
                    <p>Loading camera...</p>
                  </div>
                </div>
              )}

              {permissionError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-6">
                    <VideoOff className="w-16 h-16 text-destructive mb-4 mx-auto" />
                    <p className="text-destructive font-medium mb-2">
                      Camera access denied
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {permissionError}
                    </p>
                  </div>
                </div>
              )}

              {!isLoading && !permissionError && previewStream && (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{ transform: "scaleX(-1)" }}
                  />

                  {/* Show overlay when video is disabled */}
                  {!videoEnabled && (
                    <div className="absolute inset-0 flex items-center justify-center bg-card">
                      <div className="text-center">
                        <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-4xl font-bold mb-4 mx-auto">
                          {userName.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-card-foreground">{userName}</p>
                        <p className="text-muted-foreground text-sm mt-2">
                          Camera is off
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Username overlay */}
                  <div className="absolute bottom-5 left-4 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg">
                    <p className="text-sm font-medium text-white">{userName}</p>
                  </div>

                  {/* Preview Controls */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
                    <button
                      onClick={toggleAudio}
                      disabled={!previewStream}
                      className={`rounded-full w-12 h-12 flex items-center justify-center transition-colors ${
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
                        <Mic className="w-5 h-5" />
                      ) : (
                        <MicOff className="w-5 h-5" />
                      )}
                    </button>

                    <button
                      onClick={toggleVideo}
                      disabled={!previewStream}
                      className={`rounded-full w-12 h-12 flex items-center justify-center transition-colors ${
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
                        <Video className="w-5 h-5" />
                      ) : (
                        <VideoOff className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Meeting Info Card */}
            <div className="p-4 bg-card rounded-xl border border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Room code</p>
                  <p className="font-mono font-semibold text-lg">{room}</p>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 text-secondary-foreground rounded-lg transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span className="text-sm">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-sm">Copy code</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <button
                onClick={handleBack}
                className="flex-1 px-6 py-3 bg-transparent border-2 border-border hover:bg-secondary/50 rounded-xl font-semibold transition-colors"
              >
                Back
              </button>

              <button
                onClick={handleJoinCall}
                disabled={permissionError !== null}
                className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-colors ${
                  permissionError
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                }`}
              >
                Join now
              </button>
            </div>

            {/* Device Status (Optional Debug Info) */}
            {previewStream && process.env.NODE_ENV === "development" && (
              <div className="p-4 bg-card rounded-xl border border-border">
                <p className="font-semibold mb-2">Preview Status</p>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>Video: {videoEnabled ? "On" : "Off"}</p>
                  <p>Audio: {audioEnabled ? "On" : "Off"}</p>
                  <p>Tracks: {previewStream.getTracks().length}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PreviewPageClient;
