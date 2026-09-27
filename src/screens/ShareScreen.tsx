import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { OverlayFrame } from '../components/Overlay';
import { CARD_HEIGHT, CARD_WIDTH, ShareCard } from '../components/ShareCard';
import { Label, Micro } from '../components/Type';
import { useNav } from '../lib/nav';
import { shareKindOf } from '../lib/shareData';
import type { ScreenName } from '../shell/sections';
import { useSession } from '../shell/session';
import { colors, radii, space, themed } from '../theme';

/** 4:3 at a size every timeline takes without cropping or softening it. */
const OUT_WIDTH = 1600;
const OUT_HEIGHT = 1200;

type Phase = 'idle' | 'working' | 'failed' | 'unavailable';

/**
 * A view as an image to post. The card is drawn at its own size and shown
 * scaled to the phone, so what you see is exactly the frame that is sent;
 * `share` renders it to a 1600 × 1200 PNG and hands it to the system share
 * sheet, which is where posting, saving and sending all live.
 */
export function ShareScreen({ view }: { view: ScreenName }) {
  const nav = useNav();
  const { model, activity } = useSession();
  const { width } = useWindowDimensions();
  const kind = shareKindOf(view) ?? 'year';
  const card = useRef<View>(null);
  const [phase, setPhase] = useState<Phase>('idle');

  const years = model ? model.years.map((entry) => entry.year).sort((a, b) => b - a) : [];
  const [year, setYear] = useState(() => years[0] ?? new Date().getFullYear());

  useEffect(() => {
    Sharing.isAvailableAsync()
      .then((available) => {
        if (!available) setPhase('unavailable');
      })
      .catch(() => setPhase('unavailable'));
  }, []);

  const share = useCallback(async () => {
    if (!card.current) return;
    setPhase('working');
    try {
      const uri = await captureRef(card, {
        format: 'png',
        height: OUT_HEIGHT,
        quality: 1,
        result: 'tmpfile',
        width: OUT_WIDTH,
      });
      await Sharing.shareAsync(uri, {
        dialogTitle: 'share this card',
        mimeType: 'image/png',
        UTI: 'public.png',
      });
      setPhase('idle');
    } catch {
      setPhase('failed');
    }
  }, []);

  if (!model) return null;

  const box = width - space.gutter * 2;
  const scale = box / CARD_WIDTH;

  return (
    <OverlayFrame onBack={nav.close} where="share · 4:3">
      <ScrollView contentContainerStyle={styles.page}>
        <View style={[styles.preview, { height: CARD_HEIGHT * scale, width: box }]}>
          {/* Scaled from the outside: the card itself stays 640 × 480, which
              is what the capture reads, so the image is never the preview's
              pixels blown up. */}
          <View
            style={{
              height: CARD_HEIGHT,
              left: (box - CARD_WIDTH) / 2,
              position: 'absolute',
              top: (CARD_HEIGHT * scale - CARD_HEIGHT) / 2,
              transform: [{ scale }],
              width: CARD_WIDTH,
            }}
          >
            <ShareCard activity={activity} kind={kind} model={model} ref={card} year={year} />
          </View>
        </View>

        {kind === 'weeks' && years.length > 1 && (
          <View style={styles.chips}>
            {years.map((candidate) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: candidate === year }}
                key={candidate}
                onPress={() => setYear(candidate)}
                style={[styles.chip, candidate === year && styles.chipOn]}
              >
                <Label style={candidate === year ? styles.onBlack : styles.ink}>{candidate}</Label>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          disabled={phase === 'working' || phase === 'unavailable'}
          onPress={share}
          style={[styles.pill, styles.solid, phase === 'working' && styles.busy]}
        >
          <Label style={styles.onBlack}>
            {phase === 'working' ? 'drawing…' : 'share image →'}
          </Label>
        </Pressable>
        <Micro style={styles.note}>
          {phase === 'failed'
            ? 'could not make the image · try again'
            : phase === 'unavailable'
              ? 'this phone has nothing to share to'
              : '1600 × 1200 png · follows the light or dark the phone is in'}
        </Micro>
      </ScrollView>
    </OverlayFrame>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    page: {
      paddingBottom: 40,
      paddingHorizontal: space.gutter,
      paddingTop: 12,
    },
    preview: {
      borderColor: colors.hair,
      borderRadius: 6,
      borderWidth: 1,
      overflow: 'hidden',
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 18,
    },
    chip: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    chipOn: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    ink: {
      color: colors.ink,
    },
    onBlack: {
      color: colors.onBlack,
    },
    pill: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      justifyContent: 'center',
      marginTop: 22,
      paddingHorizontal: 22,
      paddingVertical: 12,
    },
    solid: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    busy: {
      opacity: 0.6,
    },
    note: {
      color: colors.ink40,
      marginTop: 10,
    },
  }),
);
