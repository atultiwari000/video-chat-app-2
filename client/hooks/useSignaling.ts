import { useCallback, useEffect, useRef } from "react";
import PeerService from "../services/peer";
import { useSocket } from "../context/Socket";

export const useSignaling = (opts: {
  myStream: MediaStream | null;
  setMyStream: (s: MediaStream | null) => void;
  setRemoteStream: (s: MediaStream | null) => void;
  setRemoteUserName: (s: string) => void;
  setRemoteSocketId: (s: string | null) => void;
  remoteSocketId: string | null;
  localUserName: string;
}) => {
  const { myStream, setMyStream, setRemoteStream, setRemoteUserName, remoteSocketId, setRemoteSocketId, localUserName } = opts;
  const socket = useSocket();

  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const isRemoteDescriptionSet = useRef(false);
  const hasInitiatedCall = useRef(false);
  const isProcessingCall = useRef(false);

  // Helper: process queued ICE candidates
  const processIceCandidateQueue = useCallback(async () => {
    while (iceCandidateQueue.current.length > 0) {
      const c = iceCandidateQueue.current.shift();
      if (!c) continue;
      try {
        await PeerService.addIceCandidate(c);
        console.log("Queued ICE candidate added");
      } catch (err) {
        console.error("Error adding queued ICE candidate:", err);
      }
    }
  }, []);

    // Add this new handler near the top with other handlers
  const handleRoomJoined = useCallback(({ users }: any) => {
    console.log("Room joined, existing users:", users);
    
    // Find other user in the room (not yourself)
    const otherUser = users?.find((u: any) => u.id !== socket?.id);
    
    if (otherUser) {
      console.log("Found existing user in room:", otherUser);
      setRemoteSocketId(otherUser.id);
      setRemoteUserName(otherUser.userName);
      hasInitiatedCall.current = false;
    }
  }, [socket, setRemoteUserName, setRemoteSocketId]);

  // Handle user joined
  const handleUserJoined = useCallback(({ userName, id }: any) => {
    console.log("User joined:", userName, id);
    setRemoteSocketId(id);
    setRemoteUserName(userName);
    hasInitiatedCall.current = false;
  }, [setRemoteUserName, setRemoteSocketId]);

  // Initiate call (offerer)
  const handleCallUser = useCallback(async () => {
    if (isProcessingCall.current || hasInitiatedCall.current) return;
    if (!remoteSocketId) {
      console.warn("No remoteSocketId, cannot call");
      return;
    }

    try {
      isProcessingCall.current = true;
      hasInitiatedCall.current = true;

      let stream = myStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setMyStream(stream);
      }

      PeerService.addLocalStream(stream);
      const offer = await PeerService.getOffer();
      console.log("Emitting user:call to", remoteSocketId);
      socket?.emit("user:call", { to: remoteSocketId, offer, userName: localUserName });
    } catch (err) {
      console.error("Error in handleCallUser:", err);
      hasInitiatedCall.current = false;
    } finally {
      isProcessingCall.current = false;
    }
  }, [remoteSocketId, socket, myStream, setMyStream, localUserName]);

  // Incoming call (answerer flow)
  const handleIncomingCall = useCallback(async ({ from, offer, userName }: any) => {
    if (isProcessingCall.current) {
      console.warn("Already processing a call, rejecting incoming");
      return;
    }

    const signalingState = PeerService.getPeer().signalingState;
    console.log("Incoming call - current signaling state:", signalingState);

    try {
      isProcessingCall.current = true;
      setRemoteSocketId(from);
      setRemoteUserName(userName || "Remote User");

      let stream = myStream;
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setMyStream(stream);
      }

      PeerService.addLocalStream(stream);
      
      // getAnswer handles setRemoteDescription internally
      const ans = await PeerService.getAnswer(offer);
      isRemoteDescriptionSet.current = true;

      socket?.emit("call:accepted", { to: from, ans, userName: localUserName });
      await processIceCandidateQueue();
    } catch (err) {
      console.error("Error handling incoming call:", err);
      isRemoteDescriptionSet.current = false;
    } finally {
      isProcessingCall.current = false;
    }
  }, [myStream, setMyStream, socket, processIceCandidateQueue, setRemoteUserName, localUserName, setRemoteSocketId]);

  // Call accepted by remote (offerer receives answer)
  const handleCallAccepted = useCallback(async ({ from, ans, userName }: any) => {
    const signalingState = PeerService.getPeer().signalingState;
    console.log("Call accepted - current signaling state:", signalingState);
    
    // If already stable, the call is already established - ignore
    if (signalingState === "stable") {
      console.log("Already in stable state, ignoring duplicate call acceptance");
      return;
    }

    if (signalingState !== "have-local-offer") {
      console.warn("Cannot accept call in state:", signalingState);
      return;
    }

    try {
      await PeerService.setRemoteAnswer(ans);
      isRemoteDescriptionSet.current = true;
      if (userName) setRemoteUserName(userName);
      await processIceCandidateQueue();
    } catch (err) {
      console.error("Error in handleCallAccepted:", err);
    }
  }, [setRemoteUserName, processIceCandidateQueue]);

  // Handle remote track events
  useEffect(() => {
    const onTrackHandler = (ev: RTCTrackEvent) => {
      console.log("PeerService track event:", ev.track.kind);
      if (ev.streams && ev.streams[0]) {
        setRemoteStream(ev.streams[0]);
      } else {
        console.warn("Track event had no streams");
      }
    };

    const unsub = PeerService.onTrack(onTrackHandler) || (() => {});
    const onReset = () => {
      try { unsub(); } catch (e) {}
      PeerService.onTrack(onTrackHandler);
    };
    document.addEventListener("peer-reset", onReset);

    return () => {
      try { unsub(); } catch (e) {}
      document.removeEventListener("peer-reset", onReset);
    };
  }, [setRemoteStream]);

  // Local ICE -> emit to signaling server
  useEffect(() => {
    let removeIceListener: (() => void) | undefined;
    const register = () => {
      removeIceListener = PeerService.onIceCandidate?.((candidate: RTCIceCandidate) => {
        if (candidate && remoteSocketId) {
          socket?.emit("ice:candidate", { to: remoteSocketId, candidate });
        }
      }) || (() => {});
    };

    register();
    const onReset = () => {
      try { removeIceListener?.(); } catch (e) {}
      register();
    };
    document.addEventListener("peer-reset", onReset);

    return () => {
      try { removeIceListener?.(); } catch (e) {}
      document.removeEventListener("peer-reset", onReset);
    };
  }, [remoteSocketId, socket]);

  // Remote ICE candidates
  const handleIncomingIceCandidate = useCallback(async ({ from, candidate }: any) => {
    if (!candidate) return;
    if (!isRemoteDescriptionSet.current) {
      iceCandidateQueue.current.push(candidate);
      console.log("Queued remote ICE candidate (waiting for remote desc)");
      return;
    }
    try {
      await PeerService.addIceCandidate(candidate);
      console.log("Added remote ICE candidate immediately");
    } catch (err) {
      console.error("Error adding remote ICE candidate:", err);
    }
  }, []);

  // FIXED: Cleanup function for when user leaves/disconnects
  const cleanupRemoteConnection = useCallback(() => {
    console.log("=== CLEANING UP REMOTE CONNECTION ===");
    isRemoteDescriptionSet.current = false;
    iceCandidateQueue.current = [];
    hasInitiatedCall.current = false;
    isProcessingCall.current = false;
    setRemoteSocketId(null);
    setRemoteUserName("Remote User");
    setRemoteStream(null);
    try { PeerService.removeAllSenders(); } catch (e) {}
    PeerService.reset();
  }, []);

  // Handle user left (explicit leave)
  const handleUserLeft = useCallback(({ id }: any) => {
    console.log("=== USER LEFT ===", id);
    if (id === remoteSocketId) {
      cleanupRemoteConnection();
    }
  }, [remoteSocketId, cleanupRemoteConnection]);

  // Handle user disconnected (unexpected disconnect)
  const handleUserDisconnected = useCallback(({ id }: any) => {
    console.log("=== USER DISCONNECTED ===", id);
    if (id === remoteSocketId) {
      cleanupRemoteConnection();
    }
  }, [remoteSocketId, cleanupRemoteConnection]);

  // Handle call ended by remote
  const handleCallEnded = useCallback(({ from }: any) => {
    console.log("=== CALL ENDED BY REMOTE ===", from);
    if (from === remoteSocketId) {
      cleanupRemoteConnection();
    }
  }, [remoteSocketId, cleanupRemoteConnection]);

  //   useEffect(() => {
  //   return () => {
  //     // Cleanup on unmount
  //     isRemoteDescriptionSet.current = false;
  //     iceCandidateQueue.current = [];
  //     hasInitiatedCall.current = false;
  //     isProcessingCall.current = false;
  //   };
  // }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on("room:joined", handleRoomJoined); 
    socket.on("user:joined", handleUserJoined);
    socket.on("incoming:call", handleIncomingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("ice:candidate", handleIncomingIceCandidate);
    // socket.on("peer:nego:needed", handleNegoNeeded); // Assuming you have this handler
    // socket.on("peer:nego:final", handleNegoFinal); // Assuming you have this handler
    socket.on("call:ended", handleCallEnded);
    // socket.on("user:disconnected", handleUserDisconnected);
    socket.on("user:left", handleUserLeft);

    return () => {
      socket.off("room:joined", handleRoomJoined); 
      socket.off("user:joined", handleUserJoined);
      socket.off("incoming:call", handleIncomingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("ice:candidate", handleIncomingIceCandidate);
      // socket.off("peer:nego:needed", handleNegoNeeded);
      // socket.off("peer:nego:final", handleNegoFinal);
      socket.off("call:ended", handleCallEnded);
      // socket.off("user:disconnected", handleUserDisconnected);
      socket.off("user:left", handleUserLeft);
    };
  }, [
    socket,
    handleRoomJoined,
    handleUserJoined,
    handleIncomingCall,
    handleCallAccepted,
    handleCallEnded,
    handleUserDisconnected,
    handleUserLeft,
    // handleNegoNeeded,
    // handleNegoFinal,
    handleIncomingIceCandidate,
  ]);

  // // Auto-initiate call when appropriate
  // useEffect(() => {
  //   const shouldInitiate =
  //     myStream &&
  //     myStream.getTracks().length > 0 &&
  //     myStream.getTracks().every((t) => t.readyState === "live") &&
  //     remoteSocketId &&
  //     !hasInitiatedCall.current &&
  //     !isProcessingCall.current;

  //   if (shouldInitiate) {
  //     console.log("Auto-initiating call because conditions satisfied");
  //     handleCallUser();
  //   }
  // }, [myStream, remoteSocketId, handleCallUser]);

  return {
    handleCallUser,
    remoteSocketId,
    handleCallAccepted,
    handleIncomingCall,
    handleUserJoined,
    processIceCandidateQueue,
  };
};

