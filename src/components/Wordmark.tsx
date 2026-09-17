import { colors } from '../theme';

import { DotText } from './DotText';

interface WordmarkProps {
  size?: number;
}

/** "git-huh?" in dot-matrix, question mark in Nothing red. */
export function Wordmark({ size = 14 }: WordmarkProps) {
  return (
    <DotText style={{ fontSize: size, letterSpacing: 1 }}>
      git-huh<DotText style={{ color: colors.accent, fontSize: size }}>?</DotText>
    </DotText>
  );
}
