import { useState, useEffect, useRef, useCallback } from 'react';

// TypeScript declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export const useSpeechCaptions = (remoteStream: MediaStream | null) => {
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [currentCaption, setCurrentCaption] = useState('');
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if browser supports Speech Recognition
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const clearSilenceTimeout = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
  }, []);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimeout();
    // Clear caption after 3 seconds of no speech
    silenceTimeoutRef.current = setTimeout(() => {
      setCurrentCaption('');
    }, 3000);
  }, [clearSilenceTimeout]);

  const startCaptions = useCallback(() => {
    if (!isSupported || !remoteStream) {
      console.warn('Speech recognition not supported or no remote stream');
      return;
    }

    try {
      // Create Speech Recognition
      const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionAPI();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        clearSilenceTimeout();
        
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // Show interim results immediately, final results replace them
        const captionText = finalTranscript || interimTranscript;
        setCurrentCaption(captionText);

        // Start silence timer after speech
        if (finalTranscript) {
          startSilenceTimer();
        }
      };

      recognition.onerror = (event: any) => {
        // Only log real errors, not expected states
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          console.error('Speech recognition error:', event.error);
        }
        
        if (event.error === 'no-speech') {
          setTimeout(() => {
            if (captionsEnabled && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (e) {
                // Ignore "already started" errors
              }
            }
          }, 100);
        }
      };

      recognition.onend = () => {
        // Auto-restart if still enabled
        if (captionsEnabled && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.log('Recognition restart failed:', e);
          }
        }
      };

      // Create audio context to route remote audio to speech recognition
      // Note: Web Speech API listens to default microphone, but we can play
      // remote audio through speakers and it will pick it up
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(remoteStream);
      
      // Connect to destination (speakers) so speech recognition can hear it
      source.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      processorRef.current = source;
      recognitionRef.current = recognition;

      recognition.start();
      console.log('Speech recognition started');
    } catch (error) {
      console.error('Error starting speech recognition:', error);
    }
  }, [remoteStream, isSupported, captionsEnabled, clearSilenceTimeout, startSilenceTimer]);

  const stopCaptions = useCallback(() => {
    clearSilenceTimeout();
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      } catch (e) {
        console.error('Error stopping recognition:', e);
      }
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
        processorRef.current = null;
      } catch (e) {
        console.error('Error disconnecting processor:', e);
      }
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
        audioContextRef.current = null;
      } catch (e) {
        console.error('Error closing audio context:', e);
      }
    }

    setCurrentCaption('');
    console.log('Speech recognition stopped');
  }, [clearSilenceTimeout]);

  const toggleCaptions = useCallback(() => {
    setCaptionsEnabled(prev => !prev);
  }, []);

  // Start/stop based on enabled state
  useEffect(() => {
    if (captionsEnabled && remoteStream) {
      startCaptions();
    } else {
      stopCaptions();
    }

    return () => {
      stopCaptions();
    };
  }, [captionsEnabled, remoteStream, startCaptions, stopCaptions]);

  return {
    captionsEnabled,
    currentCaption,
    toggleCaptions,
    isSupported
  };
};