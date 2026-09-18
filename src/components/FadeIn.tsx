import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Easing } from 'react-native';

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  /** Vertical offset the content rises from, in px. */
  offset?: number;
}

/**
 * Entrance animation: fade + small rise, native-driven so it stays smooth
 * even while JS is busy.
 */
export function FadeIn({ children, delay = 0, offset = 10 }: FadeInProps) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      delay,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, delay]);

  return (
    <Animated.View
      style={{
        opacity: progress,        transform: [
          {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [offset, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}
