// Small helpers for the race's overlays: inline styles, and a line of text.

/** Set `css` on `e`'s inline style. */
export const style = (e: HTMLElement, css: Partial<CSSStyleDeclaration>) => Object.assign(e.style, css);

/** A block of `text` styled with `css`. */
export const line = (text: string, css: Partial<CSSStyleDeclaration> = {}) => {
  const d = document.createElement('div');
  d.textContent = text;
  style(d, css);
  return d;
};
