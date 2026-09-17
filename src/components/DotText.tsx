import { Text, type TextProps } from 'react-native';

import { colors, fonts } from '../theme';

/** Text rendered in the dot-matrix face. The app's only typographic voice. */
export function DotText({ style, ...props }: TextProps) {
  return (
    <Text
      style={[{ color: colors.text.primary, fontFamily: fonts.dot }, style]}
      {...props}
    />
  );
}
