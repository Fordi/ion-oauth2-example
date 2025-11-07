import { clientId, ion, ionApi } from "./config.mjs";
import { HttpCode } from "./http.mjs";
import { getVerifier, newPkceState } from "./pkce.mjs";

const AppScopes = [
  "archives:read",
  "assets:list",
  "assets:read",
  "assets:source",
  "exports:read",
  "profile:read",
  "tokens:read",
];

export async function getOauthRequest(request, response) {
  // @see https://cesium.com/learn/ion/ion-oauth2/#step-2-code-authorization
  // Generate randoms for the state and verifier, and store them both, using the state as the key
  const [state, code_challenge] = await newPkceState();
  // Construct the request URL ans redirect the user
  return response.writeHead(HttpCode.found, {
    location: new URL(`/oauth?${new URLSearchParams({
      client_id: clientId,
      code_challenge,
      code_challenge_method: "S256",
      redirect_uri: `${request.serverRoot}oauth/callback`,
      response_type: "code",
      scope: AppScopes.join(" "),
      state,
    }).toString()}`, ion).toString()
  }).end();
}

export async function getOauthCallback(request, response) {
  // @see https://cesium.com/learn/ion/ion-oauth2/#step-3-token-exchange
  // Pull the `code` and `state` params off the request
  const code = request.fullUrl.searchParams.get('code');
  const state = request.fullUrl.searchParams.get('state');

  // Retrieve the verifier based on the state
  const code_verifier = getVerifier(state);

  // If it isn't there, it's not a valid state.
  if (!code_verifier) {
    throw request.error("Bad Request: State mismatch", { status: HttpCode.badRequest });
  }

  // Perform the token exchange
  const ionResponse = await fetch(new URL('/oauth/token', ionApi), {
    method: 'post',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      code,
      code_verifier,
      grant_type: 'authorization_code',
      redirect_uri: `${request.serverRoot}oauth/callback`,
    }),
  });

  if (!ionResponse.ok) {
    // The request failed; proxy the failure to the client.
    throw request.error(await ionResponse.text(), ionResponse);
  }

  const { token_type, access_token } = await ionResponse.json();
  if (token_type !== 'bearer') {
    // Ion only ever uses `token_type: "bearer"`, so this means something's weird.
    throw request.error("Upstream error: Unrecognized token_type", { status: HttpCode.serviceUnavailable });
  }
  return response.writeHead(HttpCode.found, {
    'set-cookie': `ion_access_token=${access_token}; path=/`,
    location: `${request.serverRoot}index.html`,
  }).end();
}