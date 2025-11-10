import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Path for static files
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const docRoot = join(projectRoot, 'docs');

// @see https://cesium.com/learn/ion/ion-oauth2/#step-1-register-your-application
// Create an application with Redirect URI "http://localhost:8080/oauth/callback"
let config = {};
try {
  config = JSON.parse(await readFile(join(projectRoot, "ionConfig.json")));
} catch { /***/ }

const {
  clientId = process.env.CESIUM_CLIENT_ID,
  callbackUrl = process.env.CESIUM_ION_CALLBACK,
  ion = process.env.CESIUM_ION_URL ?? "https://ion.cesium.com",
  ionApi = process.env.CESIUM_ION_API ?? "https://api.cesium.com",
} = config;
const port = process.env.PORT ?? 8080;

// Cannot continue without at least a clientId
if (!clientId) {
  throw new Error(
    `Please create an \`ionConfig.json\` with at least a \`clientId\` field, or set $CESIUM_CLIENT_ID.  See \`ionConfig.example.json\`.`,
  );
}

// enable fetch when using ad-hoc certificates
if (ionApi !== 'https://api.cesium.com') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

export { clientId, callbackUrl, docRoot, ion, ionApi, port };

export async function getConfig(request, response) {
  return {
    ionApi,
  };
}
