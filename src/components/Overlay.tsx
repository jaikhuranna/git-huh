import { useEffect, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { savedAge } from '../lib/store';
import { colors, space, themed } from '../theme';
import { Data, Label, Micro } from './Type';

/**
 * The frame every pushed screen shares: `← back` on the left, where it is in
 * mono on the right, and the system back button wired to the same thing —
 * an overlay is not a route, so without the handler back would leave the app
 * from three screens deep.
 */
export function OverlayFrame({
  where,
  onBack,
  children,
  footer,
}: {
  where: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.chrome}>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={onBack}>
          <Label style={styles.back}>← back</Label>
        </Pressable>
        <Data numberOfLines={1} style={styles.where}>
          {where}
        </Data>
      </View>
      <View style={styles.body}>{children}</View>
      {footer}
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.canvas,
      flex: 1,
    },
    chrome: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 14,
      paddingBottom: 6,
      paddingHorizontal: space.gutter,
      paddingTop: 10,
    },
    back: {
      color: colors.ink,
      paddingVertical: 4,
    },
    where: {
      color: colors.ink40,
      flex: 1,
      fontSize: 10,
      textAlign: 'right',
    },
    body: {
      flex: 1,
    },
  }),
);

/**
 * The age of what is on screen, when it is not fresh. Offline, it says so;
 * refreshing, it says nothing, because the new answer is a second away.
 */
export function SavedNote({
  savedAt,
  offline,
}: {
  savedAt: number | null;
  offline: boolean;
}) {
  if (!offline || savedAt == null) return null;
  return <Micro style={noteStyles.note}>offline · saved {savedAge(savedAt)}</Micro>;
}

const noteStyles = themed(() =>
  StyleSheet.create({
    note: {
      color: colors.ink40,
      paddingBottom: 6,
      paddingHorizontal: space.gutter,
    },
  }),
);
