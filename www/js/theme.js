/**
 * Apply a theme by setting the data-theme attribute on the document root.
 * CSS variables in styles.css respond to this attribute.
 * @param {"dark"|"light"} theme - The theme to activate.
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}
