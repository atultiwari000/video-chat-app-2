import { useEffect, useRef, useState, useCallback } from "react";
import PeerService from "../services/peer";
import { useSocket } from "../context/Socket";

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
  // const socket = useSocket();
  const [myStream, setMyStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const myVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>(
    () => PeerService.getPeer()?.connectionState ?? "new"
  );
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState>(
    () => PeerService.getPeer()?.iceConnectionState ?? "new"
  );

  // Attach myStream to local video element
  useEffect(() => {
    if (!myVideoRef.current || !myStream) return;
    
    const videoEl = myVideoRef.current;
    
    // Only update if different stream
    if (videoEl.srcObject === myStream) return;
    
    videoEl.srcObject = myStream;
    videoEl.play().catch(err => {
      if (err?.name !== "AbortError") {
        console.error("Error playing local video:", err);
      }
    });

    return () => {
      // Cleanup on unmount
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
      }
    };
  }, [myStream]);

  // Same for remote stream
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

  // When local stream is created or re-created, ensure PeerService has senders
  useEffect(() => {
    if (!myStream) return;
    try {
      PeerService.addLocalStream(myStream);
    } catch (err) {
      console.error("Failed to add local stream to PeerService:", err);
    }
  }, [myStream]);

  // Listen to PeerService connection state changes
  useEffect(() => {
    const attach = () => {
      const removeConn = PeerService.onConnectionStateChange?.(() => {
        try {
          setConnectionState(PeerService.getPeer().connectionState);
          setIceConnectionState(PeerService.getPeer().iceConnectionState);
        } catch (e) {}
      });
      return () => {
        if (removeConn) removeConn();
      };
    };

    let cleanup = attach();
    const onReset = () => {
      cleanup();
      cleanup = attach();
    };
    document.addEventListener("peer-reset", onReset);

    return () => {
      cleanup();
      document.removeEventListener("peer-reset", onReset);
    };
  }, []);

  const endCall = useCallback(() => {
    const roomToLog = room || 'undefined';

    // 1. Stop local tracks
    if (myStream) {
      myStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) {}
      });
    }

    // 2. Emit signals
    if (remoteSocketId && socket) {
      socket.emit("call:end", { to: remoteSocketId });
    }
    if (socket && room) {
      socket.emit("leave:room");
    }

    // 3. Clear streams
    setMyStream(null);
    setRemoteStream(null);

    // 4. Clear video elements
    if (myVideoRef.current) myVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    
    // 5. Reset peer
    try {
      PeerService.removeAllSenders();
      PeerService.reset();
    } catch (err) {}

    // 6. Clear remote connection state - ADD THIS
    if (setRemoteUserName) setRemoteUserName("Remote User");
    // Note: Don't clear remoteSocketId here - let the socket events handle it

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('room');
      sessionStorage.removeItem('userName');
      sessionStorage.removeItem('videoEnabled');
      sessionStorage.removeItem('audioEnabled');
    }
    
    // 7. Navigate
    if (navigate) {
      navigate.replace('/');
    }
  }, [myStream, socket, remoteSocketId, room, navigate, setRemoteStream, setMyStream, setRemoteUserName]);

  // Replace the toggleVideo and toggleAudio functions in useMedia.ts
  const toggleVideo = useCallback(async () => {
    if (!myStream) return false;
    
    const videoTrack = myStream.getVideoTracks()[0];
    
    if (videoTrack) {
      // Video track exists, just toggle it
      videoTrack.enabled = !videoTrack.enabled;
      
      // Update sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem("videoEnabled", String(videoTrack.enabled));
      }
      
      return videoTrack.enabled;
    } else {
      // No video track exists, need to get a new stream with video
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        
        const newVideoTrack = newStream.getVideoTracks()[0];
        
        // Add the new video track to existing stream
        myStream.addTrack(newVideoTrack);
        
        // Add to peer connection and trigger renegotiation
        const peer = PeerService.getPeer();
        if (peer && peer.connectionState !== 'closed' && remoteSocketId) {
          // Add track to peer
          peer.addTrack(newVideoTrack, myStream);
          
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
          sessionStorage.setItem("videoEnabled", "true");
        }
        
        // Trigger a re-render
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
          audio: true
        });
        
        const newAudioTrack = newStream.getAudioTracks()[0];
        
        // Add the new audio track to existing stream
        myStream.addTrack(newAudioTrack);
        
        // Add to peer connection and trigger renegotiation
        const peer = PeerService.getPeer();
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

  useEffect(() => {
    const setupListeners = () => {
      const handleConnectionChange = () => {
        setConnectionState(PeerService.peer.connectionState);
      };

      const handleIceConnectionChange = () => {
        setIceConnectionState(PeerService.peer.iceConnectionState);
      };

      PeerService.peer.addEventListener('connectionstatechange', handleConnectionChange);
      PeerService.peer.addEventListener('iceconnectionstatechange', handleIceConnectionChange);

      return () => {
        PeerService.peer.removeEventListener('connectionstatechange', handleConnectionChange);
        PeerService.peer.removeEventListener('iceconnectionstatechange', handleIceConnectionChange);
      };
    };
    
    let cleanup = setupListeners();

    const handlePeerReset = () => {
      cleanup();
      cleanup = setupListeners();
    };

    document.addEventListener('peer-reset', handlePeerReset);

    return () => {
      cleanup();
      document.removeEventListener('peer-reset', handlePeerReset);
    };
  }, []); 

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