import {
  DotGothic16_400Regular,
  useFonts,
} from '@expo-google-fonts/dotgothic16';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { colors, fonts } from '../src/theme';

export default function RootLayout() {
  const [fontLoaded, fontError] = useFonts({
    [fonts.dot]: DotGothic16_400Regular,
  });

  if (!fontLoaded && !fontError) {
    return <View style={{ backgroundColor: colors.canvas, flex: 1 }} />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.canvas },
          headerShown: false,
        }}
      />
    </>
  );
}
