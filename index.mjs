import { createServer, STATUS_CODES } from 'node:http';
import { readFile } from 'node:fs/promises';

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

// This is the script to be run on the client.  We'll toString it and strip off the `function () { ... }` wrapper.
const clientScript = function (window, document) {
  const elements = {};
  [...document.querySelectorAll("*[id]")].forEach((e) => elements[e.id] = e);
  const cookies = document.cookie.split(";").reduce((o, c) => {
    const [key, ...value] = c.split("=");
    o[key.trim()] = decodeURIComponent(value.join("="));
    return o;
  }, {});
  const fetchIon = cookies.cs_access_token ? (uri, init) => fetch(new URL(uri, ionApi), {
    ...init,
    headers: {
      ...init?.headers,
      authorization: `Bearer ${cookies.cs_access_token}`
    },
  }).then(r => r.json())
    : () => { throw new Error("Not logged in"); }

  if (cookies.cs_access_token) {
    elements.signin.setAttribute('disabled', 'disabled');
  } else {
    elements.signout.setAttribute('disabled', 'disabled');
    elements.fetchAssets.setAttribute('disabled', 'disabled');
  }

  elements.signin.addEventListener("click", async () => {
    window.location = "http://localhost:8080/oauth/request";
  });

  elements.signout.addEventListener("click", async () => {
    document.cookie = `cs_access_token=; path=/; expires=01 Jan 1970 00:00:00 UTC`;
    window.location.reload();
  });

  elements.fetchAssets.addEventListener('click', async () => {
    const assets = await fetchIon('/v1/assets?limit=50&page=1&sortBy=DATE_ADDED&sortOrder=DESC');
    elements.assets.innerHTML = JSON.stringify(assets, null, 2);
  });
}.toString()
  .replace(/^function\s+\([^)]+\)\s*\{|\}\s*$/g, '');

// Document to be served to the client
const indexHtml = `
<!doctype html>
<html>
  <head><title>Cesium Ion OAuth2 Example</title></head>
  <body>
    <h1>Cesium Ion OAuth2 Example</h1>
    <div>
      <button id="signin">Sign in</button> | 
      <button id="signout">Sign out</button> | 
      <button id="fetchAssets">Fetch assets</button>
    </div>
    <pre id="assets"></pre>
    <script>
      <!-- the internal script doesn't have access to server globals, so we'll provide the one we need -->
      const ionApi = "${ionApi}";
      ${clientScript}
    </script>
  </body>
</html>
`;

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" stroke="none">
  <circle cx="50" cy="50" r="50" fill="#fff"/>
  <path fill="#6dabe4" d="M50 6C19 6 1 36 8 61q2 2 6-1l14-18q9-10 18 0l14 18c1 1 4 4 8 0l13-18q7-6 11-5C86 19 69 6 50 6m19 23c0 6-9 6-9 0s9-6 9 0"/>
  <path fill="#709c49" d="M93 45q-1-3-7 1L72 64c-4 6-13 6-17 0L41 46q-4-4-8 0L19 64q-3 5-9 5a44 44 0 0 0 83-24"/>
</svg>`;

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

async function newState() {
  let state, verifier;
  tidyStates().set(state = crypto.randomUUID(), [verifier = crypto.randomUUID(), Date.now()]);
  return [
    state,
    // Calculate the challenge
    Buffer.from(new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
    ))
      .toString('base64')
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
  ];
}

createServer(async function (request, response) {
  const protocol = request.protocol ?? 'http:';
  const host = request.host ?? request.headers.host ?? `localhost:${PORT}`;
  const serverRoot = new URL(`${protocol}//${host}/`).toString();
  const url = new URL(request.url, serverRoot);
  const path = url.pathname;
  const httpError = HttpError.factory(request);
  try {
    switch (path) {
      case '/':
      case '/index.html':
        return response.writeHead(HttpCode.ok, { 'Content-Type': 'text/html' }).end(indexHtml);

      case '/oauth/request': {
        // @see https://cesium.com/learn/ion/ion-oauth2/#step-2-code-authorization
        // Generate randoms for the state and verifier, and store them both, using the state as the key
        const [state, code_challenge] = await newState();

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
      case '/.well-known/appspecific/com.chrome.devtools.json':
        return response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
      case '/favicon.ico':
        return response.writeHead(200, { 'content-type': 'image/svg+xml' }).end(favicon);
      default: {
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
