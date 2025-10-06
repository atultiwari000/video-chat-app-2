import { useCallback, useEffect, useRef } from "react";
import PeerService from "../services/peer";
import { useSocket } from "../context/Socket";

/**
 * useSignaling Hook
 * =================
 * This hook manages the WebRTC SIGNALING process.
 * 
 * What is signaling?
 * - WebRTC connections are peer-to-peer (direct between browsers)
 * - But browsers need to FIND each other first
 * - Signaling is the process of exchanging connection information
 * - We use WebSocket (socket.io) as the signaling channel
 * 
 * This hook handles:
 * 1. Creating offers (initiating calls)
 * 2. Creating answers (accepting calls)
 * 3. Exchanging ICE candidates (network paths)
 * 4. Managing peer connection state
 */
export const useSignaling = (opts: {
  myStream: MediaStream | null;
  setMyStream: (s: MediaStream | null) => void;
  setRemoteStream: (s: MediaStream | null) => void;
  setRemoteUserName: (s: string) => void;
  setRemoteSocketId: (s: string | null) => void;
  remoteSocketId: string | null;
  localUserName: string;
}) => {
  // Destructure all the options we received
  const { 
    myStream, 
    setMyStream, 
    setRemoteStream, 
    setRemoteUserName, 
    remoteSocketId, 
    setRemoteSocketId, 
    localUserName 
  } = opts;
  
  const socket = useSocket();

  // ============================================================================
  // State Management with useRef
  // ============================================================================
  /**
   * Why useRef for these values?
   * - They need to persist across renders
   * - They don't need to trigger re-renders when they change
   * - They're used for internal logic, not UI display
   * 
   * iceCandidateQueue:
   * - ICE candidates might arrive before we're ready to process them
   * - We queue them up and process later
   * 
   * isRemoteDescriptionSet:
   * - Tracks if we've received remote peer's connection info
   * - ICE candidates can't be added until this is true
   * 
   * hasInitiatedCall:
   * - Prevents calling the same person multiple times
   * 
   * isProcessingCall:
   * - Prevents processing multiple calls simultaneously
   * - Acts as a "lock" to prevent race conditions
   */
  const iceCandidateQueue = useRef<RTCIceCandidateInit[]>([]);
  const isRemoteDescriptionSet = useRef(false);
  const hasInitiatedCall = useRef(false);
  const isProcessingCall = useRef(false);

  // ============================================================================
  // Helper Function: Get Media Constraints
  // ============================================================================
  /**
   * useCallback: Memoized function that reads user preferences
   * 
   * Flow:
   * 1. Read from sessionStorage if user disabled video/audio
   * 2. Return constraints object for getUserMedia
   * 3. If both disabled, enable audio (getUserMedia needs at least one)
   * 
   * Why useCallback?
   * - This function doesn't change, so we don't need to recreate it
   * - Empty dependency array [] means it's created once and never changes
   */
  const getMediaConstraints = useCallback(() => {
    if (typeof window === 'undefined') {
      return { video: true, audio: true };
    }
    
    // Read preferences (default to true if not set)
    const videoEnabled = sessionStorage.getItem("videoEnabled") !== "false";
    const audioEnabled = sessionStorage.getItem("audioEnabled") !== "false";
    
    // Edge case: if both disabled, enable audio to get permissions
    if (!videoEnabled && !audioEnabled) {
      return { 
        video: false, 
        audio: {
          echoCancellation: true,   // Remove echo
          noiseSuppression: true,   // Remove background noise
          autoGainControl: true,    // Normalize volume
        }
      };
    }
    
    return { video: videoEnabled, audio: audioEnabled };
  }, []);

  // ============================================================================
  // Helper Function: Process Queued ICE Candidates
  // ============================================================================
  /**
   * ICE Candidates explained:
   * - ICE = Interactive Connectivity Establishment
   * - Each candidate is a possible network path (IP address + port)
   * - Browser generates multiple candidates (local network, public IP, relay servers)
   * - Both peers exchange candidates to find the best connection path
   * 
   * Why queue them?
   * - ICE candidates can arrive BEFORE we set the remote description
   * - We can't process them until remote description is set
   * - So we queue them and process after remote description is ready
   * 
   * This function:
   * 1. Takes all candidates from the queue
   * 2. Adds them to the peer connection one by one
   * 3. Handles errors gracefully
   */
  const processIceCandidateQueue = useCallback(async () => {
    while (iceCandidateQueue.current.length > 0) {
      const c = iceCandidateQueue.current.shift();  // Get and remove first item
      if (!c) continue;
      try {
        await PeerService.addIceCandidate(c);
      } catch (err) {
        console.error("Error adding queued ICE candidate:", err);
      }
    }
  }, []);

  // ============================================================================
  // Event Handler: Room Joined
  // ============================================================================
  /**
   * Called when we successfully join a room
   * 
   * Server sends us list of all users in the room
   * We find the OTHER user (not ourselves) and save their info
   * 
   * Why reset hasInitiatedCall?
   * - If someone was in the room already, we might need to call them
   * - Reset flag so auto-call logic can work
   */
  const handleRoomJoined = useCallback(({ users }: any) => {
    // Find the other user (not us)
    const otherUser = users?.find((u: any) => u.id !== socket?.id);
    
    if (otherUser) {
      setRemoteSocketId(otherUser.id);
      setRemoteUserName(otherUser.userName);
      hasInitiatedCall.current = false;  // Reset for potential call
    }
  }, [socket, setRemoteUserName, setRemoteSocketId]);

  // ============================================================================
  // Event Handler: User Joined
  // ============================================================================
  /**
   * Called when a NEW user joins the room after we're already in it
   * 
   * Flow:
   * 1. Server broadcasts "user:joined" to everyone in room
   * 2. We receive it with the new user's info
   * 3. Save their socket ID and name
   * 4. Reset call flag (so auto-call can initiate)
   */
  const handleUserJoined = useCallback(({ userName, id }: any) => {
    setRemoteSocketId(id);
    setRemoteUserName(userName);
    hasInitiatedCall.current = false;
  }, [setRemoteUserName, setRemoteSocketId]);

  // ============================================================================
  // CALLING FLOW - Part 1: Initiate Call (OFFERER)
  // ============================================================================
  /**
   * handleCallUser: The OFFERER side of WebRTC connection
   * 
   * WebRTC has two roles:
   * - OFFERER: Initiates the call, creates "offer"
   * - ANSWERER: Receives the call, creates "answer"
   * 
   * This function makes us the OFFERER
   * 
   * Flow:
   * 1. Check we're not already processing a call (prevent duplicates)
   * 2. Get or request media stream (camera/mic)
   * 3. Add our stream to peer connection
   * 4. Create an "offer" (SDP - Session Description Protocol)
   * 5. Send offer to remote peer via WebSocket
   * 
   * What's an offer?
   * - A text description of what we're capable of (codecs, media types, etc.)
   * - Remote peer will respond with an "answer"
   */
  const handleCallUser = useCallback(async () => {
    // Guard clauses: prevent duplicate calls
    if (isProcessingCall.current || hasInitiatedCall.current) return;
    if (!remoteSocketId) {
      return;
    }

    try {
      // Set locks to prevent race conditions
      isProcessingCall.current = true;
      hasInitiatedCall.current = true;

      // Get or create media stream
      let stream = myStream;
      if (!stream) {
        // Get constraints from user preferences
        const constraints = getMediaConstraints();
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Apply user preferences (they might want video/audio off initially)
        const videoWanted = sessionStorage.getItem("videoEnabled") !== "false";
        const audioWanted = sessionStorage.getItem("audioEnabled") !== "false";
        
        stream.getVideoTracks().forEach(track => {
          track.enabled = videoWanted;
        });
        stream.getAudioTracks().forEach(track => {
          track.enabled = audioWanted;
        });
        
        setMyStream(stream);
      }

      // Add our stream to peer connection
      // This attaches our video/audio to be sent to remote peer
      PeerService.addLocalStream(stream);
      
      // Create offer (SDP)
      const offer = await PeerService.getOffer();
      
      // Send offer to remote peer via WebSocket signaling
      socket?.emit("user:call", { 
        to: remoteSocketId, 
        offer, 
        userName: localUserName 
      });
    } catch (err) {
      console.error("Error in handleCallUser:", err);
      hasInitiatedCall.current = false;  // Reset on error
    } finally {
      isProcessingCall.current = false;  // Release lock
    }
  }, [remoteSocketId, socket, myStream, setMyStream, localUserName, getMediaConstraints]);

  // ============================================================================
  // CALLING FLOW - Part 2: Receive Call (ANSWERER)
  // ============================================================================
  /**
   * handleIncomingCall: The ANSWERER side of WebRTC connection
   * 
   * Called when someone calls us
   * 
   * Flow:
   * 1. Check we're not already in a call
   * 2. Save who's calling us
   * 3. Get or request our media stream
   * 4. Add our stream to peer connection
   * 5. Set the remote offer we received
   * 6. Create an "answer" (our response to their offer)
   * 7. Send answer back to caller via WebSocket
   * 8. Process any queued ICE candidates
   * 
   * Why getAnswer sets remote description?
   * - To create an answer, we must first know what they're offering
   * - PeerService.getAnswer() does setRemoteDescription internally
   */
  const handleIncomingCall = useCallback(async ({ from, offer, userName }: any) => {
    // Guard: don't accept if already processing
    if (isProcessingCall.current) {
      console.warn("Already processing a call, rejecting incoming");
      return;
    }

    try {
      isProcessingCall.current = true;  // Set lock
      
      // Save caller's info
      setRemoteSocketId(from);
      setRemoteUserName(userName || "Remote User");

      // Get or create our media stream
      let stream = myStream;
      if (!stream) {
        const constraints = getMediaConstraints();
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Apply user preferences
        const videoWanted = sessionStorage.getItem("videoEnabled") !== "false";
        const audioWanted = sessionStorage.getItem("audioEnabled") !== "false";
        
        stream.getVideoTracks().forEach(track => {
          track.enabled = videoWanted;
        });
        stream.getAudioTracks().forEach(track => {
          track.enabled = audioWanted;
        });
        
        setMyStream(stream);
      }

      // Add our stream to peer connection
      PeerService.addLocalStream(stream);
      
      // Create answer (this also sets remote description internally)
      const ans = await PeerService.getAnswer(offer);
      isRemoteDescriptionSet.current = true;  // Mark as ready

      // Send answer back to caller
      socket?.emit("call:accepted", { 
        to: from, 
        ans, 
        userName: localUserName 
      });
      
      // Process any ICE candidates that arrived early
      await processIceCandidateQueue();
    } catch (err) {
      console.error("Error handling incoming call:", err);
      isRemoteDescriptionSet.current = false;  // Reset on error
    } finally {
      isProcessingCall.current = false;  // Release lock
    }
  }, [myStream, setMyStream, socket, processIceCandidateQueue, setRemoteUserName, localUserName, setRemoteSocketId, getMediaConstraints]);

  // ============================================================================
  // CALLING FLOW - Part 3: Call Accepted (OFFERER receives answer)
  // ============================================================================
  /**
   * handleCallAccepted: Completes the OFFERER's side
   * 
   * We initiated the call, now remote peer accepted it
   * 
   * Flow:
   * 1. Check peer connection state (must be "have-local-offer")
   * 2. Set the remote answer we received
   * 3. Mark remote description as set
   * 4. Process any queued ICE candidates
   * 
   * WebRTC States:
   * - new: Nothing happened yet
   * - have-local-offer: We created and sent an offer (waiting for answer)
   * - stable: Connection established (both offer and answer exchanged)
   * - closed: Connection ended
   * 
   * Why check signaling state?
   * - Prevents processing duplicate answers
   * - If already "stable", connection is complete
   * - If not "have-local-offer", something's wrong with the flow
   */
  const handleCallAccepted = useCallback(async ({ from, ans, userName }: any) => {
    const peer = await PeerService.getPeer();
    if (!peer) return;

    const signalingState = peer.signalingState;
    
    // If already stable, connection is done - ignore duplicate
    if (signalingState === "stable") {
      return;
    }

    // Must be in correct state to accept answer
    if (signalingState !== "have-local-offer") {
      console.warn("Cannot accept call in state:", signalingState);
      return;
    }

    try {
      // Set the remote answer
      await PeerService.setRemoteAnswer(ans);
      isRemoteDescriptionSet.current = true;
      
      if (userName) setRemoteUserName(userName);
      
      // Process queued ICE candidates
      await processIceCandidateQueue();
    } catch (err) {
      console.error("Error in handleCallAccepted:", err);
    }
  }, [setRemoteUserName, processIceCandidateQueue]);

  // ============================================================================
  // Effect: Handle Remote Media Tracks
  // ============================================================================
  /**
   * useEffect #1: Listen for remote media tracks
   * 
   * When remote peer sends their video/audio:
   * - WebRTC fires "track" events
   * - Each track comes with a stream
   * - We save that stream to display their video
   * 
   * Why the cleanup and peer-reset logic?
   * - If peer connection resets, we need to re-attach listeners
   * - Cleanup prevents memory leaks
   * 
   * The "peer-reset" event:
   * - Custom event fired by PeerService when it creates new peer
   * - Ensures we always have listeners on the current peer instance
   */
  useEffect(() => {
    let cleanup = () => {};

    const attachTrackListener = async () => {
      const peer = await PeerService.getPeer();
      if (!peer) return;

      // Track event handler
      const onTrackHandler = (ev: RTCTrackEvent) => {
        // ev.streams contains the remote media stream
        if (ev.streams && ev.streams[0]) {
          setRemoteStream(ev.streams[0]);
        }
      };

      // Attach listener to peer
      peer.addEventListener("track", onTrackHandler);

      // Cleanup function to remove listener
      cleanup = () => {
        peer.removeEventListener("track", onTrackHandler);
      };
    };

    attachTrackListener();

    // Re-attach on peer reset
    const handlePeerReset = () => {
      cleanup();
      attachTrackListener();
    };

    document.addEventListener("peer-reset", handlePeerReset);

    // Cleanup on unmount
    return () => {
      cleanup();
      document.removeEventListener("peer-reset", handlePeerReset);
    };
  }, [setRemoteStream]);

  // ============================================================================
  // Effect: Handle Local ICE Candidates
  // ============================================================================
  /**
   * useEffect #2: Send our ICE candidates to remote peer
   * 
   * ICE Candidate Flow:
   * 1. PeerService generates ICE candidates (network paths)
   * 2. This effect listens for those candidates
   * 3. When we get one, send it to remote peer via WebSocket
   * 4. Remote peer adds it to their connection
   * 
   * Why send candidates?
   * - Both peers need all possible network paths
   * - They test all paths and use the best one
   * - This is how WebRTC finds the optimal connection route
   */
  useEffect(() => {
    let removeIceListener: (() => void) | undefined;
    
    const register = () => {
      // Register callback for when peer generates ICE candidates
      removeIceListener = PeerService.onIceCandidate?.((candidate: RTCIceCandidate) => {
        if (candidate && remoteSocketId) {
          // Send candidate to remote peer
          socket?.emit("ice:candidate", { 
            to: remoteSocketId, 
            candidate 
          });
        }
      }) || (() => {});
    };

    register();
    
    // Re-register on peer reset
    const onReset = () => {
      try { removeIceListener?.(); } catch (e) {}
      register();
    };
    document.addEventListener("peer-reset", onReset);

    // Cleanup
    return () => {
      try { removeIceListener?.(); } catch (e) {}
      document.removeEventListener("peer-reset", onReset);
    };
  }, [remoteSocketId, socket]);

  // ============================================================================
  // Event Handler: Incoming ICE Candidates
  // ============================================================================
  /**
   * handleIncomingIceCandidate: Receive remote peer's ICE candidates
   * 
   * Flow:
   * 1. Remote peer sends us their ICE candidate
   * 2. Check if we've set remote description yet
   * 3. If not ready, queue the candidate for later
   * 4. If ready, add it immediately
   * 
   * Why queue?
   * - ICE candidates can arrive before we set remote description
   * - Can't add candidates until remote description is set
   * - Queue them and process after remote description is ready
   */
  const handleIncomingIceCandidate = useCallback(async ({ from, candidate }: any) => {
    if (!candidate) return;
    
    // If not ready, queue it
    if (!isRemoteDescriptionSet.current) {
      iceCandidateQueue.current.push(candidate);
      return;
    }
    
    // If ready, add immediately
    try {
      await PeerService.addIceCandidate(candidate);
    } catch (err) {
      console.error("Error adding remote ICE candidate:", err);
    }
  }, []);

  // ============================================================================
  // Cleanup Function: Remote Connection Cleanup
  // ============================================================================
  /**
   * cleanupRemoteConnection: Reset everything when call ends
   * 
   * This runs when:
   * - Remote user leaves
   * - Remote user disconnects unexpectedly
   * - Remote user ends the call
   * 
   * What it does:
   * 1. Reset all flags and queues
   * 2. Clear remote stream and info
   * 3. Remove tracks from peer connection
   * 4. Close and reset peer connection
   * 
   * Why remove tracks?
   * - Clean up resources
   * - Prepare for next call
   * - Prevent memory leaks
   */
  const cleanupRemoteConnection = useCallback(async () => {
    // Reset all flags
    isRemoteDescriptionSet.current = false;
    iceCandidateQueue.current = [];
    hasInitiatedCall.current = false;
    isProcessingCall.current = false;
    
    // Clear remote state
    setRemoteStream(null);
    setRemoteSocketId(null);
    setRemoteUserName("Remote User");
    
    // Clean up peer connection
    try {
      const peer = await PeerService.getPeer();
      if (peer) {
        // Remove all senders (stop sending our media)
        const senders = peer.getSenders();
        senders.forEach(sender => {
          try {
            peer.removeTrack(sender);
          } catch (e) {}
        });
        peer.close();  // Close connection
      }
    } catch (e) {
      console.error("Error during peer cleanup:", e);
    }
    
    // Reset peer service (creates new peer for next call)
    PeerService.reset();
  }, [setRemoteUserName, setRemoteStream, setRemoteSocketId]);

  // ============================================================================
  // Event Handlers: User Left/Disconnected
  // ============================================================================
  /**
   * handleUserLeft: Remote user explicitly left the room
   * Clean up if they were our call partner
   */
  const handleUserLeft = useCallback(({ id }: any) => {
    if (id === remoteSocketId) {
      cleanupRemoteConnection();
    }
  }, [remoteSocketId, cleanupRemoteConnection]);

  /**
   * handleUserDisconnected: Remote user's connection dropped
   * (network issue, closed browser, etc.)
   * Clean up if they were our call partner
   */
  const handleUserDisconnected = useCallback(({ id }: any) => {
    if (id === remoteSocketId) {
      cleanupRemoteConnection();
    }
  }, [remoteSocketId, cleanupRemoteConnection]);

  /**
   * handleCallEnded: Remote user explicitly ended the call
   * Clean up if they were our call partner
   */
  const handleCallEnded = useCallback(({ from }: any) => {
    if (from === remoteSocketId) {
      cleanupRemoteConnection();
    }
  }, [remoteSocketId, cleanupRemoteConnection]);

  // ============================================================================
  // Effect: Register Socket Event Listeners
  // ============================================================================
  /**
   * useEffect #3: Listen to all WebSocket events
   * 
   * This is the "command center" for all signaling events
   * We register listeners for:
   * - room:joined - We successfully joined a room
   * - user:joined - Someone else joined our room
   * - incoming:call - Someone is calling us
   * - call:accepted - Our call was accepted
   * - ice:candidate - Remote peer sent ICE candidate
   * - call:ended - Remote peer ended call
   * - user:disconnected - Someone lost connection
   * - user:left - Someone explicitly left
   * 
   * Why cleanup (socket.off)?
   * - Prevent duplicate listeners
   * - Prevent memory leaks
   * - Only listen while component is mounted
   */
  useEffect(() => {
    if (!socket) return;

    // Register all event listeners
    socket.on("room:joined", handleRoomJoined); 
    socket.on("user:joined", handleUserJoined);
    socket.on("incoming:call", handleIncomingCall);
    socket.on("call:accepted", handleCallAccepted);
    socket.on("ice:candidate", handleIncomingIceCandidate);
    socket.on("call:ended", handleCallEnded);
    socket.on("user:disconnected", handleUserDisconnected);
    socket.on("user:left", handleUserLeft);

    // Cleanup: remove all listeners on unmount
    return () => {
      socket.off("room:joined", handleRoomJoined); 
      socket.off("user:joined", handleUserJoined);
      socket.off("incoming:call", handleIncomingCall);
      socket.off("call:accepted", handleCallAccepted);
      socket.off("ice:candidate", handleIncomingIceCandidate);
      socket.off("call:ended", handleCallEnded);
      socket.off("user:disconnected", handleUserDisconnected);
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
    handleIncomingIceCandidate,
  ]);

  // ============================================================================
  // Return Values
  // ============================================================================
  /**
   * Expose these functions to parent components
   * These are the "public API" of the signaling hook
   */
  return {
    handleCallUser,              // Initiate a call
    remoteSocketId,              // Who we're connected to
    handleCallAccepted,          // For external use if needed
    handleIncomingCall,          // For external use if needed
    handleUserJoined,            // For external use if needed
    processIceCandidateQueue,    // For external use if needed
  };
};