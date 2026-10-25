import { useState, useRef, useEffect, useCallback } from 'react';
import type { MicrophoneStatus } from '../types';

export interface AudioProcessingConstraints {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

export interface UseMicrophoneResult {
  stream: MediaStream | null;
  status: MicrophoneStatus;
  isMuted: boolean;
  isSpeaking: boolean;
  errorMessage: string | null;
  audioLevel: number;
  frequencyBands: number[];
  permissionState: PermissionState | 'unknown';
  availableDevices: MediaDeviceInfo[];
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
  availableOutputDevices: MediaDeviceInfo[];
  selectedOutputDeviceId: string;
  setSelectedOutputDeviceId: (id: string) => void;
  audioConstraints: AudioProcessingConstraints;
  toggleAudioConstraint: (key: keyof AudioProcessingConstraints) => void;
  isSelfTesting: boolean;
  selfTestSecondsRemaining: number;
  testAudioUrl: string | null;
  startSelfTest: () => Promise<void>;
  clearSelfTest: () => void;
  startMicrophone: (deviceId?: string) => Promise<MediaStream | null>;
  stopMicrophone: () => void;
  toggleMute: () => void;
}

export function useMicrophone(): UseMicrophoneResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<MicrophoneStatus>('idle');
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [frequencyBands, setFrequencyBands] = useState<number[]>([0, 0, 0, 0, 0, 0, 0, 0]);
  const [permissionState, setPermissionState] = useState<PermissionState | 'unknown'>('unknown');
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [availableOutputDevices, setAvailableOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState<string>('');
  const [audioConstraints, setAudioConstraints] = useState<AudioProcessingConstraints>({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  });

  // Microphone Self-Test / Loopback test state
  const [isSelfTesting, setIsSelfTesting] = useState<boolean>(false);
  const [selfTestSecondsRemaining, setSelfTestSecondsRemaining] = useState<number>(0);
  const [testAudioUrl, setTestAudioUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speakingTimeoutRef = useRef<number | null>(null);
  const selfTestTimerRef = useRef<number | null>(null);

  // 1. Query browser permission status via Permissions API
  const checkPermissionState = useCallback(async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setPermissionState(result.state);
        result.onchange = () => {
          setPermissionState(result.state);
        };
      }
    } catch {
      setPermissionState('unknown');
    }
  }, []);

  // 2. Enumerate available audio input and output devices
  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = allDevices.filter((d) => d.kind === 'audioinput');
      const audioOutputs = allDevices.filter((d) => d.kind === 'audiooutput');
      setAvailableDevices(audioInputs);
      setAvailableOutputDevices(audioOutputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
      if (audioOutputs.length > 0 && !selectedOutputDeviceId) {
        setSelectedOutputDeviceId(audioOutputs[0].deviceId);
      }
    } catch (err) {
      console.warn('[Microphone] Could not enumerate audio devices:', err);
    }
  }, [selectedDeviceId, selectedOutputDeviceId]);

  useEffect(() => {
    checkPermissionState();
    refreshDevices();

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, [checkPermissionState, refreshDevices]);

  // Audio level and 8-band frequency monitoring using Web Audio API with Voice Activity Detection (VAD)
  const startLevelMeter = useCallback((mediaStream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

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

        // Voice Activity Detection (VAD): Speaking threshold with debounced reset
        if (normalized > 12 && !isMuted) {
          if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current);
            speakingTimeoutRef.current = null;
          }
          setIsSpeaking(true);
        } else {
          if (!speakingTimeoutRef.current) {
            speakingTimeoutRef.current = window.setTimeout(() => {
              setIsSpeaking(false);
              speakingTimeoutRef.current = null;
            }, 350);
          }
        }

        // Group into 8 frequency visualizer bands
        const bandSize = Math.max(1, Math.floor(dataArray.length / 8));
        const bands: number[] = [];
        for (let b = 0; b < 8; b++) {
          let bSum = 0;
          for (let k = 0; k < bandSize; k++) {
            bSum += dataArray[b * bandSize + k] || 0;
          }
          bands.push(Math.min(100, Math.round((bSum / bandSize / 255) * 100)));
        }
        setFrequencyBands(bands);

        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err) {
      console.warn('[Microphone] Audio meter could not be initialized:', err);
    }
  }, [isMuted]);

  const stopLevelMeter = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => { });
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    setIsSpeaking(false);
    setFrequencyBands([0, 0, 0, 0, 0, 0, 0, 0]);
  }, []);

  /**
   * Release all media stream tracks cleanly
   */
  const releaseTracks = useCallback(() => {
    const currentStream = streamRef.current;

    // Clear the reference first so ended handlers cannot clean up twice.
    streamRef.current = null;
    setStream(null);

    // Stop any running self-test timer.
    if (selfTestTimerRef.current !== null) {
      window.clearInterval(selfTestTimerRef.current);
      selfTestTimerRef.current = null;
    }

    // Stop recording before releasing the microphone.
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;

    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch (error) {
        console.warn('[Microphone] Could not stop recorder:', error);
      }
    }

    // Stop monitoring and release the audio context.
    stopLevelMeter();

    // Detach handlers and release every track.
    if (currentStream) {
      currentStream.getTracks().forEach((track) => {
        track.onended = null;

        if (track.readyState !== 'ended') {
          track.stop();
        }
      });
    }

    setIsSelfTesting(false);
    setIsMuted(false);
    setSelfTestSecondsRemaining(0);
    setAudioLevel(0);
    setIsSpeaking(false);
  }, [stopLevelMeter]);

  /**
   * Dynamically toggles audio processing constraints (echo cancellation, noise suppression, AGC).
   */
  const toggleAudioConstraint = useCallback((key: keyof AudioProcessingConstraints) => {
    setAudioConstraints((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      if (streamRef.current && streamRef.current.active) {
        const audioTrack = streamRef.current.getAudioTracks()[0];
        if (audioTrack && audioTrack.applyConstraints) {
          audioTrack
            .applyConstraints({
              [key]: updated[key]
            })
            .catch((err) => {
              console.warn(`[Microphone] Failed to dynamically apply ${key} constraint:`, err);
            });
        }
      }
      return updated;
    });
  }, []);

  /**
   * Requests microphone access.
   * STRICT REQUIREMENT: Only called when user clicks Start Microphone / Start Audio.
   */
  const startMicrophone = useCallback(async (deviceIdToUse?: string): Promise<MediaStream | null> => {
    // If already active with the same device, return the existing stream
    if (streamRef.current && streamRef.current.active && !deviceIdToUse) {
      return streamRef.current;
    }

    if (streamRef.current) {
      releaseTracks();
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
      const targetDevice = deviceIdToUse || selectedDeviceId;
      const audioConstraintsConfig: MediaTrackConstraints = {
        echoCancellation: audioConstraints.echoCancellation,
        noiseSuppression: audioConstraints.noiseSuppression,
        autoGainControl: audioConstraints.autoGainControl
      };

      if (targetDevice) {
        audioConstraintsConfig.deviceId = { exact: targetDevice };
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraintsConfig,
        video: false
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus('active');
      setIsMuted(false);
      setPermissionState('granted');

      // Refresh devices with actual hardware labels granted
      refreshDevices();

      // Handle missing audio tracks.
      const audioTracks = mediaStream.getAudioTracks();

      if (
        audioTracks.length === 0 ||
        audioTracks.every((track) => track.readyState === 'ended')
      ) {
        releaseTracks();
        setStatus('error');
        setErrorMessage(
          'No active microphone track is available. Please check your microphone and try again.'
        );
        return null;
      }

      // Handle microphone tracks ending unexpectedly.
      audioTracks.forEach((track) => {
        track.onended = () => {
          if (streamRef.current !== mediaStream) return;

          console.warn('[Microphone] Audio track ended unexpectedly.');

          releaseTracks();
          setStatus('error');
          setErrorMessage(
            'Your microphone stopped unexpectedly. Please check your device and restart the microphone.'
          );
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
          setPermissionState('denied');
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
  }, [releaseTracks, startLevelMeter, selectedDeviceId, refreshDevices]);

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

  /**
   * Hardware Loopback Test: Records a 3-second audio snippet and creates a local playback URL
   * to verify microphone input clarity before entering a WebRTC session.
   */
  const startSelfTest = useCallback(async () => {
    if (isSelfTesting) return;

    // Ensure mic is running
    let activeStream = streamRef.current;
    if (!activeStream || !activeStream.active) {
      activeStream = await startMicrophone();
      if (!activeStream) return;
    }

    try {
      setIsSelfTesting(true);
      setSelfTestSecondsRemaining(3);
      setTestAudioUrl(null);

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(activeStream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };


      recorder.onerror = () => {
        if (selfTestTimerRef.current !== null) {
          window.clearInterval(selfTestTimerRef.current);
          selfTestTimerRef.current = null;
        }

        mediaRecorderRef.current = null;
        setIsSelfTesting(false);
        setSelfTestSecondsRemaining(0);
        setErrorMessage('Microphone self-test failed. Please try again.');
      };


      recorder.onstop = () => {
        mediaRecorderRef.current = null;

        if (selfTestTimerRef.current !== null) {
          window.clearInterval(selfTestTimerRef.current);
          selfTestTimerRef.current = null;
        }

        if (streamRef.current !== activeStream || !activeStream.active) {
          setIsSelfTesting(false);
          setSelfTestSecondsRemaining(0);
          return;
        }

        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);

        setTestAudioUrl(url);
        setIsSelfTesting(false);
        setSelfTestSecondsRemaining(0);
      };


      recorder.start();

      let seconds = 3;
      selfTestTimerRef.current = window.setInterval(() => {
        seconds -= 1;
        setSelfTestSecondsRemaining(seconds);

        if (seconds <= 0) {
          if (selfTestTimerRef.current !== null) {
            window.clearInterval(selfTestTimerRef.current);
            selfTestTimerRef.current = null;
          }

          if (recorder.state === 'recording') {
            recorder.stop();
          }
        }
      }, 1000);
    } catch (err) {
      console.warn('[Microphone] Self-test failed:', err);
      setIsSelfTesting(false);
      setSelfTestSecondsRemaining(0);
    }
  }, [isSelfTesting, startMicrophone]);

  const clearSelfTest = useCallback(() => {
    setTestAudioUrl(null);
  }, []);

  // Clean up microphone tracks only when the component unmounts.
  useEffect(() => {
    return () => {
      releaseTracks();
    };
  }, [releaseTracks]);

  // Revoke the previous audio URL when it changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (testAudioUrl) {
        URL.revokeObjectURL(testAudioUrl);
      }
    };
  }, [testAudioUrl]);

  return {
    stream,
    status,
    isMuted,
    isSpeaking,
    errorMessage,
    audioLevel,
    frequencyBands,
    permissionState,
    availableDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    availableOutputDevices,
    selectedOutputDeviceId,
    setSelectedOutputDeviceId,
    audioConstraints,
    toggleAudioConstraint,
    isSelfTesting,
    selfTestSecondsRemaining,
    testAudioUrl,
    startSelfTest,
    clearSelfTest,
    startMicrophone,
    stopMicrophone,
    toggleMute
  };
}
