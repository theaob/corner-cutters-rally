// The team logos: SVG drawings on a 64 x 64 canvas, in each team's colours,
// designed together round by round. logoSvg() wraps one for the page.

export const LOGOS: Record<string, string> = {
  // Cows, sun disc
  'milk-energy': `
    <circle cx="32" cy="32" r="29" fill="#1e2b5c"/>
    <circle cx="32" cy="24" r="11" fill="#d8323c"/>
    <g transform="translate(32 34) scale(0.84) translate(-32 -34)">
    <g transform="translate(-5 0)">
    <path d="M7 25 C3 27 3 33 4 37" fill="none" stroke="#f2c14e" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M2.4 36 L4 40.5 L5.8 36 Z" fill="#f2c14e"/>
    <path d="M6 26 C6 24 7 23 9 23 H23 C25 23 26 24 26.5 26 V33 C26.5 35.5 25 36.5 23 36.5 H9 C7 36.5 6 35.5 6 33.5 Z" fill="#f2c14e"/>
    <ellipse cx="16" cy="37" rx="2.6" ry="1.8" fill="#f2c14e"/>
    <g transform="rotate(14 25 27)">
    <path d="M24 25 H30 C32.5 25 34 26.5 34 29 V32 C34 34 32.5 35 31 35 H26 C24.5 35 24 34 24 32.5 Z" fill="#f2c14e"/>
    <path d="M26.5 25.5 C26 22 24 20 21.5 20" fill="none" stroke="#fff3cf" stroke-width="2" stroke-linecap="round"/>
    <path d="M30 25.5 C30 22 28.5 19.5 26 19" fill="none" stroke="#fff3cf" stroke-width="2" stroke-linecap="round"/>
    <path d="M24.5 27 L21 25.5 L22.5 28.5 Z" fill="#f2c14e"/>
    </g>
    <rect x="8" y="34" width="3.6" height="10" rx="1.4" fill="#f2c14e"/>
    <rect x="12.6" y="34" width="3.6" height="10" rx="1.4" fill="#f2c14e"/>
    <rect x="19.4" y="34" width="3.6" height="10" rx="1.4" fill="#f2c14e" transform="rotate(-12 21 34)"/>
    <rect x="23" y="33.5" width="3.6" height="10" rx="1.4" fill="#f2c14e" transform="rotate(-24 24.8 33.5)"/>
    </g>
    <g transform="translate(69 0) scale(-1 1)">
    <path d="M7 25 C3 27 3 33 4 37" fill="none" stroke="#f2c14e" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M2.4 36 L4 40.5 L5.8 36 Z" fill="#f2c14e"/>
    <path d="M6 26 C6 24 7 23 9 23 H23 C25 23 26 24 26.5 26 V33 C26.5 35.5 25 36.5 23 36.5 H9 C7 36.5 6 35.5 6 33.5 Z" fill="#f2c14e"/>
    <ellipse cx="16" cy="37" rx="2.6" ry="1.8" fill="#f2c14e"/>
    <g transform="rotate(14 25 27)">
    <path d="M24 25 H30 C32.5 25 34 26.5 34 29 V32 C34 34 32.5 35 31 35 H26 C24.5 35 24 34 24 32.5 Z" fill="#f2c14e"/>
    <path d="M26.5 25.5 C26 22 24 20 21.5 20" fill="none" stroke="#fff3cf" stroke-width="2" stroke-linecap="round"/>
    <path d="M30 25.5 C30 22 28.5 19.5 26 19" fill="none" stroke="#fff3cf" stroke-width="2" stroke-linecap="round"/>
    <path d="M24.5 27 L21 25.5 L22.5 28.5 Z" fill="#f2c14e"/>
    </g>
    <rect x="8" y="34" width="3.6" height="10" rx="1.4" fill="#f2c14e"/>
    <rect x="12.6" y="34" width="3.6" height="10" rx="1.4" fill="#f2c14e"/>
    <rect x="19.4" y="34" width="3.6" height="10" rx="1.4" fill="#f2c14e" transform="rotate(-12 21 34)"/>
    <rect x="23" y="33.5" width="3.6" height="10" rx="1.4" fill="#f2c14e" transform="rotate(-24 24.8 33.5)"/>
    </g>
    </g>`,
  // Monkey shield, P · M
  'prancing-monkey': `
    <path d="M9 6 H55 V28 C55 45 44 53 32 59 C20 53 9 45 9 28 Z" fill="#fff200" stroke="#dc0000" stroke-width="3.5"/>
    <path d="M22 46 C14 46 12 38 18 36" fill="none" stroke="#1b1b26" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M23 44 C22 36 26 28 32 24 C36 22 38 26 36 30 C34 36 30 42 28 46 Z" fill="#1b1b26"/>
    <circle cx="37" cy="19" r="6" fill="#1b1b26"/>
    <ellipse cx="42" cy="21" rx="3.5" ry="2.5" fill="#1b1b26"/>
    <circle cx="33" cy="16" r="2.4" fill="#1b1b26"/>
    <path d="M33 27 C38 24 42 22 44 16" fill="none" stroke="#1b1b26" stroke-width="3" stroke-linecap="round"/>
    <path d="M34 31 C40 30 44 28 47 23" fill="none" stroke="#1b1b26" stroke-width="3" stroke-linecap="round"/>
    <path d="M25 44 L21 52 H25" fill="none" stroke="#1b1b26" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M29 45 L32 52 H36" fill="none" stroke="#1b1b26" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="32" y="12.5" font-family="Arial Black, Arial" font-weight="900" font-size="5.5" text-anchor="middle" fill="#dc0000">P · M</text>`,
  // Triangle in a circle
  'golden-arrows': `
    <circle cx="32" cy="32" r="27" fill="none" stroke="#e0a526" stroke-width="5"/>
    <path d="M32 13 L50 44 H14 Z" fill="#e0a526"/>
    <path d="M32 13 L50 44 H32 Z" fill="#f5cf5a" opacity=".35"/>`,
  // Swoosh C
  'calrissian': `
    <circle cx="32" cy="32" r="29" fill="#1b1b26"/>
    <path d="M50 17 C40 9 22 10 14 22 C7 33 12 47 26 51 C38 54 50 48 58 40 C46 46 32 47 25 41 C19 36 19 26 26 21 C33 16 43 16 50 17 Z" fill="#ff8000"/>`,
  // Crowned lime
  'british-lime': `
    <rect x="4" y="4" width="56" height="56" rx="12" fill="#00594f"/>
    <path d="M16 26 L20 12 L26 20 L32 10 L38 20 L44 12 L48 26 Z" fill="#cedc00"/>
    <ellipse cx="32" cy="42" rx="14" ry="11" fill="#cedc00"/>
    <path d="M44 36 C50 34 52 30 50 28 C46 28 44 32 44 36 Z" fill="#8fbf1f"/>`,
  // R with accent
  'renee': `
    <rect x="4" y="4" width="56" height="56" rx="12" fill="#1b1b26"/>
    <path d="M20 50 V16 H34 A10 10 0 0 1 34 36 H20 M32 36 L44 50" fill="none" stroke="#f7d117" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M42 10 L50 6" stroke="#f7d117" stroke-width="4" stroke-linecap="round"/>`,
  // Vinyl
  'frankies-groove': `
    <circle cx="32" cy="32" r="28" fill="#1b1b26"/>
    <circle cx="32" cy="32" r="22" fill="none" stroke="#333344" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="17" fill="none" stroke="#333344" stroke-width="1.5"/>
    <circle cx="32" cy="32" r="11" fill="#1868db"/>
    <text x="32" y="36" font-family="Arial Black, Arial" font-weight="900" font-size="9" text-anchor="middle" fill="#f4f4f8">FG</text>`,
  // Cows, ½ off
  'cheaper-milk': `
    <rect x="3" y="3" width="58" height="58" rx="10" fill="#1634cc"/>
    <circle cx="32" cy="19" r="7" fill="#d8323c"/>
    <g transform="translate(32 34) scale(0.84) translate(-32 -34)">
    <g transform="translate(-5 0)">
    <path d="M7 25 C3 27 3 33 4 37" fill="none" stroke="#f4f4f8" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M2.4 36 L4 40.5 L5.8 36 Z" fill="#f4f4f8"/>
    <path d="M6 26 C6 24 7 23 9 23 H23 C25 23 26 24 26.5 26 V33 C26.5 35.5 25 36.5 23 36.5 H9 C7 36.5 6 35.5 6 33.5 Z" fill="#f4f4f8"/>
    <ellipse cx="16" cy="37" rx="2.6" ry="1.8" fill="#f4f4f8"/>
    <g transform="rotate(14 25 27)">
    <path d="M24 25 H30 C32.5 25 34 26.5 34 29 V32 C34 34 32.5 35 31 35 H26 C24.5 35 24 34 24 32.5 Z" fill="#f4f4f8"/>
    <path d="M26.5 25.5 C26 22 24 20 21.5 20" fill="none" stroke="#fff3cf" stroke-width="2" stroke-linecap="round"/>
    <path d="M30 25.5 C30 22 28.5 19.5 26 19" fill="none" stroke="#fff3cf" stroke-width="2" stroke-linecap="round"/>
    <path d="M24.5 27 L21 25.5 L22.5 28.5 Z" fill="#f4f4f8"/>
    </g>
    <rect x="8" y="34" width="3.6" height="10" rx="1.4" fill="#f4f4f8"/>
    <rect x="12.6" y="34" width="3.6" height="10" rx="1.4" fill="#f4f4f8"/>
    <rect x="19.4" y="34" width="3.6" height="10" rx="1.4" fill="#f4f4f8" transform="rotate(-12 21 34)"/>
    <rect x="23" y="33.5" width="3.6" height="10" rx="1.4" fill="#f4f4f8" transform="rotate(-24 24.8 33.5)"/>
    </g>
    <g transform="translate(69 0) scale(-1 1)">
    <path d="M7 25 C3 27 3 33 4 37" fill="none" stroke="#f4f4f8" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M2.4 36 L4 40.5 L5.8 36 Z" fill="#f4f4f8"/>
    <path d="M6 26 C6 24 7 23 9 23 H23 C25 23 26 24 26.5 26 V33 C26.5 35.5 25 36.5 23 36.5 H9 C7 36.5 6 35.5 6 33.5 Z" fill="#f4f4f8"/>
    <ellipse cx="16" cy="37" rx="2.6" ry="1.8" fill="#f4f4f8"/>
    <g transform="rotate(14 25 27)">
    <path d="M24 25 H30 C32.5 25 34 26.5 34 29 V32 C34 34 32.5 35 31 35 H26 C24.5 35 24 34 24 32.5 Z" fill="#f4f4f8"/>
    <path d="M26.5 25.5 C26 22 24 20 21.5 20" fill="none" stroke="#fff3cf" stroke-width="2" stroke-linecap="round"/>
    <path d="M30 25.5 C30 22 28.5 19.5 26 19" fill="none" stroke="#fff3cf" stroke-width="2" stroke-linecap="round"/>
    <path d="M24.5 27 L21 25.5 L22.5 28.5 Z" fill="#f4f4f8"/>
    </g>
    <rect x="8" y="34" width="3.6" height="10" rx="1.4" fill="#f4f4f8"/>
    <rect x="12.6" y="34" width="3.6" height="10" rx="1.4" fill="#f4f4f8"/>
    <rect x="19.4" y="34" width="3.6" height="10" rx="1.4" fill="#f4f4f8" transform="rotate(-12 21 34)"/>
    <rect x="23" y="33.5" width="3.6" height="10" rx="1.4" fill="#f4f4f8" transform="rotate(-24 24.8 33.5)"/>
    </g>
    </g>
    <g transform="rotate(-12 44 48)">
    <path d="M30 42 H52 L56 48 L52 54 H30 Z" fill="#d8323c" stroke="#f4f4f8" stroke-width="1.5"/>
    <circle cx="33.5" cy="48" r="1.6" fill="#f4f4f8"/>
    <text x="42.5" y="51" font-family="Arial Black, Arial" font-weight="900" font-size="7.5" text-anchor="middle" fill="#f4f4f8">½ OFF</text>
    </g>`,
  // Cog
  'dmw': `
    <circle cx="32" cy="32" r="28" fill="#f4f4f8"/>
    <rect x="29" y="4" width="6" height="10" fill="#1c69d4" transform="rotate(0 32 32)"/>
    <rect x="29" y="4" width="6" height="10" fill="#1c69d4" transform="rotate(45 32 32)"/>
    <rect x="29" y="4" width="6" height="10" fill="#1c69d4" transform="rotate(90 32 32)"/>
    <rect x="29" y="4" width="6" height="10" fill="#1c69d4" transform="rotate(135 32 32)"/>
    <rect x="29" y="4" width="6" height="10" fill="#1c69d4" transform="rotate(180 32 32)"/>
    <rect x="29" y="4" width="6" height="10" fill="#1c69d4" transform="rotate(225 32 32)"/>
    <rect x="29" y="4" width="6" height="10" fill="#1c69d4" transform="rotate(270 32 32)"/>
    <rect x="29" y="4" width="6" height="10" fill="#1c69d4" transform="rotate(315 32 32)"/>
    <circle cx="32" cy="32" r="19" fill="#1c69d4"/>
    <text x="32" y="37" font-family="Arial Black, Arial" font-weight="900" font-size="12" text-anchor="middle" fill="#f4f4f8">DMW</text>`,
  // Cloud
  'maas': `
    <rect x="4" y="4" width="56" height="56" rx="12" fill="#8a8d94"/>
    <path d="M18 44 A9 9 0 0 1 18 26 A12 12 0 0 1 40 22 A10 10 0 0 1 48 44 Z" fill="#f4f4f8" stroke="#d8323c" stroke-width="3"/>
    <text x="32" y="40" font-family="Arial Black, Arial" font-weight="900" font-size="10" text-anchor="middle" fill="#d8323c">MaaS</text>`,
  // Yarn ball
  'grandmas-fave': `
    <rect x="4" y="4" width="56" height="56" rx="12" fill="#f4f4f8"/>
    <circle cx="30" cy="36" r="18" fill="#1b1b26"/>
    <path d="M14 30 C22 26 36 26 46 34 M16 42 C26 36 38 38 44 46 M22 20 C28 30 30 44 26 54" fill="none" stroke="#f4f4f8" stroke-width="2"/>
    <path d="M40 8 L54 50 M50 8 L42 50" stroke="#1b1b26" stroke-width="3" stroke-linecap="round"/>`,
};

/** A team's logo as an <svg> element, `size` px square (undefined for a team without one). */
export function logoSvg(teamId: string, size: number): SVGSVGElement | undefined {
  const art = LOGOS[teamId];
  if (!art) return undefined;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = art;
  return svg;
}
