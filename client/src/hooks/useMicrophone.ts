import { useState, useRef, useEffect, useCallback } from 'react';
import type { MicrophoneStatus } from '../types';

export interface UseMicrophoneResult {
  stream: MediaStream | null;
  status: MicrophoneStatus;
  isMuted: boolean;
  errorMessage: string | null;
  audioLevel: number;
  startMicrophone: () => Promise<MediaStream | null>;
  stopMicrophone: () => void;
  toggleMute: () => void;
}

export function useMicrophone(): UseMicrophoneResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MicrophoneStatus>('idle');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Audio level monitoring using Web Audio API
  const startLevelMeter = useCallback((mediaStream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(100, Math.round((average / 128) * 100));
        setAudioLevel(normalized);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('[Microphone] Audio meter could not be initialized:', err);
    }
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  /**
   * Release all media stream tracks cleanly
   */
  const releaseTracks = useCallback(() => {
    stopLevelMeter();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
        console.log(`[Microphone] Released track: ${track.id} (${track.kind})`);
      });
      streamRef.current = null;
    }
    setStream(null);
  }, [stopLevelMeter]);

  /**
   * Requests microphone access.
   * STRICT REQUIREMENT: Only called when user clicks Start Microphone / Start Audio.
   */
  const startMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    // If already active, return the existing stream
    if (streamRef.current && streamRef.current.active) {
      return streamRef.current;
    }

    setStatus('requesting');
    setErrorMessage(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = 'Microphone API (getUserMedia) is not supported in this browser or context.';
      setErrorMessage(msg);
      setStatus('error');
      return null;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus('active');
      setIsMuted(false);

      // Handle track ending unexpectedly (e.g. unplugged)
      mediaStream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          console.warn('[Microphone] Audio track ended unexpectedly.');
          releaseTracks();
          setStatus('idle');
        };
      });

      startLevelMeter(mediaStream);
      return mediaStream;
    } catch (err: unknown) {
      console.error('[Microphone] Error requesting permission:', err);
      releaseTracks();

      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setStatus('denied');
          setErrorMessage('Microphone access was denied. Please allow microphone permissions in your browser settings.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setStatus('error');
          setErrorMessage('No microphone device found. Please connect a microphone and retry.');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
          setStatus('error');
          setErrorMessage('Microphone is already in use by another application.');
        } else {
          setStatus('error');
          setErrorMessage(`Microphone error: ${err.message}`);
        }
      } else {
        setStatus('error');
        setErrorMessage('Failed to start microphone. Please check your system audio settings.');
      }
      return null;
    }
  }, [releaseTracks, startLevelMeter]);

  /**
   * Stops the microphone and releases all tracks.
   */
  const stopMicrophone = useCallback(() => {
    releaseTracks();
    setStatus('idle');
    setIsMuted(false);
    setErrorMessage(null);
  }, [releaseTracks]);

  /**
   * Toggles mute state without releasing the media track.
   */
  const toggleMute = useCallback(() => {
    if (!streamRef.current) return;

    const audioTracks = streamRef.current.getAudioTracks();
    if (audioTracks.length === 0) return;

    const newMutedState = !isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !newMutedState;
    });

    setIsMuted(newMutedState);
    setStatus(newMutedState ? 'muted' : 'active');
  }, [isMuted]);

  // Clean up all tracks on component unmount
  useEffect(() => {
    return () => {
      releaseTracks();
    };
  }, [releaseTracks]);

  return {
    stream,
    status,
    isMuted,
    errorMessage,
    audioLevel,
    startMicrophone,
    stopMicrophone,
    toggleMute
  };
}
