import { useEffect, useRef, useState, useCallback } from "react";
import PeerService from "../services/peer";
import { useSocket } from "../context/Socket";

/**
 * useMedia Hook
 * =============
 * This hook manages all MEDIA-related functionality:
 * - Accessing camera and microphone
 * - Displaying local video (your camera)
 * - Displaying remote video (other person's camera)
 * - Toggling video/audio on/off
 * - Ending calls
 * - Tracking connection states
 * 
 * Think of this as the "media controller" for the video call
 */
export const useMedia = ({ 
  remoteSocketId, 
  localUserName, 
  remoteUserName, 
  setRemoteUserName, 
  room,
  navigate,
  socket
} : {
  remoteSocketId?: string | null;
  localUserName?: string;
  remoteUserName?: string;
  setRemoteUserName?: (s: string) => void;
  room?: string;
  navigate?: any;  
  socket?: any;
}) => {
  // ============================================================================
  // State: Media Streams
  // ============================================================================
  /**
   * MediaStream explained:
   * - A MediaStream contains tracks (audio and/or video)
   * - myStream: Our own camera/microphone feed
   * - remoteStream: The other person's camera/microphone feed
   * 
   * These streams will be attached to <video> elements for display
   */
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // ============================================================================
  // Refs: Video Element References
  // ============================================================================
  /**
   * Why useRef for video elements?
   * - Refs give us direct access to DOM elements
   * - We need to set videoElement.srcObject = stream
   * - This can't be done with regular state
   * 
   * Usage: <video ref={myVideoRef} />
   * Then we can do: myVideoRef.current.srcObject = stream
   */
  const myVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  // ============================================================================
  // State: Connection States
  // ============================================================================
  /**
   * WebRTC Connection States:
   * 
   * connectionState:
   * - "new": Just created, nothing happened
   * - "connecting": Trying to establish connection
   * - "connected": Successfully connected!
   * - "disconnected": Connection lost (might reconnect)
   * - "failed": Connection failed permanently
   * - "closed": Connection closed intentionally
   * 
   * iceConnectionState:
   * - Tracks the ICE (network path discovery) state
   * - Similar states: new, checking, connected, completed, failed, etc.
   * 
   * These help us show connection status to users
   */
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState>("new");

  // ============================================================================
  // Effect: Initialize Connection States
  // ============================================================================
  /**
   * useEffect #1: Get initial peer connection state
   * 
   * When component mounts, read the current state from PeerService
   * This ensures our state matches reality from the start
   */
  useEffect(() => {
    const setInitialState = async () => {
      const peer = await PeerService.getPeer();
      if (peer) {
        setConnectionState(peer.connectionState);
        setIceConnectionState(peer.iceConnectionState);
      }
    };
    setInitialState();
  }, []);

  // ============================================================================
  // Effect: Attach Local Stream to Video Element
  // ============================================================================
  /**
   * useEffect #2: Display our own video feed
   * 
   * Flow:
   * 1. Wait for both video element and stream to exist
   * 2. Check if stream is already attached (prevent duplicate work)
   * 3. Set videoElement.srcObject = stream
   * 4. Call play() to start displaying video
   * 
   * Why the cleanup?
   * - When component unmounts, clear the video source
   * - Prevents memory leaks
   * 
   * Why check if srcObject === myStream?
   * - Prevents unnecessary re-assignments
   * - Prevents video flickering/restarting
   */
  useEffect(() => {
    if (!myVideoRef.current || !myStream) return;
    
    const videoEl = myVideoRef.current;
    
    // Only update if different stream
    if (videoEl.srcObject === myStream) return;
    
    // Attach stream to video element
    videoEl.srcObject = myStream;
    
    // Start playing video
    videoEl.play().catch(err => {
      // AbortError is harmless (happens when component unmounts quickly)
      if (err?.name !== "AbortError") {
        console.error("Error playing local video:", err);
      }
    });

    // Cleanup on unmount
    return () => {
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    };
  }, [myStream]);

  // ============================================================================
  // Effect: Attach Remote Stream to Video Element
  // ============================================================================
  /**
   * useEffect #3: Display remote person's video feed
   * 
   * Exact same logic as local video, but for remote stream
   * This is how we see the other person's camera
   */
  useEffect(() => {
    if (!remoteVideoRef.current || !remoteStream) return;
    
    const videoEl = remoteVideoRef.current;
    
    if (videoEl.srcObject === remoteStream) return;
    
    videoEl.srcObject = remoteStream;
    videoEl.play().catch(err => {
      if (err?.name !== "AbortError") {
        console.error("Error playing remote video:", err);
      }
    });

    return () => {
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    };
  }, [remoteStream]);

  // ============================================================================
  // Effect: Sync Local Stream with Peer Connection
  // ============================================================================
  /**
   * useEffect #4: Ensure PeerService has our stream
   * 
   * When myStream changes:
   * 1. Tell PeerService about it
   * 2. PeerService adds it to the peer connection
   * 3. This ensures our video/audio is sent to remote peer
   * 
   * Why needed?
   * - If we get a new stream (toggle video on after it was off)
   * - We need to add it to the peer connection
   * - Otherwise remote peer won't see our new video
   */
  useEffect(() => {
    if (!myStream) return;
    try {
      PeerService.addLocalStream(myStream);
    } catch (err) {
      console.error("Failed to add local stream to PeerService:", err);
    }
  }, [myStream]);

  // ============================================================================
  // Effect: Listen to Peer Connection State Changes
  // ============================================================================
  /**
   * useEffect #5: Track connection state in real-time
   * 
   * Flow:
   * 1. Get peer connection
   * 2. Attach event listeners for state changes
   * 3. Update our state when connection state changes
   * 4. Re-attach listeners if peer resets
   * 
   * Why listen to both events?
   * - connectionstatechange: Overall connection status
   * - iceconnectionstatechange: Network path discovery status
   * 
   * The peer-reset pattern:
   * - If peer connection is recreated, we need new listeners
   * - PeerService fires "peer-reset" event when this happens
   * - We clean up old listeners and attach new ones
   */
  useEffect(() => {
    let cleanup = () => {};

    const attachListeners = async () => {
      const peer = await PeerService.getPeer();
      if (!peer) return;

      // Connection state changed
      const handleConnectionChange = () => {
        setConnectionState(peer.connectionState);
      };

      // ICE connection state changed
      const handleIceConnectionChange = () => {
        setIceConnectionState(peer.iceConnectionState);
      };

      // Attach listeners
      peer.addEventListener('connectionstatechange', handleConnectionChange);
      peer.addEventListener('iceconnectionstatechange', handleIceConnectionChange);

      // Cleanup function to remove listeners
      cleanup = () => {
        peer.removeEventListener('connectionstatechange', handleConnectionChange);
        peer.removeEventListener('iceconnectionstatechange', handleIceConnectionChange);
      };
    };

    attachListeners();

    // Re-attach on peer reset
    const handlePeerReset = () => {
      cleanup();
      attachListeners();
    };

    document.addEventListener('peer-reset', handlePeerReset);

    return () => {
      cleanup();
      document.removeEventListener('peer-reset', handlePeerReset);
    };
  }, []);

  // ============================================================================
  // Function: End Call
  // ============================================================================
  /**
   * endCall: Completely end the call and clean up everything
   * 
   * This is called when:
   * - User clicks "End Call" button
   * - User navigates away
   * - User closes browser
   * 
   * What it does (in order):
   * 1. Stop all local media tracks (turns off camera/mic)
   * 2. Notify remote peer we're ending the call
   * 3. Leave the room
   * 4. Clear all streams from state
   * 5. Clear video elements
   * 6. Reset peer connection
   * 7. Clear sessionStorage
   * 8. Navigate back to home page
   * 
   * Why useCallback?
   * - This function might be passed to child components
   * - useCallback prevents it from being recreated on every render
   * - Better performance
   */


  // endCall: stops tracks, signals remote via socket, clears state, resets PeerService, navigates home
  const endCall = useCallback(() => {
    const roomToLog = room || 'undefined';

    // 1. Stop local tracks
    if (myStream) {
      myStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) {}
      });
    }

    // 2. Emit signals to server/remote
    if (remoteSocketId && socket) {
      socket.emit("call:end", { to: remoteSocketId });
    }
    if (socket && room) {
      socket.emit("leave:room");
    }

    // 3. Clear streams from state
    setMyStream(null);
    setRemoteStream(null);

    // 4. Clear video elements' srcObject to free resources
    if (myVideoRef.current) myVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    
    // 5. Reset PeerService (remove senders, close connection)
    try {
      PeerService.removeAllSenders();
      PeerService.reset();
    } catch (err) {}

    // 6. Clear remote username shown in UI
    if (setRemoteUserName) setRemoteUserName("Remote User");
    // Note: Don't clear remoteSocketId here - let socket events handle it

    if (typeof window !== 'undefined') {
      // Remove persisted preferences/state
      sessionStorage.removeItem('room');
      sessionStorage.removeItem('userName');
      sessionStorage.removeItem('videoEnabled');
      sessionStorage.removeItem('audioEnabled');
    }
    
    // 7. Navigate home if router provided
    if (navigate) {
      navigate.replace('/');
    }
  }, [myStream, socket, remoteSocketId, room, navigate, setRemoteStream, setMyStream, setRemoteUserName]);

  // toggleVideo toggles an existing video track, or requests camera permission and adds a new video track
  const toggleVideo = useCallback(async () => {
    if (!myStream) return false;
    
    const videoTrack = myStream.getVideoTracks()[0];
    
    if (videoTrack) {
      // If video track exists, flip its enabled flag (mute/unmute camera)
      videoTrack.enabled = !videoTrack.enabled;
      
      // Persist setting for next session
      if (typeof window !== 'undefined') {
        sessionStorage.setItem("videoEnabled", String(videoTrack.enabled));
      }
      
      return videoTrack.enabled;
    } else {
      // If no video track, request a camera and add the track to the existing stream
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Add the new track to the existing MediaStream so our UI still references the same myStream
        myStream.addTrack(newVideoTrack);
        
        // If a peer connection already exists and remote is set, add the new track to the connection
        const peer = await PeerService.getPeer();
        if (peer && peer.connectionState !== 'closed' && remoteSocketId) {
          // Add as a new sender
          peer.addTrack(newVideoTrack, myStream);
          
          // Create offer to renegotiate so the remote knows about new track
          const offer = await (await peer).createOffer();
          await peer.setLocalDescription(offer);
          
          // Send the offer over socket to the remote party (server will forward)
          if (socket) {
            socket.emit("user:call", {
              to: remoteSocketId,
              offer,
              userName: localUserName
            });
          }
        }
        
        // Persist setting
        if (typeof window !== 'undefined') {
          sessionStorage.setItem("videoEnabled", "true");
        }
        
        // Trigger React rerender by creating a new MediaStream instance with same tracks
        setMyStream(new MediaStream([...myStream.getTracks()]));
        
        return true;
      } catch (error) {
        console.error("Error adding video track:", error);
        return false;
      }
    }
  }, [myStream, setMyStream, remoteSocketId, socket, localUserName]);

  const toggleAudio = useCallback(async () => {
    if (!myStream) return false;
    
    const audioTrack = myStream.getAudioTracks()[0];
    
    if (audioTrack) {
      // Audio track exists, just toggle it
      audioTrack.enabled = !audioTrack.enabled;
      
      // Update sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem("audioEnabled", String(audioTrack.enabled));
      }
      
      return audioTrack.enabled;
    } else {
      // No audio track exists, need to get a new stream with audio
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: false,
            audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        });
        
        const newAudioTrack = newStream.getAudioTracks()[0];
        
        // Add the new audio track to existing stream
        myStream.addTrack(newAudioTrack);
        
        // Add to peer connection and trigger renegotiation
        const peer = await PeerService.getPeer();
        if (peer && peer.connectionState !== 'closed' && remoteSocketId) {
          // Add track to peer
          peer.addTrack(newAudioTrack, myStream);
          
          // Create new offer to renegotiate
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          
          // Send new offer to remote peer
          if (socket) {
            socket.emit("user:call", { 
              to: remoteSocketId, 
              offer, 
              userName: localUserName 
            });
          }
        }
        
        // Update sessionStorage
        if (typeof window !== 'undefined') {
          sessionStorage.setItem("audioEnabled", "true");
        }
        
        // Trigger a re-render
        setMyStream(new MediaStream([...myStream.getTracks()]));
        
        return true;
      } catch (error) {
        console.error("Error adding audio track:", error);
        return false;
      }
    }
  }, [myStream, setMyStream, remoteSocketId, socket, localUserName]);

  const isVideoEnabled = useCallback(() => {
    const videoTrack = myStream?.getVideoTracks()[0];
    return videoTrack?.enabled ?? false;
  }, [myStream]);

  const isAudioEnabled = useCallback(() => {
    const audioTrack = myStream?.getAudioTracks()[0];
    return audioTrack?.enabled ?? false;
  }, [myStream]);

  const testVideoPermissions = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      setMyStream(stream);
      return stream;
    } catch (error) {
      console.error("Video permissions test failed:", error);
      throw error;
    }
  }, []);

  // useEffect(() => {
  //   const setupListeners = () => {
  //     const handleConnectionChange = () => {
  //       setConnectionState(PeerService.peer.connectionState);
  //     };

  //     const handleIceConnectionChange = () => {
  //       setIceConnectionState(PeerService.peer.iceConnectionState);
  //     };

  //     PeerService.peer.addEventListener('connectionstatechange', handleConnectionChange);
  //     PeerService.peer.addEventListener('iceconnectionstatechange', handleIceConnectionChange);

  //     return () => {
  //       PeerService.peer.removeEventListener('connectionstatechange', handleConnectionChange);
  //       PeerService.peer.removeEventListener('iceconnectionstatechange', handleIceConnectionChange);
  //     };
  //   };
    
  //   let cleanup = setupListeners();

  //   const handlePeerReset = () => {
  //     cleanup();
  //     cleanup = setupListeners();
  //   };

  //   document.addEventListener('peer-reset', handlePeerReset);

  //   return () => {
  //     cleanup();
  //     document.removeEventListener('peer-reset', handlePeerReset);
  //   };
  // }, []); 

  return {
    myStream,
    setMyStream,
    remoteStream,
    setRemoteStream,
    myVideoRef,
    remoteVideoRef,
    testVideoPermissions,
    endCall,
    toggleVideo,
    toggleAudio,
    isVideoEnabled,
    isAudioEnabled,
    connectionState,
    iceConnectionState
  };
};