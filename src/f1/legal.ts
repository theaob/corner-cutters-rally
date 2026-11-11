// The privacy policy and the terms (legal/, published with the dashboard to
// GitHub Pages by .github/workflows/pages.yml), linked under the settings. They
// open outside the game: a tab of their own in a browser, the phone's browser
// in the Android app (Capacitor hands it any page not the app's own).

/** Where the pages are published. */
export const LEGAL_BASE = 'https://theaob.github.io/corner-cutters-rally/';
export const PRIVACY_URL = `${LEGAL_BASE}privacy.html`;
export const TERMS_URL = `${LEGAL_BASE}terms.html`;

/** A quiet link that opens `url` outside the game, on the press's release (in a cross-origin frame on a phone a tap's click can go astray, and the menus hold their touches). */
function legalLink(text: string, url: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  let armed = false;
  a.addEventListener('click', (e) => e.preventDefault());
  a.addEventListener('pointerdown', () => (armed = true));
  a.addEventListener('pointerleave', () => (armed = false));
  a.addEventListener('pointerup', () => {
    if (!armed) return;
    armed = false;
    window.open(url, '_blank', 'noopener');
  });
  return a;
}

/** PRIVACY · TERMS, under the settings' version line. */
export function legalLine(): HTMLElement {
  const p = document.createElement('p');
  p.className = 'legal-line';
  p.append(legalLink('PRIVACY', PRIVACY_URL), document.createTextNode(' · '), legalLink('TERMS', TERMS_URL));
  return p;
}
