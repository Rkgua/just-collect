import { useEffect, useRef, type ReactNode } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

/** Stay in the activity window so rotation and per-window brightness apply to the visible player. */
export function PlayerLayer({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const back = useRef(onBack);
  back.current = onBack;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      back.current();
      return true;
    });
    return () => subscription.remove();
  }, []);
  return (
    <View accessibilityViewIsModal style={s.root}>
      {children}
    </View>
  );
}
const s = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    elevation: 100,
    backgroundColor: '#080A0F',
  },
});
