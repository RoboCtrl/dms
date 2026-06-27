/**
 * Inline Lucide (lucide.dev) icons as themeable SVG markup. Icons are embedded
 * as string constants so they inject inline and inherit the current text colour
 * via stroke="currentColor" — no web font, no runtime fetch, fully offline.
 */

/**
 * Wrap inner SVG markup in a standard 24x24 Lucide svg element sized to 1em.
 * @param {string} inner - The path/line/circle markup for the icon body.
 * @returns {string} Complete <svg> markup.
 */
function svg(inner) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
    'width="1em" height="1em" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
    'aria-hidden="true">' +
    inner +
    "</svg>"
  );
}

/** Icon body markup keyed by Lucide icon name. */
const ICONS = {
  menu: svg(
    '<line x1="4" x2="20" y1="6" y2="6"/>' +
      '<line x1="4" x2="20" y1="12" y2="12"/>' +
      '<line x1="4" x2="20" y1="18" y2="18"/>',
  ),
  x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  "trash-2": svg(
    '<path d="M3 6h18"/>' +
      '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
      '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
      '<line x1="10" x2="10" y1="11" y2="17"/>' +
      '<line x1="14" x2="14" y1="11" y2="17"/>',
  ),
  camera: svg(
    '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/>' +
      '<circle cx="12" cy="13" r="3"/>',
  ),
  "camera-off": svg(
    '<line x1="2" x2="22" y1="2" y2="22"/>' +
      '<path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/>' +
      '<path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5"/>' +
      '<path d="M14.121 15.121A3 3 0 1 1 9.88 10.88"/>',
  ),
};

/**
 * Return SVG markup for a named Lucide icon.
 * @param {"menu"|"x"|"trash-2"|"camera"|"camera-off"} name - Icon name.
 * @returns {string} Complete <svg> markup.
 * @throws {Error} If the icon name is unknown.
 */
export function iconSvg(name) {
  const markup = ICONS[name];
  if (!markup) throw new Error(`Unknown icon: ${name}`);
  return markup;
}

/**
 * Replace an element's contents with a named Lucide icon.
 * @param {HTMLElement} el - Target element.
 * @param {"menu"|"x"|"trash-2"|"camera"|"camera-off"} name - Icon name.
 */
export function setIcon(el, name) {
  el.innerHTML = iconSvg(name);
}
