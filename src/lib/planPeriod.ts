import { daysBetween } from './time';

/** Whether a member's plan period has run out or is about to (two days or less), so the owner can renew it. */
export function planPeriodState(planEnd: string | null, today: string): 'ended' | 'soon' | null {
  if (!planEnd) return null;
  if (planEnd < today) return 'ended';
  return daysBetween(today, planEnd) <= 2 ? 'soon' : null;
}

export const planPeriodWords = (planEnd: string, today: string) => {
  const n = daysBetween(today, planEnd);
  return n < 0 ? 'has ended' : n === 0 ? 'ends today' : n === 1 ? 'ends tomorrow' : `ends in ${n} days`;
};
