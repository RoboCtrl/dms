/**
 * Pure grouping-key derivation for the history list. A group key collapses the
 * records that should share an entry counter and be de-duplicated together.
 * No DOM or storage dependencies.
 */
import { contentWords } from "./catalog-match.js";

/**
 * Derive the grouping key for scanned content under a grouping mode. Returns a
 * string key when the content can be grouped, or null when the entry should
 * stand alone (ungrouped): a counter of 1 and never collapsed by
 * hide-duplicates, even if another entry has identical content.
 *
 * Modes:
 * - "full": the whole content string.
 * - "firstToken": the first whitespace token; null when absent.
 * - "firstSuffix": the last two characters of the first whitespace token; null
 *   when that token has fewer than two characters or is absent.
 * - "secondToken": the second whitespace token; null when absent.
 * - "none": always null.
 * Unknown modes fall back to "full".
 *
 * @param {string} content - The scanned content.
 * @param {"full"|"firstToken"|"firstSuffix"|"secondToken"|"none"} mode - The grouping mode.
 * @returns {string|null} The group key, or null when ungrouped.
 */
export function groupKey(content, mode) {
  switch (mode) {
    case "none":
      return null;
    case "firstToken": {
      const first = contentWords(content)[0];
      return first ?? null;
    }
    case "firstSuffix": {
      const first = contentWords(content)[0];
      return first && first.length >= 2 ? first.slice(-2) : null;
    }
    case "secondToken": {
      const second = contentWords(content)[1];
      return second ?? null;
    }
    case "full":
    default:
      return content;
  }
}
