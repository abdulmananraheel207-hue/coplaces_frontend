/**
 * Chart colours. The categorical order is the validated reference order (dataviz skill, checked with
 * validate_palette.js against this app's light panel surface #eef2f6 and white): every hard check passes; slots 2 to 5
 * are below 3:1 contrast, so every chart ships a legend and a table view. Colours are given in this fixed order and
 * never cycled; a colour follows its series, never its rank.
 */
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'] as const;

/** One meaning, one colour, on every finance chart. */
export const MONEY_COLOR = {
  in: SERIES[0],
  out: SERIES[1],
  net: SERIES[2],
  invoiced: SERIES[3],
} as const;

/** Lateness, light to dark (an ordinal ramp, validated with --ordinal: monotone, one hue, light end clears 2:1). */
export const AGING_RAMP = ['#5598e7', '#2a78d6', '#1c5cab', '#0d366b'] as const;

/** State, never a series: paid is good, overdue is critical; always shown with a word beside it. */
export const STATUS_COLOR = {
  good: '#0ca30c',
  critical: '#d03b3b',
  neutral: '#8a99ab',
  pending: '#2a78d6',
} as const;

/** Recessive chrome and text tokens from the app's palette. */
export const CHROME = {
  grid: '#d9e0e8',
  baseline: '#9aa8b8',
  text: '#14263f',
  muted: '#3f506b',
  surface: '#f4f6f9',
} as const;
