// The crews: the paint schemes a rally car can wear (yours picked on the rally's
// screen), and the nine rival crews of a rally, each a made-up driver with a
// car number and a scheme of their own. Engine-free.

import type { LiveryPattern } from '../engine/render/vehicles3d';

/** A rally car's paint: the body, the second colour (its pattern's), and the pattern over the bonnet and roof. */
export interface Scheme {
  id: string;
  name: string;
  body: string;
  trim: string;
  /** the shell's sides, when it has a third colour */
  accent?: string;
  pattern: LiveryPattern;
}

/** The paint schemes, yours to pick from (the rivals wear them too). */
export const SCHEMES: Scheme[] = [
  { id: 'stripes', name: 'RACING STRIPES', body: '#f4f4f8', trim: '#1d4fa8', accent: '#d8323c', pattern: 'twin' },
  { id: 'powder', name: 'POWDER BLUE', body: '#7fb8e0', trim: '#f08a24', pattern: 'stripe' },
  { id: 'works-red', name: 'WORKS RED', body: '#c8202c', trim: '#f4f4f8', pattern: 'band' },
  { id: 'forest', name: 'FOREST GREEN', body: '#1f5a3a', trim: '#f2c14e', pattern: 'chevron' },
  { id: 'midnight', name: 'MIDNIGHT', body: '#1b1b26', trim: '#ff7a1a', pattern: 'nose' },
  { id: 'sunburst', name: 'SUNBURST', body: '#f7c518', trim: '#1b1b26', pattern: 'halves' },
  { id: 'arctic', name: 'ARCTIC', body: '#e8f0f6', trim: '#2fa8c8', accent: '#8a8d94', pattern: 'split' },
  { id: 'royal', name: 'ROYAL BLUE', body: '#1c3f9c', trim: '#f4f4f8', pattern: 'stripe' },
  { id: 'lime', name: 'LIME', body: '#9ccc28', trim: '#1b1b26', pattern: 'twin' },
  { id: 'copper', name: 'COPPER', body: '#b4572a', trim: '#f2e2c4', pattern: 'band' },
];

export const schemeById = (id: string | null | undefined): Scheme | undefined => SCHEMES.find((s) => s.id === id);

/** A rival crew: its driver's name (as the timing screens show it), the car's number, and its paint. */
export interface Crew {
  id: string;
  name: string;
  number: number;
  scheme: string;
}

/** The rival crews a rally draws its nine from. */
export const CREWS: Crew[] = [
  { id: 'lindqvist', name: 'LINDQVIST', number: 2, scheme: 'arctic' },
  { id: 'moreau', name: 'MOREAU', number: 3, scheme: 'royal' },
  { id: 'okafor', name: 'OKAFOR', number: 4, scheme: 'forest' },
  { id: 'varga', name: 'VARGA', number: 5, scheme: 'works-red' },
  { id: 'tanaka', name: 'TANAKA', number: 6, scheme: 'midnight' },
  { id: 'castillo', name: 'CASTILLO', number: 7, scheme: 'sunburst' },
  { id: 'brennan', name: 'BRENNAN', number: 8, scheme: 'lime' },
  { id: 'novak', name: 'NOVAK', number: 9, scheme: 'copper' },
  { id: 'haugen', name: 'HAUGEN', number: 10, scheme: 'powder' },
  { id: 'rossi', name: 'ROSSI', number: 11, scheme: 'stripes' },
  { id: 'kowalski', name: 'KOWALSKI', number: 12, scheme: 'royal' },
  { id: 'mbeki', name: 'MBEKI', number: 14, scheme: 'forest' },
];

export const crewById = (id: string | null | undefined): Crew | undefined => CREWS.find((c) => c.id === id);

/** Your car's number. */
export const YOUR_NUMBER = 1;

/** A scheme as a car's livery (vehicles3d.ts), with its number on the roof. */
export const liveryOf = (s: Scheme, number?: number) => ({ body: s.body, stripe: s.trim, accent: s.accent, pattern: s.pattern, number });
