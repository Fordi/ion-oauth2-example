import { getVerifier, newPkceState } from "./pkce.mjs";

export const DEFAULT_APP_SCOPES = [
  "assets:list",
  "assets:read",
  "geocode",
];

export class IonOAuth {
  constructor({
    ion = 'https://ion.cesium.com/',
    ionApi = 'https://api.cesium.com/',
    callbackUrl,
    clientId,
    scopes = DEFAULT_APP_SCOPES,
  } = {}) {
    if (!clientId || !callbackUrl) {
      throw new Error("A clientId and callbackUrl must be specified");
    }
    this.config = { ion, ionApi, clientId, callbackUrl, scopes };
  }

  async getOauthRequestUrl(metadata = {}) {
    const crypto = globalThis.crypto ?? (await import('crypto'))?.webcrypto;
    // @see https://cesium.com/learn/ion/ion-oauth2/#step-2-code-authorization
    // Generate randoms for the state and verifier, and store them both, using the state as the key
    const [state, code_challenge] = await newPkceState(metadata);
    // Construct the request URL ans redirect the user
    return new URL(`/oauth?${new URLSearchParams({
      client_id: this.config.clientId,
      code_challenge,
      code_challenge_method: "S256",
      redirect_uri: this.config.callbackUrl,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      state,
    }).toString()}`, this.config.ion).toString();
  }

  async tokenExchange(code, state) {
    // @see https://cesium.com/learn/ion/ion-oauth2/#step-3-token-exchange
    // Retrieve the verifier based on the state
    const { verifier, metadata } = await getVerifier(state);

    // If it isn't there, it's not a valid state.
    if (!verifier) {
      throw new Error("State mismatch");
    }

    // Perform the token exchange
    const ionResponse = await fetch(
      new URL('/oauth/token', this.config.ionApi),
      {
        method: 'post',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: this.config.clientId,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: this.config.callbackUrl,
        }),
      },
    );
    if (!ionResponse.ok) {
      // The request failed; proxy the failure to the client.
      throw new Error(await ionResponse.text());
    }

    const { token_type, access_token } = await ionResponse.json();
    if (token_type !== 'bearer') {
      // Ion only ever uses `token_type: "bearer"`, so this means something's weird.
      throw new Error(`Unrecognized token_type: ${token_type}`);
    }
    return { access_token, token_type, metadata };
  }

}
