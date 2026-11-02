/**
 * Whether the person asked their system for less motion. Kept apart from the 3D code so that pages without 3D (the
 * sign-in page, every page's shell) never pull three.js into the first download just to ask this.
 */
export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
