/**
 * Compute the SHA-256 hash of a string as a base64url encoded string
 * Works in node 15 and above, and in browsers
 * @param {string} input
 * @returns {string} base64url hash of `input`
 */
export async function sha256(input) {
  const crypto = globalThis.crypto ?? (await import('node:crypto'))?.webcrypto;
  if (!crypto) {
    throw new Error("WebCrypto not available");
  }
  const result = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  return result.toBase64({ alphabet: 'base64url', omitPadding: true });
}

Uint8Array.prototype.toBase64 ??= function toBase64(options) {
  let result = Buffer.from(this).toString('base64');
  if (options?.alphabet === 'base64url') {
    result = result.replace(/\+/g, "-").replace(/\//g, "_");
  }
  if (options?.omitPadding) {
    result = result.replace(/=/g, "");
  }
  return result;
};
