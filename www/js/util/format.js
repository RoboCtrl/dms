/**
 * Zero-pad a number to a minimum width.
 * @param {number} n - The value to pad.
 * @param {number} [width=2] - Minimum number of digits.
 * @returns {string} The zero-padded string.
 */
function pad(n, width = 2) {
  return String(n).padStart(width, "0");
}

/**
 * Format an epoch-millisecond timestamp as a local-time
 * "YYYY-MM-DD hh:mm:ss" string for display in the history list.
 * @param {number} epochMs - Timestamp in milliseconds since the epoch.
 * @returns {string} The formatted local timestamp.
 */
export function formatTimestamp(epochMs) {
  const d = new Date(epochMs);
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date} ${time}`;
}

/**
 * Format a byte count for the database-size readout, using kB below 1 MB and
 * MB at or above 1 MB, rounded to one decimal place.
 * @param {number} bytes - Number of bytes.
 * @returns {string} A human-readable size string, e.g. "12.3 kB" or "1.4 MB".
 */
export function formatBytes(bytes) {
  const KB = 1000;
  const MB = 1000 * 1000;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes === 0) return "0 kB";
  return `${(bytes / KB).toFixed(1)} kB`;
}
