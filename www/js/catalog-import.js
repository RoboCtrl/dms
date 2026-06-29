/**
 * Catalog import orchestration: list the remote directory of catalog files,
 * fetch and parse a chosen file, validate its contents, and compute how an
 * imported set merges with the existing catalog (conflict detection + merge).
 * Network access is via an injectable fetch so the logic is unit-testable.
 */
import { isValidToken } from "./util/catalog-match.js";

/** Remote directory (nginx autoindex) that serves catalog .json files. */
export const CATALOG_BASE_URL = "https://srv346879.hstgr.cloud/app/data/";

/**
 * Extract catalog file names from an nginx autoindex HTML page: every `href`
 * that ends in ".json" and names a file in this directory (no path separator).
 * @param {string} html - The directory listing HTML.
 * @returns {string[]} The catalog file names.
 */
export function parseListing(html) {
  const names = [];
  const re = /href="([^"]+)"/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (href.endsWith(".json") && !href.includes("/")) names.push(href);
  }
  return names;
}

/**
 * Fetch and parse the remote directory listing into catalog file names.
 * @param {string} baseUrl - The directory URL (with trailing slash).
 * @param {typeof fetch} [fetchFn=fetch] - Fetch implementation (injectable for tests).
 * @returns {Promise<string[]>} The available catalog file names.
 */
export async function listCatalogFiles(baseUrl, fetchFn = fetch) {
  const res = await fetchFn(baseUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`Listing fetch failed: HTTP ${res.status}`);
  return parseListing(await res.text());
}

/**
 * Fetch a single catalog file and parse it as JSON.
 * @param {string} baseUrl - The directory URL (with trailing slash).
 * @param {string} name - The catalog file name.
 * @param {typeof fetch} [fetchFn=fetch] - Fetch implementation (injectable for tests).
 * @returns {Promise<object>} The parsed catalog object.
 */
export async function fetchCatalogFile(baseUrl, name, fetchFn = fetch) {
  const res = await fetchFn(baseUrl + name, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Catalog fetch failed for ${name}: HTTP ${res.status}`);
  }
  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Catalog file ${name} is not valid JSON: ${err.message}`);
  }
}

/**
 * Validate a parsed catalog object and convert it to an entry array. Throws an
 * Error naming the offending token when a token is invalid (empty or contains
 * whitespace), an entry value is not an object, `rn` is not an integer, or
 * `text`/`svg`/`png` is present but not a string. Optional fields that are
 * absent or null are omitted from the entry.
 * @param {object} json - The parsed catalog object, keyed by token.
 * @returns {Array<{token:string, rn?:number, text?:string, svg?:string, png?:string}>}
 */
export function validateCatalog(json) {
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("Catalog must be a JSON object keyed by token.");
  }
  const entries = [];
  for (const [token, value] of Object.entries(json)) {
    if (!isValidToken(token)) {
      throw new Error(
        `Invalid token "${token}": must be non-empty with no whitespace.`,
      );
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid entry for token "${token}": value must be an object.`);
    }
    const entry = { token };
    if (value.rn !== undefined && value.rn !== null) {
      if (!Number.isInteger(value.rn)) {
        throw new Error(`Invalid rn for token "${token}": must be an integer.`);
      }
      entry.rn = value.rn;
    }
    for (const field of ["text", "svg", "png"]) {
      if (value[field] !== undefined && value[field] !== null) {
        if (typeof value[field] !== "string") {
          throw new Error(`Invalid ${field} for token "${token}": must be a string.`);
        }
        entry[field] = value[field];
      }
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * List the tokens that exist in both the current catalog and an imported set.
 * @param {Array<{token:string}>} existing - Current catalog entries.
 * @param {Array<{token:string}>} incoming - Entries from the imported file.
 * @returns {string[]} The conflicting tokens.
 */
export function findConflicts(existing, incoming) {
  const incomingTokens = new Set(incoming.map((e) => e.token));
  return existing.filter((e) => incomingTokens.has(e.token)).map((e) => e.token);
}

/**
 * Merge an imported set into the existing catalog and return the full result.
 * When `replaceConflicts` is true, conflicting tokens take the imported entry;
 * otherwise they keep the existing entry. Non-conflicting imported tokens are
 * always added.
 * @param {Array<{token:string}>} existing - Current catalog entries.
 * @param {Array<{token:string}>} incoming - Entries from the imported file.
 * @param {boolean} replaceConflicts - Whether imported entries replace conflicts.
 * @returns {Array<object>} The merged entry set.
 */
export function mergeEntries(existing, incoming, replaceConflicts) {
  if (replaceConflicts) {
    const incomingTokens = new Set(incoming.map((e) => e.token));
    const kept = existing.filter((e) => !incomingTokens.has(e.token));
    return [...kept, ...incoming];
  }
  const existingTokens = new Set(existing.map((e) => e.token));
  const additions = incoming.filter((e) => !existingTokens.has(e.token));
  return [...existing, ...additions];
}
