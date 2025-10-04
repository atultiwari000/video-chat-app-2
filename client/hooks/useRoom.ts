import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useParams, useRouter } from "next/navigation";
import { useSocket } from "@/context/Socket";
import { useMedia } from "./useMedia";
import { useSignaling } from "./useSignaling";
import socketService from "@/services/socket";
import PeerService from "../services/peer";
import { use } from "react";

export const useRoom = () => {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const socket = useSocket();

  const localSocketId = socket?.id ?? null;
  
  // Safe access to params
  const roomIdFromUrl = typeof params?.roomId === 'string' ? params.roomId : '';
  const usernameFromQuery = searchParams?.get("username") || '';

  const [room, setRoom] = useState<string>(() => {
    if (roomIdFromUrl) return roomIdFromUrl;
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem("room") || "";
    }
    return "";
  });

  const [localUserName, setLocalUserName] = useState<string>(() => {
    if (usernameFromQuery) return usernameFromQuery;
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem("userName") || "You";
    }
    return "You";
  });
  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string>("Remote User");
  const hasInitiatedCall = useRef(false);


// Store in sessionStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (usernameFromQuery !== "You") {
      sessionStorage.setItem("userName", usernameFromQuery);
      setLocalUserName(usernameFromQuery);
    }

    if (roomIdFromUrl) {
      sessionStorage.setItem("room", roomIdFromUrl);
      setRoom(roomIdFromUrl);
    }
  }, [usernameFromQuery, roomIdFromUrl]);

  // In useRoom.ts - Replace the entire join effect with this:
  useEffect(() => {
    if (!socket?.connected || !room || !localUserName) {
      console.log("⏸️ Not ready to join:", { 
        connected: socket?.connected, 
        room, 
        localUserName 
      });
      return;
    }

    // Use a ref to track if we've joined
    let hasJoinedThisSession = false;

    const joinRoom = () => {
      if (hasJoinedThisSession) return;
      console.log("📤 Joining room:", { room, userName: localUserName, socketId: socket.id });
      socket.emit("room:join", { room, userName: localUserName });
      hasJoinedThisSession = true;
    };

    // Small delay to prevent rapid join/leave cycles
    const timeoutId = setTimeout(joinRoom, 100);

    // Cleanup only on unmount (component removal), not on re-renders
    return () => {
      clearTimeout(timeoutId);
      // Only emit leave if we actually joined
      if (hasJoinedThisSession && socket?.connected) {
        console.log("👋 Leaving room on unmount:", room);
        socket.emit("leave:room", { room });
      }
    };
  }, [socket?.id, room, localUserName]); 
  
  // Media hook with router passed
  const media = useMedia({
    remoteSocketId,
    localUserName,
    remoteUserName,
    setRemoteUserName,
    room,
    navigate: router  // Pass Next.js router
  });

  // Signaling hook
  const signaling = useSignaling({
    myStream: media.myStream,
    setMyStream: media.setMyStream,
    setRemoteStream: media.setRemoteStream,
    setRemoteUserName,
    setRemoteSocketId,
    remoteSocketId, 
    localUserName,
  });

  // Sync remoteSocketId from signaling
  useEffect(() => {
    const sigId = signaling.remoteSocketId ?? null;
    if (sigId !== remoteSocketId) {
      setRemoteSocketId(sigId);
    }
  }, [signaling.remoteSocketId, remoteSocketId]);

  // Auto-start media with stored preferences
  useEffect(() => {
    const autoStart = async () => {
      if (typeof window === 'undefined') return;
      
      const videoEnabled = sessionStorage.getItem("videoEnabled") !== "false";
      const audioEnabled = sessionStorage.getItem("audioEnabled") !== "false";

      if (socket && !media.myStream) {
        try {
          console.log("Auto-starting media with preferences:", {
            videoEnabled,
            audioEnabled,
          });
          const stream = await navigator.mediaDevices.getUserMedia({
            video: videoEnabled,
            audio: audioEnabled,
          });
          media.setMyStream(stream);
          console.log("Media auto-started successfully");
        } catch (error) {
          console.error("Error auto-starting media:", error);
        }
      }
    };

    const timer = setTimeout(autoStart, 500);
    return () => clearTimeout(timer);
  }, [socket, media]);

  const { handleCallUser } = signaling; 

  // AUTO-CALL: automatically initiate call if conditions are met
  useEffect(() => {
    if (
      hasInitiatedCall.current ||
      !remoteSocketId ||
      !localSocketId ||
      !media.myStream ||
      !handleCallUser
    ) {
      return;
    }

    // Check if remote stream already exists
    if (media.remoteStream) {
      return;
    }

    // IMPORTANT: Check peer state - only call if "new"
    const peer = PeerService.getPeer();
    const peerState = peer?.connectionState;
    
    console.log("AUTO-CALL check - peer state:", peerState);
    
    if (peerState !== "new") {
      console.log("Peer not in 'new' state, skipping call. State:", peerState);
      return;
    }

    // Determine who calls
    const amITheCaller = localSocketId < remoteSocketId;
    console.log(`Deciding who calls. My ID: ${localSocketId}, Remote ID: ${remoteSocketId}. Am I caller? ${amITheCaller}`);

    if (amITheCaller) {
      console.log("🚀 I am the designated caller. Auto-initiating call...");
      hasInitiatedCall.current = true;

      const timer = setTimeout(() => {
        handleCallUser();
      }, 500);

      return () => clearTimeout(timer);
    } else {
      console.log("📞 I am the designated receiver. Waiting for incoming call.");
    }
  }, [
    remoteSocketId,
    localSocketId,
    media.myStream,
    media.remoteStream,
    handleCallUser,
  ]);

  useEffect(() => {
  if (!remoteSocketId) {
    // Remote left, reset call flag
    hasInitiatedCall.current = false;
    console.log("Remote left, reset hasInitiatedCall flag");
  }
}, [remoteSocketId]);

  // Handle page reload/close with confirmation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Are you sure you want to leave? Your call will be ended.";
      
      try {
        if (socket) {
          socket.emit("user:disconnecting", { id: socket.id, room });
          if (remoteSocketId) {
            socket.emit("call:end", { to: remoteSocketId });
          }
          socket.emit("leave:room");
        }

        if (media.myStream) {
          media.myStream.getTracks().forEach((t) => {
            try { t.stop(); } catch {}
          });
        }
      } catch (err) {
        console.error("Error in beforeunload cleanup:", err);
      }

      return "Are you sure you want to leave? Your call will be ended.";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [socket, media.myStream, remoteSocketId, room]);

  // Handle browser back button
  useEffect(() => {
    // Prevent back button
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      const confirmLeave = window.confirm(
        "Are you sure you want to go back? Your call will be ended."
      );
      
      if (confirmLeave) {
        media.endCall();
      } else {
        // Push forward instead of staying on same page
        window.history.go(1);
      }
    };

    // Only push state once on mount
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []); // Empty deps - only run once on mount

    // Add state for messages
  const [messages, setMessages] = useState<Array<{
    id: number;
    sender: string;
    text: string;
    timestamp: Date;
    isLocal: boolean;
  }>>([]);

  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data: any) => {
      console.log("📨 Received chat message:", data);
      setMessages((prev) => {
        // Prevent duplicates by checking if message already exists
        const exists = prev.some(msg => msg.id === data.id);
        if (exists) return prev;
        
        return [
          ...prev,
          {
            ...data,
            timestamp: new Date(data.timestamp),
            isLocal: data.sender === localUserName,
          },
        ];
      });
    };

    socket.on("chat:message", handleChatMessage);

    return () => {
      socket.off("chat:message", handleChatMessage);
    };
  }, [socket, localUserName]);

  // Add sendMessage function
  const sendMessage = useCallback((text: string) => {
    if (!socket || !room || !text.trim()) return;
    
    socket.emit("chat:message", {
      room,
      message: text,
      userName: localUserName,
    });
  }, [socket, room, localUserName]);

  // In useRoom.tsx
  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  // Update endCall to call clearChat
  useEffect(() => {
    if (!remoteSocketId) {
      clearChat(); // Clear messages when remote leaves
    }
  }, [remoteSocketId, clearChat]);

  return {
    usernameFromQuery,
    localUserName,
    setLocalUserName,
    remoteUserName,
    setRemoteUserName,
    remoteSocketId,
    socket,
    localSocketId,
    room,
    setRoom,
    messages,
    sendMessage,
    clearChat,
    // media API
    myStream: media.myStream,
    setMyStream: media.setMyStream,
    remoteStream: media.remoteStream,
    setRemoteStream: media.setRemoteStream,
    myVideoRef: media.myVideoRef,
    remoteVideoRef: media.remoteVideoRef,
    testVideoPermissions: media.testVideoPermissions,
    endCall: media.endCall,
    toggleVideo: media.toggleVideo,
    toggleAudio: media.toggleAudio,
    isVideoEnabled: media.isVideoEnabled,
    isAudioEnabled: media.isAudioEnabled,
    connectionState: media.connectionState,
    iceConnectionState: media.iceConnectionState,
    // signaling API
    handleCallUser: signaling.handleCallUser,
    handleCallAccepted: signaling.handleCallAccepted,
    handleIncomingCall: signaling.handleIncomingCall,
    handleUserJoined: signaling.handleUserJoined,
  };
};