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
import { useColorScheme, View } from 'react-native';

import { SessionProvider } from '../src/shell/session';
import { colors, setScheme } from '../src/theme';

export default function RootLayout() {
  // Set before anything below renders, so every sheet and every inline colour
  // reads the scheme the system is in. The tree under the session is keyed on
  // it: a change of scheme remounts the screens, the session does not move.
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  setScheme(scheme);

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
    return <View style={{ backgroundColor: colors.canvas, flex: 1 }} />;
  }

  return (
    <SessionProvider>
      <StatusBar style="auto" />
      <Stack
        key={scheme}
        screenOptions={{
          contentStyle: { backgroundColor: colors.canvas },
          headerShown: false,
        }}
      />
    </SessionProvider>
  );
}
