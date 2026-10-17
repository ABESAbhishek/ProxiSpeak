import { useEffect, useState } from 'react';

export type DeviceCoordinates = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type LocationState = {
  enabled: boolean;
  coordinates: DeviceCoordinates | null;
  error: string | null;
};

const initialState: LocationState = {
  enabled: false,
  coordinates: null,
  error: null,
};

/** Starts a browser location watch only after the user enables sharing. */
export const useDeviceLocation = () => {
  const [state, setState] = useState<LocationState>(initialState);

  useEffect(() => {
    if (!state.enabled) return;

    if (!navigator.geolocation) {
      setState((current) => ({ ...current, error: 'Location is not available in this browser.' }));
      return;
    }

    let active = true;
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => {
        if (!active) return;
        setState((current) => ({
          ...current,
          coordinates: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
          },
          error: null,
        }));
      },
      (error) => {
        if (!active) return;
        const message = error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Allow it in your browser settings to share.'
          : error.code === error.POSITION_UNAVAILABLE
            ? 'Your device could not determine its location.'
            : 'Location timed out. Keep sharing on to try again.';
        setState((current) => ({ ...current, error: message }));
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 },
    );

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [state.enabled]);

  const start = () => setState({ enabled: true, coordinates: null, error: null });
  const stop = () => setState(initialState);

  return { ...state, start, stop };
};
