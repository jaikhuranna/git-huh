import { useEffect, useRef, useState } from 'react';

/**
 * Seconds of wall clock since the ticker woke up, advanced once per frame.
 *
 * The app's two moving screens — the loading wave and the language spiral —
 * warp geometry rather than transform a view, so neither can be handed to
 * Animated's native driver. What matters instead is that the motion is a
 * function of *time* rather than of frame count: a `setInterval` stepping a
 * counter runs at whatever rate the timer fires and stutters visibly, while
 * this keeps its speed even when a frame is dropped.
 *
 * Passing `active: false` parks the loop, which is what every off-screen
 * page in the pager does — thirteen screens are mounted at once and only one
 * of them is being looked at.
 */
export function useTicker(active = true): number {
  const [seconds, setSeconds] = useState(0);
  // Where the clock stood when it was last parked, so resuming does not
  // rewind the animation to zero.
  const elapsed = useRef(0);

  useEffect(() => {
    if (!active) return;

    let frame = 0;
    let start: number | null = null;
    const base = elapsed.current;

    const step = (now: number) => {
      if (start === null) start = now;
      elapsed.current = base + (now - start) / 1000;
      setSeconds(elapsed.current);
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return seconds;
}
