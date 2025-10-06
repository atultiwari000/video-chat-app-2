import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, useParams, useRouter } from "next/navigation";
import { useSocket } from "@/context/Socket";
import { useMedia } from "./useMedia";
import { useSignaling } from "./useSignaling";
import socketService from "@/services/socket";
import PeerService from "../services/peer";
import { use } from "react";

/**
 * useRoom Hook
 * ============
 * This is the MAIN ORCHESTRATOR hook that manages the entire video call room.
 * It combines all the pieces: socket connection, media streams, signaling, and chat.
 * 
 * Think of it as the "conductor" of an orchestra - it coordinates everything.
 */
export const useRoom = () => {
  // ============================================================================
  // STEP 1: Get Navigation & Routing Tools
  // ============================================================================
  // These hooks help us read URL parameters and navigate between pages
  const params = useParams();              // Gets route parameters like /room/[roomId]
  const searchParams = useSearchParams();  // Gets query parameters like ?username=John
  const router = useRouter();              // Lets us navigate to different pages
  const socket = useSocket();              // Gets our WebSocket connection

  // ============================================================================
  // STEP 2: Extract User Information from URL
  // ============================================================================
  // Get our own socket ID (unique identifier for this user's connection)
  const localSocketId = socket?.id ?? null;
  
  // Extract room ID from URL (e.g., /room/abc123 -> "abc123")
  // We check if it's a string because params can be arrays or undefined
  const roomIdFromUrl = typeof params?.roomId === 'string' ? params.roomId : '';
  
  // Extract username from query string (e.g., ?username=John -> "John")
  const usernameFromQuery = searchParams?.get("username") || '';

  // ============================================================================
  // STEP 3: State Management - Room ID
  // ============================================================================
  /**
   * Why useState with a function?
   * - The function inside useState(() => ...) is called "lazy initialization"
   * - It runs ONLY ONCE when the component first mounts
   * - This is useful when the initial value requires computation or reading from storage
   * 
   * Priority order:
   * 1. First, try to get room ID from URL
   * 2. If not in URL, try to get from sessionStorage (persists across page refreshes)
   * 3. If neither exists, default to empty string
   */
  const [room, setRoom] = useState<string>(() => {
    if (roomIdFromUrl) return roomIdFromUrl;
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem("room") || "";
    }
    return "";
  });

  // ============================================================================
  // STEP 4: State Management - Local User Name
  // ============================================================================
  /**
   * Same pattern as room - try multiple sources in priority order:
   * 1. Username from URL query parameter
   * 2. Username from sessionStorage
   * 3. Default to "You"
   */
  const [localUserName, setLocalUserName] = useState<string>(() => {
    if (usernameFromQuery) return usernameFromQuery;
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem("userName") || "You";
    }
    return "You";
  });

  // ============================================================================
  // STEP 5: State Management - Remote User Information
  // ============================================================================
  /**
   * These track the OTHER person in the call
   * - remoteSocketId: Their unique connection ID (null means no one is connected)
   * - remoteUserName: Their display name
   * - roomFullError: Error message if room is already full
   */
  const [remoteSocketId, setRemoteSocketId] = useState<string | null>(null);
  const [remoteUserName, setRemoteUserName] = useState<string>("Remote User");
  const [roomFullError, setRoomFullError] = useState<string | null>(null);
  
  /**
   * useRef for hasInitiatedCall
   * ============================
   * Why useRef instead of useState?
   * - useRef stores a value that PERSISTS across renders but DOESN'T cause re-renders when changed
   * - useState would cause a re-render every time we change it
   * - We use this as a "flag" to prevent calling the same person multiple times
   * - Think of it as a sticky note that we can check/change without triggering updates
   */
  const hasInitiatedCall = useRef(false);

  // ============================================================================
  // STEP 6: Persist User Data to sessionStorage
  // ============================================================================
  /**
   * useEffect #1: Save username and room to sessionStorage
   * 
   * Why do we need this?
   * - If user refreshes the page, we don't want them to lose their room/username
   * - sessionStorage persists data until the browser tab is closed
   * - localStorage would persist even after closing the tab
   * 
   * When does this run?
   * - When usernameFromQuery or roomIdFromUrl changes
   * - This happens on initial page load and when URL changes
   */
  useEffect(() => {
    // Check if we're in browser (not during server-side rendering)
    if (typeof window === "undefined") return;

    // Only save if username is meaningful (not default "You")
    if (usernameFromQuery !== "You") {
      sessionStorage.setItem("userName", usernameFromQuery);
      setLocalUserName(usernameFromQuery);
    }

    // Save room ID if it exists
    if (roomIdFromUrl) {
      sessionStorage.setItem("room", roomIdFromUrl);
      setRoom(roomIdFromUrl);
    }
  }, [usernameFromQuery, roomIdFromUrl]);

  // ============================================================================
  // STEP 7: Join the Room via WebSocket
  // ============================================================================
  /**
   * useEffect #2: Join room when socket connects
   * 
   * This is CRITICAL - it's how we tell the server "I'm here!"
   * 
   * Flow:
   * 1. Wait for socket to be connected
   * 2. Wait for room ID and username to be set
   * 3. Send "room:join" event to server with our info
   * 4. When leaving (component unmounts), send "leave:room" event
   * 
   * Why the ref and timeout?
   * - hasJoinedThisSession prevents joining multiple times in same session
   * - 100ms timeout prevents rapid join/leave cycles (network stability)
   */
  useEffect(() => {
    // Guard clause: only proceed if all required data is ready
    if (!socket?.connected || !room || !localUserName) {
      return;
    }

    // Track if we've already joined in this render cycle
    let hasJoinedThisSession = false;

    const joinRoom = () => {
      if (hasJoinedThisSession) return;
      socket.emit("room:join", { room, userName: localUserName });
      hasJoinedThisSession = true;
    };

    // Small delay to prevent rapid join/leave cycles
    const timeoutId = setTimeout(joinRoom, 100);

    // Cleanup function: runs when component unmounts OR dependencies change
    return () => {
      clearTimeout(timeoutId);
      // Only emit leave if we actually joined
      if (hasJoinedThisSession && socket?.connected) {
        socket.emit("leave:room", { room });
      }
    };
  }, [socket?.id, room, localUserName]); 
  
  // ============================================================================
  // STEP 8: Initialize Media Hook (Audio/Video Management)
  // ============================================================================
  /**
   * useMedia hook manages:
   * - Getting camera/microphone access
   * - Toggling video/audio on/off
   * - Displaying local and remote video
   * - Ending calls
   * 
   * We pass it all the info it needs to function
   */
  const media = useMedia({
    remoteSocketId,
    localUserName,
    remoteUserName,
    setRemoteUserName,
    room,
    navigate: router,  // For navigation when call ends
    socket
  });

  // ============================================================================
  // STEP 9: Initialize Signaling Hook (WebRTC Connection Management)
  // ============================================================================
  /**
   * useSignaling hook manages:
   * - Creating WebRTC offers and answers
   * - Handling ICE candidates (network path discovery)
   * - Setting up peer-to-peer connection
   * 
   * WebRTC needs "signaling" to establish connections - this hook handles that
   */
  const signaling = useSignaling({
    myStream: media.myStream,
    setMyStream: media.setMyStream,
    setRemoteStream: media.setRemoteStream,
    setRemoteUserName,
    setRemoteSocketId,
    remoteSocketId, 
    localUserName,
  });

  // ============================================================================
  // STEP 10: Sync Remote Socket ID from Signaling
  // ============================================================================
  /**
   * useEffect #3: Keep remoteSocketId in sync
   * 
   * Why is this needed?
   * - signaling hook might update remoteSocketId internally
   * - We need to keep our local state in sync with signaling's state
   * - This ensures consistency across the application
   */
  useEffect(() => {
    const sigId = signaling.remoteSocketId ?? null;
    if (sigId !== remoteSocketId) {
      setRemoteSocketId(sigId);
    }
  }, [signaling.remoteSocketId, remoteSocketId]);

  // ============================================================================
  // STEP 11: Auto-Start Media Streams
  // ============================================================================
  /**
   * useEffect #4: Automatically start camera/microphone
   * 
   * Flow:
   * 1. Check user's saved preferences (did they disable video/audio before?)
   * 2. Request permission for camera/microphone
   * 3. If both are disabled, still request audio (to get permission) then disable it
   * 4. Store the stream so it can be used in the call
   * 
   * Why 500ms delay?
   * - Gives socket time to connect before requesting media
   * - Prevents race conditions
   */
  useEffect(() => {
    const autoStart = async () => {
      if (typeof window === 'undefined') return;
      
      // Read user's previous video/audio preferences
      const videoEnabled = sessionStorage.getItem("videoEnabled") !== "false";
      const audioEnabled = sessionStorage.getItem("audioEnabled") !== "false";

      if (socket && !media.myStream) {
        try {
          // Build constraints object for getUserMedia
          const constraints = {
            video: videoEnabled,
            audio: audioEnabled
          };
          
          // If both disabled, still request audio to get permission
          if (!videoEnabled && !audioEnabled) {
            constraints.audio = true;
          }
          
          // Request access to camera/microphone
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          
          // If user wanted both off, disable audio after getting permission
          if (!videoEnabled && !audioEnabled) {
            stream.getAudioTracks().forEach(track => {
              track.enabled = false;
            });
          }
          
          media.setMyStream(stream);
        } catch (error) {
          console.error("Error auto-starting media:", error);
        }
      }
    };

    const timer = setTimeout(autoStart, 500);
    return () => clearTimeout(timer);
  }, [socket, media]);

  const { handleCallUser } = signaling; 

  // ============================================================================
  // STEP 12: Auto-Call Logic (Automatic WebRTC Connection)
  // ============================================================================
  /**
   * useEffect #5: Automatically initiate call when both users are ready
   * 
   * This is the "magic" that makes the call start automatically!
   * 
   * Flow:
   * 1. Check if we haven't already initiated a call
   * 2. Check if remote user is present
   * 3. Check if we're not already connected
   * 4. Determine who should call whom (lower socket ID calls higher)
   * 5. Initiate call if we're the caller
   * 
   * Why does lower socket ID call?
   * - Prevents BOTH users from calling each other simultaneously
   * - Socket IDs are unique strings, so comparison always gives one winner
   * - This is a simple way to elect a "caller" and "answerer"
   */
  useEffect(() => {
    const autoCall = async () => {
      // Guard clauses: check all conditions are met
      if (
        hasInitiatedCall.current ||  // Already called
        !remoteSocketId ||            // No remote user
        !localSocketId ||             // We don't have our own ID yet
        !handleCallUser               // Signaling not ready
      ) return;

      if (media.remoteStream) return;  // Already connected

      // Get peer connection to check its state
      const peer = await PeerService.getPeer();
      const peerState = peer?.connectionState;

      if (peerState !== "new") return;  // Already connecting/connected

      // Determine who calls: compare socket IDs (strings)
      // Lexicographically smaller ID becomes the caller
      const amITheCaller = localSocketId < remoteSocketId;

      if (amITheCaller) {
        hasInitiatedCall.current = true;

        // Small delay before calling (network stability)
        const timer = setTimeout(() => {
          handleCallUser();
        }, 500);

        return () => clearTimeout(timer);
      }
    };

    autoCall();
  }, [remoteSocketId, localSocketId, handleCallUser]);

  // ============================================================================
  // STEP 13: Reset Call Flag When Remote Leaves
  // ============================================================================
  /**
   * useEffect #6: Reset hasInitiatedCall when remote user disconnects
   * 
   * Why?
   * - When remote leaves, we want to be ready to call them again if they rejoin
   * - Resetting the flag allows the auto-call logic to work again
   */
  useEffect(() => {
    if (!remoteSocketId) {
      // Remote left, reset call flag
      hasInitiatedCall.current = false;
    }
  }, [remoteSocketId]);

  // ============================================================================
  // STEP 14: Handle Page Reload/Close (beforeunload event)
  // ============================================================================
  /**
   * useEffect #7: Cleanup when user closes tab or refreshes page
   * 
   * beforeunload fires when:
   * - User closes the tab/window
   * - User refreshes the page
   * - User navigates away
   * 
   * We want to:
   * 1. Show confirmation dialog
   * 2. Notify other user we're leaving
   * 3. Stop all media tracks (turn off camera/mic)
   * 4. Clean up connections
   */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Prevent default and show confirmation dialog
      e.preventDefault();
      e.returnValue = "Are you sure you want to leave? Your call will end.";
      
      try {
        if (socket) {
          // Notify server we're disconnecting
          socket.emit("user:disconnecting", { id: socket.id, room });
          // Tell remote user call is ending
          if (remoteSocketId) {
            socket.emit("call:end", { to: remoteSocketId });
          }
          // Leave the room
          socket.emit("leave:room");
        }

        // Stop all media tracks (camera/microphone)
        if (media.myStream) {
          media.myStream.getTracks().forEach((t) => {
            try { t.stop(); } catch {}
          });
        }
      } catch (err) {
        console.error("Error in beforeunload cleanup:", err);
      }

      return "Are you sure you want to leave? Your call will end.";
    };

    // Register event listener
    window.addEventListener("beforeunload", handleBeforeUnload);
    // Cleanup: remove listener when component unmounts
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [socket, media.myStream, remoteSocketId, room]);

  // ============================================================================
  // STEP 15: Handle Browser Back Button
  // ============================================================================
  /**
   * useEffect #8: Handle browser back button navigation
   * 
   * When user clicks back button:
   * 1. Show confirmation dialog
   * 2. If they confirm, end the call properly
   * 3. If they cancel, stay on the page
   * 
   * Why pushState?
   * - We add a history entry so back button triggers popstate event
   * - Without this, back button would just navigate away without our code running
   */
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      e.preventDefault();
      const confirmLeave = window.confirm(
        "Are you sure you want to go back? Your call will end."
      );
      
      if (confirmLeave) {
        media.endCall();  // Properly end the call
      } else {
        // Push forward to stay on current page
        window.history.go(1);
      }
    };

    // Add history entry (only once on mount)
    window.history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []); // Empty deps - only run once on mount

  // ============================================================================
  // STEP 16: Chat Message State
  // ============================================================================
  /**
   * Chat messages array
   * Each message has:
   * - id: unique identifier
   * - sender: who sent it
   * - text: message content
   * - timestamp: when it was sent
   * - isLocal: true if we sent it, false if remote user sent it
   */
  const [messages, setMessages] = useState<Array<{
    id: number;
    sender: string;
    text: string;
    timestamp: Date;
    isLocal: boolean;
  }>>([]);

  // ============================================================================
  // STEP 17: Receive Chat Messages
  // ============================================================================
  /**
   * useEffect #9: Listen for incoming chat messages
   * 
   * Flow:
   * 1. Server broadcasts "chat:message" event to all users in room
   * 2. We receive it and add to our messages array
   * 3. Mark as local/remote based on sender name
   * 
   * Why check for duplicates?
   * - Sometimes socket events can fire multiple times
   * - We don't want the same message appearing twice
   */
  useEffect(() => {
    if (!socket) return;

    const handleChatMessage = (data: any) => {
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

  // ============================================================================
  // STEP 18: Send Chat Messages
  // ============================================================================
  /**
   * useCallback: Memoized function for sending messages
   * 
   * Why useCallback?
   * - Prevents function from being recreated on every render
   * - Only recreates if dependencies (socket, room, localUserName) change
   * - Better performance, especially when passed to child components
   * 
   * Flow:
   * 1. Validate we have socket, room, and non-empty message
   * 2. Emit "chat:message" event to server
   * 3. Server broadcasts it to all users in the room
   */
  const sendMessage = useCallback((text: string) => {
    if (!socket || !room || !text.trim()) return;
    
    socket.emit("chat:message", {
      room,
      message: text,
      userName: localUserName,
    });
  }, [socket, room, localUserName]);

  // ============================================================================
  // STEP 19: Clear Chat Function
  // ============================================================================
  /**
   * useCallback: Clear all messages
   * Used when remote user leaves
   */
  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  // ============================================================================
  // STEP 20: Auto-Clear Chat When Remote Leaves
  // ============================================================================
  /**
   * useEffect #10: Clear chat when remote user disconnects
   * 
   * Why?
   * - When someone leaves, the conversation is over
   * - Clear messages for next call
   */
  useEffect(() => {
    if (!remoteSocketId) {
      clearChat(); // Clear messages when remote leaves
    }
  }, [remoteSocketId, clearChat]);

  // ============================================================================
  // STEP 21: Handle Room Full Error
  // ============================================================================
  /**
   * useEffect #11: Handle case when room is already full
   * 
   * Flow:
   * 1. Server emits "room:full" if room already has 2 people
   * 2. We receive it and show error
   * 3. Stop media tracks (camera/mic)
   * 4. Show alert to user
   * 5. Redirect to home page
   */
  useEffect(() => {
    if (!socket) return;

    const handleRoomFull = ({ room, message }: { room: string; message: string }) => {
      setRoomFullError(message);
      
      // Clean up media
      if (media.myStream) {
        media.myStream.getTracks().forEach((track) => {
          try { track.stop(); } catch (e) {}
        });
        media.setMyStream(null);
      }

      // Show alert
      alert(`Unable to join room: ${message}`);
      
      // Redirect to home after 1 second
      setTimeout(() => {
        router.push('/');
      }, 1000);
    };

    socket.on("room:full", handleRoomFull);

    return () => {
      socket.off("room:full", handleRoomFull);
    };
  }, [socket, router, media]);

  // ============================================================================
  // STEP 22: Return All Values and Functions
  // ============================================================================
  /**
   * Return object: Everything this hook provides to components
   * 
   * Components that use this hook get access to:
   * - User information (names, socket IDs)
   * - Chat functionality (messages, send, clear)
   * - Media controls (video/audio toggle, streams, refs)
   * - Signaling controls (call, accept, handle incoming)
   */
  return {
    // User info
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
    
    // Chat
    messages,
    sendMessage,
    clearChat,
    roomFullError,
    
    // Media API (from useMedia hook)
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
    
    // Signaling API (from useSignaling hook)
    handleCallUser: signaling.handleCallUser,
    handleCallAccepted: signaling.handleCallAccepted,
    handleIncomingCall: signaling.handleIncomingCall,
    handleUserJoined: signaling.handleUserJoined,
  };
};