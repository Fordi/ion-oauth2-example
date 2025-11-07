import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

const AppScopes = [
  "assets:list",
  "assets:read",
  "assets:source",
  "tokens:read",
  "tokens:list",
  "archives:read",
  "exports:read",
  "profile:read",
];

const HttpCode = {
  ok: 200,
  found: 302,
  badRequest: 400,
  notFound: 404,
  internalServerError: 500,
  serviceUnavailable: 503,
};

const Types = {
  ico: 'image/svg+xml',
  html: 'text/html',
  js: 'text/javascript',
};

// @see https://cesium.com/learn/ion/ion-oauth2/#step-1-register-your-application
// Create an application with Redirect URI "http://localhost:8080/oauth/callback"
let config = {};
try {
  config = JSON.parse(await readFile("./ionConfig.json"));
} catch { /***/ }

const {
  clientId = process.env.CESIUM_CLIENT_ID,
  ion = process.env.CESIUM_ION_URL ?? "https://ion.cesium.com",
  ionApi = process.env.CESIUM_ION_API ?? "https://api.cesium.com",
} = config;

const PORT = process.env.PORT ?? 8080;

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

class HttpError extends Error {
  constructor(message, { status, headers, request: { url, method } = {} } = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
    this.url = url;
    this.method = method;
  }
  static factory(request) {
    return (message, options) => new HttpError(message, { request, ...options });
  }
}

/**
 * Dead-simple in-memory store for OAuth state/code_verifier pairs with 1 minute expiration
 * Not for production use.
 */
const MAX_AGE = 60000;
const states = new Map();
function tidyStates() {
  const now = Date.now();
  // Clean up entries in the store older than MAX_AGE
  for (const oldState of states.keys())
    if (now - (states.get(oldState)?.[1] ?? 0) > MAX_AGE)
      states.delete(oldState);
  return states;
}

function getVerifier(state) {
  const record = tidyStates().get(state);
  states.delete(state);
  return record?.[0];
};

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

async function sha256(input) {
  const result = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  return result.toBase64({ alphabet: 'base64url', omitPadding: true });
}

async function newPkceState() {
  const state = crypto.randomUUID();
  const verifier = crypto.randomUUID();
  tidyStates().set(state, [verifier, Date.now()]);
  return [
    state,
    // Calculate and return the challenge
    await sha256(verifier),
  ];
}

// Path for static files
const docRoot = join(dirname(fileURLToPath(import.meta.url)), 'docs');

// Allows for editing in devtools, and prevents an annoying 404
// read more here: https://developer.chrome.com/docs/devtools/workspaces
const osRoot = existsSync('/mnt/c') ? execSync(`wslpath -aw "${docRoot}"`).toString().trim() : docRoot;
await mkdir(join(docRoot, '.well-known', 'appspecific'), { recursive: true });
await writeFile(join(docRoot, '.well-known', 'appspecific', 'com.chrome.devtools.json'), JSON.stringify({
  workspace: {
    uuid: 'a4347fb1-d650-4da8-858c-2fac90b75e84',
    root: osRoot,
  }
}), 'utf-8');

createServer(async function (request, response) {
  const protocol = request.protocol ?? 'http:';
  const host = request.host ?? request.headers.host ?? `localhost:${PORT}`;
  const serverRoot = new URL(`${protocol}//${host}/`).toString();
  const url = new URL(request.url, serverRoot);
  let path = url.pathname.replace(/\/\.+\//g, '/');
  const httpError = HttpError.factory(request);
  if (path === '/') {
    path = '/index.html';
  }
  try {
    switch (path) {
      case '/oauth/request': {
        // @see https://cesium.com/learn/ion/ion-oauth2/#step-2-code-authorization
        // Generate randoms for the state and verifier, and store them both, using the state as the key
        const [state, code_challenge] = await newPkceState();

        // Construct the request URL ans redirect the user
        return response.writeHead(HttpCode.found, {
          location: new URL(`/oauth?${new URLSearchParams({
            response_type: "code",
            client_id: clientId,
            redirect_uri: `${serverRoot}oauth/callback`,
            scope: AppScopes.join(" "),
            code_challenge_method: "S256",
            code_challenge,
            state,
          }).toString()}`, ion).toString()
        }).end();
      }

      case '/oauth/callback': {
        // @see https://cesium.com/learn/ion/ion-oauth2/#step-3-token-exchange
        // Pull the `code` and `state` params off the request
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');

        // Retrieve the verifier based on the state
        const code_verifier = getVerifier(state);

        // If it isn't there, it's not a valid state.
        if (!code_verifier) {
          throw httpError("Bad Request: State mismatch", { status: HttpCode.badRequest });
        }

        // Perform the token exchange
        const ionResponse = await fetch(new URL('/oauth/token', ionApi), {
          method: 'post',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            redirect_uri: `${serverRoot}oauth/callback`,
            code_verifier,
          }),
        });

        if (!ionResponse.ok) {
          // The request failed; proxy the failure to the client.
          throw httpError(await ionResponse.text(), ionResponse);
        }

        const { token_type, access_token } = await ionResponse.json();
        if (token_type !== 'bearer') {
          // Ion only ever uses `token_type: "bearer"`, so this means something's weird.
          throw httpError("Upstream error: Unrecognized token_type", { status: HttpCode.serviceUnavailable });
        }
        return response.writeHead(HttpCode.found, {
          'set-cookie': `cs_access_token=${access_token}; path=/`,
          location: `${serverRoot}index.html`,
        }).end();
      }

      case '/config': {
        return response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
          ionApi,
        }));
      }

      default: {
        // Read a document from ./docs
        const staticFile = join(docRoot, ...path.split('/'));
        if (existsSync(staticFile)) {
          const ext = path.match(/\.(?<ext>[^\.]+)/)?.groups?.ext;
          const type = Types[ext] ?? 'text/plain';
          return response.writeHead(200, { 'content-type': type }).end(await readFile(staticFile));
        }
        throw httpError("Not Found", { status: HttpCode.notFound });
      }
    }
  } catch (e) {
    console.warn(e);
    response
      .writeHead(e.status ?? HttpCode.internalServerError, e.headers ?? {})
      .end(e.status ? e.message : `Internal Server Error\n${e.stack}`);
    return;
  }
}).listen(PORT);
