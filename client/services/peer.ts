class PeerService {
  peer!: RTCPeerConnection;  
  private senders: RTCRtpSender[] = [];
  private listeners = new Map<string, Function[]>();
  private peerPromise: Promise<RTCPeerConnection> | null = null;

  constructor() {
    // Only create peer in browser
    if (typeof window !== "undefined") {
      this.peerPromise = this.createPeer();
    }
  }

  private async createPeer(): Promise<RTCPeerConnection> {
    try {
      const response = await fetch("https://video-chat-app-2-ep0t.onrender.com/ice-servers");
      const { iceServers } = await response.json();
      
      this.peer = new RTCPeerConnection({
        iceServers,
        iceCandidatePoolSize: 10,
      });

      this.peer.addEventListener("iceconnectionstatechange", () => {
        // console.log("ICE connection state:", this.peer.iceConnectionState);
      });
      this.peer.addEventListener("connectionstatechange", () => {
        // console.log("Connection state:", this.peer.connectionState);
      });
      this.peer.addEventListener("signalingstatechange", () => {
        // console.log("Signaling state:", this.peer.signalingState);
      });

      return this.peer;
    } catch (error) {
      console.error("Error creating peer:", error);
      throw error;
    }
  }

  async getPeer(): Promise<RTCPeerConnection> {
    if (!this.peerPromise && typeof window !== "undefined") {
      this.peerPromise = this.createPeer();
    }
    
    if (this.peerPromise) {
      await this.peerPromise;
    }
    
    return this.peer;
  }

  async getOffer() {
    await this.getPeer(); // Ensure peer exists
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    return this.peer.localDescription!;
  }

  async getAnswer(offer: RTCSessionDescriptionInit) {
    await this.getPeer(); // Ensure peer exists
    await this.peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    return this.peer.localDescription!;
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit) {
    try {
      await this.getPeer(); // Ensure peer exists
      await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.warn("setRemoteAnswer failed — state:", this.peer?.signalingState, err);
      throw err;
    }
  }

  // -- ICE helpers --
  onIceCandidate(callback: (candidate: RTCIceCandidate) => void) {
    const setupListener = async () => {
      await this.getPeer(); // CRITICAL FIX: Wait for peer to exist
      
      const handler = (ev: RTCPeerConnectionIceEvent) => {
        if (ev.candidate) callback(ev.candidate);
      };
      
      this.peer.addEventListener("icecandidate", handler);
      this.registerListener("icecandidate", handler);
      
      return () => {
        if (this.peer) {
          this.peer.removeEventListener("icecandidate", handler);
          this.unregisterListener("icecandidate", handler);
        }
      };
    };

    // Return a cleanup function that works immediately
    let cleanup: (() => void) | null = null;
    setupListener().then(fn => cleanup = fn);
    
    return () => {
      if (cleanup) cleanup();
    };
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    await this.getPeer(); // Ensure peer exists
    await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
  }

  // -- Track handling --
  async onTrack(callback: (ev: RTCTrackEvent) => void) {
    await this.getPeer(); // Ensure peer exists
    this.peer.addEventListener("track", callback);
    this.registerListener("track", callback);
    return () => {
      if (this.peer) {
        this.peer.removeEventListener("track", callback);
        this.unregisterListener("track", callback);
      }
    };
  }

  // -- Reset connection --
  async reset() {
    // console.log("Resetting peer connection");
    
    // Close existing peer
    if (this.peer) {
      try {
        // Remove all event listeners
        const events = ['icecandidate', 'track', 'connectionstatechange', 'iceconnectionstatechange', 'signalingstatechange'];
        events.forEach(event => {
          const listeners = this.listeners.get(event) || [];
          listeners.forEach(fn => {
            try {
              this.peer.removeEventListener(event, fn as any);
            } catch (e) {}
          });
        });
        
        // Close the connection
        if (this.peer.connectionState !== 'closed') {
          this.peer.close();
        }
      } catch (e) {
        console.error("Error closing peer:", e);
      }
    }

    // Clear all state
    this.senders = [];
    this.listeners.clear();
    
    // Create fresh peer connection
    this.peerPromise = this.createPeer();
    await this.peerPromise;
    
    // Dispatch reset event
    document.dispatchEvent(new Event("peer-reset"));
  }

  async getSenders() {
    await this.getPeer();
    return this.peer.getSenders?.() || [];
  }

  async addLocalStream(stream: MediaStream) {
    await this.getPeer(); // Ensure peer exists

    const existingSenders = this.peer.getSenders?.() || [];

    // Simple, working logic to find senders by track kind
    const findSender = (kind: "audio" | "video") =>
      existingSenders.find((s) => s.track?.kind === kind);

    const audioTrack = stream.getAudioTracks()[0] ?? null;
    const videoTrack = stream.getVideoTracks()[0] ?? null;

    // Replace or add audio
    const audioSender = findSender("audio");
    try {
      if (audioSender && audioSender.replaceTrack) {
        await audioSender.replaceTrack(audioTrack);
      } else if (audioTrack) {
        const s = this.peer.addTrack(audioTrack, stream);
        if (s) this.senders.push(s);
      }
    } catch (err) {
      console.warn("replace/add audio sender failed:", err);
    }

    // Replace or add video
    const videoSender = findSender("video");
    try {
      if (videoSender && videoSender.replaceTrack) {
        await videoSender.replaceTrack(videoTrack);
      } else if (videoTrack) {
        const s = this.peer.addTrack(videoTrack, stream);
        if (s) this.senders.push(s);
      }
    } catch (err) {
      console.warn("replace/add video sender failed:", err);
    }

    return this.peer.getSenders?.() || [];
  }

  async removeAllSenders() {
    await this.getPeer();
    const currentSenders = this.peer.getSenders?.() || [];
    currentSenders.forEach((s) => {
      try { this.peer.removeTrack?.(s); } catch {}
    });
    this.senders = [];
  }

  async onConnectionStateChange(callback: () => void) {
    await this.getPeer(); // Ensure peer exists
    const handler = () => callback();
    this.peer.addEventListener("connectionstatechange", handler);
    this.registerListener("connectionstatechange", handler);
    return () => {
      if (this.peer) {
        this.peer.removeEventListener("connectionstatechange", handler);
        this.unregisterListener("connectionstatechange", handler);
      }
    };
  }

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

  private registerListener(name: string, fn: Function) {
    const arr = this.listeners.get(name) || [];
    arr.push(fn);
    this.listeners.set(name, arr);
  }

  private unregisterListener(name: string, fn: Function) {
    const arr = this.listeners.get(name) || [];
    const idx = arr.indexOf(fn);
    if (idx >= 0) arr.splice(idx, 1);
    this.listeners.set(name, arr);
  }
}

export default new PeerService();