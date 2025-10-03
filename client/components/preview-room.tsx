"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Settings,
  Copy,
  Check,
} from "lucide-react";

const PreviewPage: React.FC = () => {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [userName, setUserName] = useState(
    searchParams.get("userName") ||
      (typeof window !== "undefined"
        ? sessionStorage.getItem("userName")
        : null) ||
      "You"
  );
  const [room, setRoom] = useState(
    searchParams.get("room") ||
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
      } catch (error) {
        console.error("Error accessing media devices:", error);
        setPermissionError(
          "Unable to access camera/microphone. Please check permissions."
        );
      } finally {
        setIsLoading(false);
      }
    };

    getMediaStream();

    // Cleanup on unmount - use the local stream variable
    return () => {
      if (stream) {
        console.log("Stopping all tracks on cleanup...");
        stream.getTracks().forEach((track) => {
          track.stop();
          console.log(`Stopped ${track.kind} track`);
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

        console.log(
          `Video track ${videoTrack.enabled ? "enabled" : "disabled"}`
        );
      }
    }
  };

  const toggleAudio = () => {
    if (previewStream) {
      const audioTrack = previewStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
        console.log(
          `Audio track ${audioTrack.enabled ? "enabled" : "disabled"}`
        );
      }
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoinCall = () => {
    // Store preferences
    if (typeof window !== "undefined") {
      sessionStorage.setItem("userName", userName);
      sessionStorage.setItem("room", room);
      sessionStorage.setItem("videoEnabled", String(videoEnabled));
      sessionStorage.setItem("audioEnabled", String(audioEnabled));
    }

    // // Stop preview stream - it will be recreated in the room
    // if (previewStream) {
    //   previewStream.getTracks().forEach((track) => track.stop());
    // }

    // Navigate to room using Next.js router
    router.push(`/room/${room}?userName=${encodeURIComponent(userName)}`);
    console.log("/room/${room}?userName=${encodeURIComponent()}", userName);
  };

  const handleBack = () => {
    console.log("Back button clicked - stopping tracks...");
    if (previewStream) {
      previewStream.getTracks().forEach((track) => {
        track.stop();
        console.log(`Stopped ${track.kind} track in handleBack`);
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
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-800">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Video className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-semibold text-white">VideoCall</span>
          </div>
        </div>
      </header>

      {/* Preview Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2 text-white">
              Ready to join?
            </h1>
            <p className="text-gray-400">
              Check your video and audio before entering
            </p>
          </div>

          <div className="space-y-6">
            {/* Video Preview Card */}
            <div className="relative aspect-video bg-gray-800 rounded-2xl overflow-hidden shadow-2xl">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
                    <p className="text-white">Loading camera...</p>
                  </div>
                </div>
              )}

              {permissionError && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-6">
                    <VideoOff className="w-16 h-16 text-red-500 mb-4 mx-auto" />
                    <p className="text-red-500 font-medium mb-2">
                      Camera access denied
                    </p>
                    <p className="text-gray-400 text-sm">{permissionError}</p>
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
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                      <div className="text-center">
                        <div className="w-24 h-24 bg-blue-500 rounded-full flex items-center justify-center text-white text-4xl font-bold mb-4 mx-auto">
                          {userName.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-gray-300">{userName}</p>
                        <p className="text-gray-500 text-sm mt-2">
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
                          ? "bg-gray-700 hover:bg-gray-600"
                          : "bg-red-600 hover:bg-red-700"
                      } ${
                        !previewStream ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      title={
                        audioEnabled ? "Mute microphone" : "Unmute microphone"
                      }
                    >
                      {audioEnabled ? (
                        <Mic className="w-5 h-5 text-white" />
                      ) : (
                        <MicOff className="w-5 h-5 text-white" />
                      )}
                    </button>

                    <button
                      onClick={toggleVideo}
                      disabled={!previewStream}
                      className={`rounded-full w-12 h-12 flex items-center justify-center transition-colors ${
                        videoEnabled
                          ? "bg-gray-700 hover:bg-gray-600"
                          : "bg-red-600 hover:bg-red-700"
                      } ${
                        !previewStream ? "opacity-50 cursor-not-allowed" : ""
                      }`}
                      title={
                        videoEnabled ? "Turn off camera" : "Turn on camera"
                      }
                    >
                      {videoEnabled ? (
                        <Video className="w-5 h-5 text-white" />
                      ) : (
                        <VideoOff className="w-5 h-5 text-white" />
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Meeting Info Card */}
            <div className="p-4 bg-gray-800 rounded-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Room code</p>
                  <p className="font-mono font-semibold text-lg text-white">
                    {room}
                  </p>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
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
                className="flex-1 px-6 py-3 text-white bg-transparent border-2 border-gray-700 hover:bg-gray-800 rounded-xl font-semibold transition-colors"
              >
                Back
              </button>

              <button
                onClick={handleJoinCall}
                disabled={permissionError !== null}
                className={`flex-1 px-6 py-3 text-white rounded-xl font-semibold transition-colors ${
                  permissionError
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                Join now
              </button>
            </div>

            {/* Device Status (Optional Debug Info) */}
            {previewStream && process.env.NODE_ENV === "development" && (
              <div className="p-4 bg-gray-800 rounded-xl">
                <p className="text-white font-semibold mb-2">Preview Status</p>
                <div className="space-y-1 text-sm text-gray-400">
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

export default PreviewPage;
