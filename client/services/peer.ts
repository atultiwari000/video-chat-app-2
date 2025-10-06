// PeerService.ts
// This service manages WebRTC peer-to-peer connections for video/audio streaming
// It handles creating connections, exchanging media streams, and managing ICE candidates

class PeerService {
  // The main WebRTC connection object - handles peer-to-peer communication
  peer!: RTCPeerConnection;  
  
  // Array to track all RTP senders (these send our audio/video to the other peer)
  private senders: RTCRtpSender[] = [];
  
  // Map to keep track of all event listeners so we can clean them up later
  // Key: event name (like "icecandidate"), Value: array of callback functions
  private listeners = new Map<string, Function[]>();
  
  // Promise that resolves when peer connection is fully created
  // Helps us wait for async initialization before using the peer
  private peerPromise: Promise<RTCPeerConnection> | null = null;

  constructor() {
    // Only create peer connection when running in a browser (not during server-side rendering)
    // typeof window checks if we're in a browser environment
    if (typeof window !== "undefined") {
      // Start creating the peer connection asynchronously
      this.peerPromise = this.createPeer();
    }
  }

  // Creates a new RTCPeerConnection with TURN/STUN servers from Twilio
  private async createPeer(): Promise<RTCPeerConnection> {
    try {
      // Fetch ICE servers (STUN/TURN) from your backend
      // ICE servers help establish connections even behind firewalls/NATs
      const response = await fetch("https://video-chat-app-2-ep0t.onrender.com/ice-servers");
      const { iceServers } = await response.json();
      
      // Create the actual peer connection with configuration
      this.peer = new RTCPeerConnection({
        iceServers, // STUN/TURN servers for NAT traversal
        iceCandidatePoolSize: 10, // Pre-gather ICE candidates for faster connection
      });

      // Listen to ICE connection state changes (checking, connected, failed, etc.)
      this.peer.addEventListener("iceconnectionstatechange", () => {
        // Uncomment to debug: shows when ICE is gathering, checking, connected, etc.
        // console.log("ICE connection state:", this.peer.iceConnectionState);
      });
      
      // Listen to overall connection state (new, connecting, connected, disconnected, failed, closed)
      this.peer.addEventListener("connectionstatechange", () => {
        // Uncomment to debug: shows overall connection health
        // console.log("Connection state:", this.peer.connectionState);
      });
      
      // Listen to signaling state (stable, have-local-offer, have-remote-offer, etc.)
      this.peer.addEventListener("signalingstatechange", () => {
        // Uncomment to debug: shows where we are in the offer/answer exchange
        // console.log("Signaling state:", this.peer.signalingState);
      });

      return this.peer;
    } catch (error) {
      console.error("Error creating peer:", error);
      throw error;
    }
  }

  // Ensures peer connection exists before using it
  // Returns the peer connection, creating it if necessary
  async getPeer(): Promise<RTCPeerConnection> {
    // If peer doesn't exist and we're in browser, start creating it
    if (!this.peerPromise && typeof window !== "undefined") {
      this.peerPromise = this.createPeer();
    }
    
    // Wait for peer creation to complete
    if (this.peerPromise) {
      await this.peerPromise;
    }
    
    return this.peer;
  }

  // Creates an offer to start a call (caller side)
  // Offer contains information about what media we want to send/receive
  async getOffer() {
    await this.getPeer(); // Make sure peer exists first
    
    // Create SDP offer (describes our media capabilities)
    const offer = await this.peer.createOffer();
    
    // Set it as our local description (commits to sending this offer)
    await this.peer.setLocalDescription(offer);
    
    // Return the offer to send to the other peer via signaling server
    return this.peer.localDescription!;
  }

