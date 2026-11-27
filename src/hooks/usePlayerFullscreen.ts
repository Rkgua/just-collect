import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Orientation from 'expo-screen-orientation';
import * as Brightness from 'expo-brightness';

/** Keep fullscreen in the same React view so controls, playback and temporary speed survive rotation. */
export function usePlayerFullscreen() {
  const [fullscreen, setFullscreen] = useState(false);
  const [orientationError, setError] = useState('');
  const original = useRef<Orientation.OrientationLock | null>(null);
  const originalBrightness = useRef<number | null>(null);
  const mounted = useRef(true);
  const queue = useRef(Promise.resolve());
  const restoreBrightness = useCallback(async () => {
    if (Platform.OS === 'android') await Brightness.restoreSystemBrightnessAsync();
    else if (Platform.OS === 'ios' && originalBrightness.current !== null)
      await Brightness.setBrightnessAsync(originalBrightness.current);
  }, []);
  const changeFullscreen = useCallback(
    (value: boolean) => {
      setFullscreen(value);
      setError('');
      if (Platform.OS === 'web') return;
      queue.current = queue.current
        .catch(() => {})
        .then(async () => {
          if (!mounted.current) return;
          if (original.current === null) {
            original.current = await Orientation.getOrientationLockAsync();
            originalBrightness.current = await Brightness.getBrightnessAsync().catch(() => null);
          }
          await Orientation.lockAsync(
            value ? Orientation.OrientationLock.LANDSCAPE : original.current,
          );
          if (!value) await restoreBrightness();
        })
        .catch(() => {
          if (mounted.current) {
            setFullscreen(false);
            setError('暂时无法旋转屏幕，请重试横屏按钮。');
          }
        });
    },
    [restoreBrightness],
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void queue.current
        .catch(() => {})
        .then(async () => {
          if (original.current !== null) {
            await Orientation.lockAsync(original.current);
            await restoreBrightness();
          }
        })
        .catch(() => {});
    };
  }, [restoreBrightness]);
  return { fullscreen, changeFullscreen, orientationError };
}
