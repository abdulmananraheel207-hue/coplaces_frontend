import { money } from './format';
import type { PriceBasis } from '../types';

/**
 * The one line under a booking price that says where it came from. The server sends exactly these four bases
 * (`PriceBasis` in the backend's services/bookings.ts): a hot desk included in the plan, free meeting time (the plan's
 * minutes plus the member's credit hours), a priced shift, or the hourly price from the price list.
 */
export function basisNote(b: PriceBasis | undefined, currency: string, staff: boolean): string {
  const who = staff ? "the member's" : 'your';
  if (!b) return '';
  switch (b.type) {
    case 'plan':
      return `Included in ${who} plan`;
    case 'minutes':
      return b.billableMinutes > 0
        ? `${b.freeMinutes} min covered by ${who} free meeting time, the rest charged by the hour`
        : `Covered by ${who} free meeting time`;
    case 'shift':
      return `${b.name} shift price (set on the shift in Plans)`;
    case 'hourly':
      return `${money(b.rateCents, currency)} an hour (set on the Pricing and credit hours page)`;
    default: {
      // A basis this app does not know yet says nothing rather than something wrong.
      const unknown: never = b;
      void unknown;
      return '';
    }
  }
}