  // Creates an answer to accept a call (receiver side)
  // Takes the caller's offer and responds with our capabilities
  async getAnswer(offer: RTCSessionDescriptionInit) {
    await this.getPeer(); // Make sure peer exists first
    
    // Set the remote offer we received from the caller
    await this.peer.setRemoteDescription(new RTCSessionDescription(offer));
    
    // Create our answer based on the offer
    const answer = await this.peer.createAnswer();
    
    // Set our answer as local description
    await this.peer.setLocalDescription(answer);
    
    // Return the answer to send back to the caller
    return this.peer.localDescription!;
  }

  // Sets the answer received from the other peer (caller side)
  async setRemoteAnswer(answer: RTCSessionDescriptionInit) {
    try {
      await this.getPeer(); // Make sure peer exists first
      
      // Set the remote answer from the receiver
      // This completes the offer/answer exchange
      await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      // If this fails, usually means timing issue or connection already in wrong state
      // console.warn("setRemoteAnswer failed — state:", this.peer?.signalingState, err);
      throw err;
    }
  }

  // -- ICE helpers --
  // Registers a callback to be called when new ICE candidates are found
  // ICE candidates are network addresses where we can be reached
  onIceCandidate(callback: (candidate: RTCIceCandidate) => void) {
    // This function sets up the listener asynchronously
    const setupListener = async () => {
      // CRITICAL: Wait for peer to exist before adding listener
      await this.getPeer();
      
      // Handler function that gets called when ICE candidate is found
      const handler = (ev: RTCPeerConnectionIceEvent) => {
        // Only call callback if candidate exists (null means gathering is done)
        if (ev.candidate) callback(ev.candidate);
      };
      
      // Add the event listener to the peer connection
      this.peer.addEventListener("icecandidate", handler);
      
      // Register it in our tracking map for cleanup later
      this.registerListener("icecandidate", handler);
      
      // Return cleanup function
      return () => {
        if (this.peer) {
          this.peer.removeEventListener("icecandidate", handler);
          this.unregisterListener("icecandidate", handler);
        }
      };
    };

    // Return a cleanup function immediately (even though setup is async)
    let cleanup: (() => void) | null = null;
    setupListener().then(fn => cleanup = fn);
    
    return () => {
      if (cleanup) cleanup();
    };
  }

  // Adds an ICE candidate received from the other peer
  // This tells our peer connection about another way to reach the remote peer
  async addIceCandidate(candidate: RTCIceCandidateInit) {
    await this.getPeer(); // Make sure peer exists first
    
    // Add the remote candidate to our connection
    await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
  }

  // -- Track handling --
  // Registers callback for when remote peer sends us media tracks (audio/video)
  async onTrack(callback: (ev: RTCTrackEvent) => void) {
    await this.getPeer(); // Make sure peer exists first
    
    // Add listener for incoming tracks
    this.peer.addEventListener("track", callback);
    this.registerListener("track", callback);
    
    // Return cleanup function
    return () => {
      if (this.peer) {
        this.peer.removeEventListener("track", callback);
        this.unregisterListener("track", callback);
      }
    };
  }

  // -- Reset connection --
  // Completely resets the peer connection (used when call ends or starting new call)
  async reset() {
    // console.log("Resetting peer connection");
    
    // Close existing peer connection if it exists
    if (this.peer) {
      try {
        // List of all events we might have listeners for
        const events = ['icecandidate', 'track', 'connectionstatechange', 'iceconnectionstatechange', 'signalingstatechange'];
        
        // Remove all event listeners to prevent memory leaks
        events.forEach(event => {
          const listeners = this.listeners.get(event) || [];
          listeners.forEach(fn => {
            try {
              this.peer.removeEventListener(event, fn as any);
            } catch (e) {}
          });
        });
        
        // Close the peer connection if it's not already closed
        if (this.peer.connectionState !== 'closed') {
          this.peer.close();
        }
      } catch (e) {
        console.error("Error closing peer:", e);
      }
    }

    // Clear all state to start fresh
    this.senders = [];
    this.listeners.clear();
    
    // Create a brand new peer connection
    this.peerPromise = this.createPeer();
    await this.peerPromise;
    
    // Dispatch custom event that components can listen to
    document.dispatchEvent(new Event("peer-reset"));
  }

