import { useEffect, useRef, useState } from 'react';

/** Text with exactly one number in it, like "Rs 391,008" or "12 members". Anything else is left alone. */
const ONE_NUMBER = /^([^\d]*)(\d[\d,]*)(\.\d+)?([^\d]*)$/;

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Counts the number in a piece of text up from zero (or from its last value), keeping the rest of the text and its format. */
export function CountText({ text }: { text: string }) {
  const m = ONE_NUMBER.exec(text);
  const target = m ? parseFloat(`${m[2]!.replace(/,/g, '')}${m[3] ?? ''}`) : NaN;
  const [value, setValue] = useState(() => (m && !reduced() ? 0 : target));
  const from = useRef(value);

  useEffect(() => {
    if (!Number.isFinite(target) || reduced()) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let raf = requestAnimationFrame(function step(now: number) {
      const t = Math.min(1, (now - start) / 750);
      const eased = 1 - Math.pow(1 - t, 3);
      const v = begin + (target - begin) * eased;
      from.current = v;
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(raf);
  }, [target]);

  if (!m || !Number.isFinite(value)) return <>{text}</>;
  const decimals = m[3] ? m[3].length - 1 : 0;
  const shown = value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: m[2]!.includes(',') });
  return (
    <>
      {m[1]}
      {shown}
      {m[4]}
    </>
  );
}
