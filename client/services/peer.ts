class PeerService {
  peer!: RTCPeerConnection;  
  private senders: RTCRtpSender[] = [];
  private listeners = new Map<string, Function[]>();

  constructor() {
    // Only create peer in browser
    if (typeof window !== "undefined") {
      this.createPeer();
    }
  }

  private createPeer() {
    this.peer = new RTCPeerConnection({
      iceServers: [
        { urls: ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"] },
      ],
    });

    this.peer.addEventListener("iceconnectionstatechange", () => {
      console.log("Peer ICE state:", this.peer.iceConnectionState);
    });
    this.peer.addEventListener("connectionstatechange", () => {
      console.log("Peer connection state:", this.peer.connectionState);
    });
    this.peer.addEventListener("signalingstatechange", () => {
      console.log("Peer signaling state:", this.peer.signalingState);
    });
  }

  getPeer() {
    if (!this.peer && typeof window !== "undefined") {
      this.createPeer();
    }
    return this.peer;
  }

  async getOffer() {
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    return this.peer.localDescription!;
  }

  async getAnswer(offer: RTCSessionDescriptionInit) {
    await this.peer.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    return this.peer.localDescription!;
  }

  async setRemoteAnswer(answer: RTCSessionDescriptionInit) {
    try {
      await this.peer.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (err) {
      console.warn("setRemoteAnswer failed — state:", this.peer.signalingState, err);
      throw err;
    }
  }

  // -- ICE helpers --
  onIceCandidate(callback: (candidate: RTCIceCandidate) => void) {
    const handler = (ev: RTCPeerConnectionIceEvent) => {
      if (ev.candidate) callback(ev.candidate);
    };
    this.peer.addEventListener("icecandidate", handler);
    this.registerListener("icecandidate", handler);
    return () => {
      this.peer.removeEventListener("icecandidate", handler);
      this.unregisterListener("icecandidate", handler);
    };
  }

  async addIceCandidate(candidate: RTCIceCandidateInit) {
    await this.peer.addIceCandidate(new RTCIceCandidate(candidate));
  }

  // -- Track handling --
  onTrack(callback: (ev: RTCTrackEvent) => void) {
    this.peer.addEventListener("track", callback);
    this.registerListener("track", callback);
    return () => {
      this.peer.removeEventListener("track", callback);
      this.unregisterListener("track", callback);
    };
  }

  // -- Reset connection --
  reset() {
    console.log("=== RESETTING PEER CONNECTION ===");
    
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
    this.createPeer();
    
    // Dispatch reset event
    document.dispatchEvent(new Event("peer-reset"));
    
    console.log("PeerService: reset complete, new state:", this.peer.connectionState);
  }

  getSenders() {
    return this.peer.getSenders?.() || [];
  }

  addLocalStream(stream: MediaStream) {
    if (!this.peer) this.createPeer();

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
        audioSender.replaceTrack(audioTrack);
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
        videoSender.replaceTrack(videoTrack);
      } else if (videoTrack) {
        const s = this.peer.addTrack(videoTrack, stream);
        if (s) this.senders.push(s);
      }
    } catch (err) {
      console.warn("replace/add video sender failed:", err);
    }

    return this.peer.getSenders?.() || [];
  }

  removeAllSenders() {
    const currentSenders = this.peer.getSenders?.() || [];
    currentSenders.forEach((s) => {
      try { this.peer.removeTrack?.(s); } catch {}
    });
    this.senders = [];
  }

  onConnectionStateChange(callback: () => void) {
    const handler = () => callback();
    this.peer.addEventListener("connectionstatechange", handler);
    this.registerListener("connectionstatechange", handler);
    return () => {
      this.peer.removeEventListener("connectionstatechange", handler);
      this.unregisterListener("connectionstatechange", handler);
    };
  }

  getInfo() {
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