  // Gets all current RTP senders (tracks we're sending)
  async getSenders() {
    await this.getPeer();
    return this.peer.getSenders?.() || [];
  }

  // Adds our local media stream (camera/microphone) to the connection
  async addLocalStream(stream: MediaStream) {
    await this.getPeer(); // Make sure peer exists first

    // Get list of senders we're already using
    const existingSenders = this.peer.getSenders?.() || [];

    // Helper to find if we already have a sender for audio or video
    const findSender = (kind: "audio" | "video") =>
      existingSenders.find((s) => s.track?.kind === kind);

    // Extract audio and video tracks from the stream
    const audioTrack = stream.getAudioTracks()[0] ?? null;
    const videoTrack = stream.getVideoTracks()[0] ?? null;

    // Handle audio track: replace existing or add new
    const audioSender = findSender("audio");
    try {
      if (audioSender && audioSender.replaceTrack) {
        // If we already have an audio sender, just replace the track
        // This is better than removing and re-adding (less renegotiation)
        await audioSender.replaceTrack(audioTrack);
      } else if (audioTrack) {
        // If no audio sender exists, add the track
        const s = this.peer.addTrack(audioTrack, stream);
        if (s) this.senders.push(s);
      }
    } catch (err) {
      // Fail silently to avoid breaking the whole flow
      // console.warn("replace/add audio sender failed:", err);
    }

    // Handle video track: replace existing or add new
    const videoSender = findSender("video");
    try {
      if (videoSender && videoSender.replaceTrack) {
        // If we already have a video sender, just replace the track
        await videoSender.replaceTrack(videoTrack);
      } else if (videoTrack) {
        // If no video sender exists, add the track
        const s = this.peer.addTrack(videoTrack, stream);
        if (s) this.senders.push(s);
      }
    } catch (err) {
      // Fail silently to avoid breaking the whole flow
      // console.warn("replace/add video sender failed:", err);
    }

    // Return all current senders
    return this.peer.getSenders?.() || [];
  }

  // Removes all tracks we're currently sending (stops sending video/audio)
  async removeAllSenders() {
    await this.getPeer();
    
    // Get all current senders
    const currentSenders = this.peer.getSenders?.() || [];
    
    // Remove each one from the peer connection
    currentSenders.forEach((s) => {
      try { this.peer.removeTrack?.(s); } catch {}
    });
    
    // Clear our senders array
    this.senders = [];
  }

  // Registers callback for connection state changes
  async onConnectionStateChange(callback: () => void) {
    await this.getPeer(); // Make sure peer exists first
    
    const handler = () => callback();
    this.peer.addEventListener("connectionstatechange", handler);
    this.registerListener("connectionstatechange", handler);
    
    // Return cleanup function
    return () => {
      if (this.peer) {
        this.peer.removeEventListener("connectionstatechange", handler);
        this.unregisterListener("connectionstatechange", handler);
      }
    };
  }

  // Gets current state information about the connection (for debugging)
  async getInfo() {
    await this.getPeer();
    return {
      connectionState: this.peer.connectionState,
      iceConnectionState: this.peer.iceConnectionState,
      signalingState: this.peer.signalingState,
      localDescription: this.peer.localDescription,
      remoteDescription: this.peer.remoteDescription,
    };
  }

  // Helper to keep track of event listeners we've registered
  private registerListener(name: string, fn: Function) {
    const arr = this.listeners.get(name) || [];
    arr.push(fn);
    this.listeners.set(name, arr);
  }

  // Helper to remove event listeners from our tracking
  private unregisterListener(name: string, fn: Function) {
    const arr = this.listeners.get(name) || [];
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
    this.listeners.set(name, arr);
  }
}

// Export a singleton instance so all parts of the app use the same peer connection
export default new PeerService();