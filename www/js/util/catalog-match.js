/**
 * Pure token-matching helpers for the catalog feature. A token matches scanned
 * content when it appears as a whole whitespace-delimited word of that content.
 * No DOM or storage dependencies.
 */

/**
 * Split scanned content into its whitespace-delimited words, dropping empty
 * fragments produced by leading, trailing, or repeated whitespace.
 * @param {string} content - The scanned content.
 * @returns {string[]} The non-empty words, in order.
 */
export function contentWords(content) {
  return content.split(/\s+/).filter(Boolean);
}

/**
 * Whether a value is a valid catalog token: a non-empty string containing no
 * whitespace (a token bounded by whitespace can never itself contain any).
 * @param {unknown} token - The candidate token.
 * @returns {boolean} True when the token is usable.
 */
export function isValidToken(token) {
  return typeof token === "string" && token.length > 0 && !/\s/.test(token);
}

/**
 * Find the catalog entry matching scanned content. Words are scanned
 * left-to-right; the first word that is a known token determines the returned
 * entry. Every distinct matching token is collected in `matchedTokens` so the
 * caller can detect (and report) multi-token matches.
 * @param {string} content - The scanned content.
 * @param {Map<string, object>} byToken - Map of token to catalog entry.
 * @returns {{entry: object, matchedTokens: string[]} | null} The first match, or null.
 */
export function findMatch(content, byToken) {
  let entry = null;
  const matchedTokens = [];
  for (const word of contentWords(content)) {
    if (byToken.has(word)) {
      if (!entry) entry = byToken.get(word);
      if (!matchedTokens.includes(word)) matchedTokens.push(word);
    }
  }
  return entry ? { entry, matchedTokens } : null;
}
