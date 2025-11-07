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

export async function sha256(input) {
  const result = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  return result.toBase64({ alphabet: 'base64url', omitPadding: true });
}