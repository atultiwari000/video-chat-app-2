import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSocket } from "@/context/Socket";
import { useMedia } from "./useMedia";
import { useSignaling } from "./useSignaling";
import socketService from "@/services/socket";
import PeerService from "../services/peer";

export const useRoom = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const socket = useSocket();

  const localSocketId = socket?.id ?? null;
  
  const getRoom = () => {
    if (typeof window === 'undefined') return "";
    
    const pathParts = window.location.pathname.split('/');
    const roomFromPath = pathParts[2];
    if (roomFromPath) return roomFromPath;
    
    return searchParams.get("room") || "";
  };

  const getUserName = () => {
    if (typeof window === 'undefined') return "You";
    
    const pathParts = window.location.pathname.split('/');
    const userFromPath = pathParts[3];
    if (userFromPath) return decodeURIComponent(userFromPath);
    
    return searchParams.get("userName") || "You";
  };

  const [localUserName, setLocalUserName] = useState(getUserName());
  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string>("Remote User");
  const [room, setRoom] = useState(getRoom());
  const hasInitiatedCall = useRef(false);


  // Store username & room in sessionStorage on mount
  useEffect(() => {
    const userName = getUserName();
    const roomCode = getRoom();

    if (userName !== "You" && typeof window !== 'undefined') {
      sessionStorage.setItem("userName", userName);
      setLocalUserName(userName);
    }

    if (roomCode && typeof window !== 'undefined') {
      sessionStorage.setItem("room", roomCode);
      setRoom(roomCode);
    }
  }, []);

  useEffect(() => {
    if (!socket || !room || !localUserName) return;

    let joined = false;

    const joinRoom = () => {
      if (joined) return;
      console.log("📤 Joining room:", { room, userName: localUserName });
      socket.emit("room:join", { room, userName: localUserName });
      joined = true;
    };

    if (socket.connected) {
      joinRoom();
    } else {
      const handleConnect = () => {
        joinRoom();
      };
      socket.once("connect", handleConnect);
      return () => socket.off("connect", handleConnect);
    }
    
    // Cleanup on unmount - leave the room
    return () => {
      if (joined && socket) {
        socket.emit("leave:room", { room });
      }
    };
  }, [socket, room, localUserName]);
  
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
    // Add localSocketId to the conditions
    if (
      hasInitiatedCall ||
      !remoteSocketId ||
      !localSocketId || // Ensure we have our own ID
      !media.myStream ||
      !handleCallUser
    ) {
      return;
    }

    // Don't auto-call if remote stream already exists (call in progress)
    if (media.remoteStream) {
      return;
    }

    const peerState = PeerService.getPeer()?.connectionState;
    if (
      peerState === "connecting" ||
      peerState === "connected" ||
      media.remoteStream
    ) {
      return;
    }

    // --- THIS IS THE FIX ---
    // Only the user with the "smaller" socket ID will initiate the call.
    // This prevents both users from calling each other at the same time.
    const amITheCaller = localSocketId < remoteSocketId;
        console.log(`Deciding who calls. My ID: ${localSocketId}, Remote ID: ${remoteSocketId}. Am I the caller? ${amITheCaller}`);

        if (amITheCaller) {
            console.log("🚀 I am the designated caller. Auto-initiating call...");
            
            // UPDATE THIS: Set the ref's .current property
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
    localSocketId, // Add localSocketId to dependency array
    media.myStream,
    media.remoteStream,
    // hasInitiatedCall,
    handleCallUser,
  ]);

  // // Reset call flag when remote leaves
  // useEffect(() => {
  //   if (!remoteSocketId) setHasInitiatedCall(false);
  // }, [remoteSocketId]);

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
          socket.emit("leave:room", { room });
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
    const handlePopState = (e: PopStateEvent) => {
      const confirmLeave = window.confirm(
        "Are you sure you want to go back? Your call will be ended."
      );
      
      if (confirmLeave) {
        media.endCall();
      } else {
        window.history.pushState(null, "", window.location.pathname);
      }
    };

    window.history.pushState(null, "", window.location.pathname);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [media]);

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

  return {
    getUserName,
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