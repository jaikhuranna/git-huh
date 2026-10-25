import {
  IBMPlexMono_200ExtraLight,
  IBMPlexMono_300Light,
  IBMPlexMono_400Regular,
  IBMPlexMono_400Regular_Italic,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-mono';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { createContext, useContext, useState } from 'react';
import { useColorScheme, View } from 'react-native';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { SessionProvider } from '../src/shell/session';
import { colors, setScheme, type Scheme } from '../src/theme';

/**
 * The scheme the tree last rendered with. `setScheme` runs during render so
 * sheets and `colors.x` already match; this context is what makes that render
 * happen again without unmounting the navigator.
 */
const SchemeContext = createContext<{ scheme: Scheme; version: number }>({
  scheme: 'light',
  version: 0,
});

/** The palette version in force. Read it to redraw when appearance changes. */
export function useSchemeVersion(): number {
  return useContext(SchemeContext).version;
}

export default function RootLayout() {
  // Set before anything below renders, so every sheet and every inline colour
  // reads the scheme the system is in. The navigator stays mounted: drafts,
  // the route and scroll survive a change of appearance.
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  setScheme(scheme);
  const [tracked, setTracked] = useState<{ scheme: Scheme; version: number }>({
    scheme,
    version: 0,
  });
  if (tracked.scheme !== scheme) {
    setTracked({ scheme, version: tracked.version + 1 });
  }

  // A font failure must not block the app: Type.tsx declares a platform
  // fallback on every primitive, so we render either way.
  const [loaded, error] = useFonts({
    IBMPlexMono_200ExtraLight,
    IBMPlexMono_300Light,
    IBMPlexMono_400Regular,
    IBMPlexMono_400Regular_Italic,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });


  if (!loaded && !error) {
    return (
      <SchemeContext.Provider value={tracked}>
        <View style={{ backgroundColor: colors.canvas, flex: 1 }} />
      </SchemeContext.Provider>
    );
  }

  return (
    <SchemeContext.Provider value={tracked}>
      <KeyboardProvider>
        <SessionProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: colors.canvas },
              headerShown: false,
            }}
          />
        </SessionProvider>
      </KeyboardProvider>
    </SchemeContext.Provider>
  );
}
