import { IonOAuth } from "./IonOAuth.mjs";

export class IonOAuthClient {
  constructor({
    ion = 'https://ion.cesium.com/',
    ionApi = 'https://api.cesium.com/',
    callbackUrl,
    clientId,
    scopes,
    access_token,
    oauth,
  }) {
    this.ionApi = ionApi;
    this.access_token = access_token;
    if (oauth) {
      this.oauth = oauth;
    } else if (callbackUrl && clientId) {
      this.oauth = new IonOAuth({ ion, ionApi, callbackUrl, clientId, scopes });
    }
  }

  async init(location = globalThis.location) {
    const params = new URL(location, 'http://x/').searchParams;
    const code = params.get('code');
    const state = params.get('state');
    let access_token = globalThis.localStorage?.getItem?.("ion_access_token") ?? this.access_token;
    if (code && state) {
      try {
        const response = await this.oauth.tokenExchange(code, state, location.toString());
        console.log(response);
        access_token = response.access_token;
        if (access_token) {
          globalThis.localStorage?.setItem?.('ion_access_token', access_token);
        }
      } catch (e) {
        console.warn(e);
      }
      // Clear out search terms without refreshing.
      if (globalThis.history) {
        history.replaceState({}, null, new URL(location.pathname, location));
      }
    }
    if (access_token) {
      this.access_token = access_token;
    }
    console.log(this);
    return this;
  }

  get loggedIn() {
    return !!this.access_token;
  }

  async signIn() {
    const target = await this.oauth.getOauthRequestUrl();
    if (globalThis.location) {
      globalThis.location = target;
    }
    return target;
  }

  async signOut() {
    delete this.access_token;
    globalThis?.localStorage?.removeItem?.('ion_access_token');
    if (globalThis.location) {
      globalThis.location.reload();
    }
  }

  async fetch(uri, init) {
    if (!this.loggedIn) {
      throw new Error("Not logged in");
    }
    const url = new URL(uri, this.ionApi);
    const request = new Request(url, {
      ...init,
      headers: {
        ...init?.headers,
        authorization: `Bearer ${this.access_token}`
      },
    });
    const response = await fetch(request);
    if (!response.ok) {
      let content = await response.text();
      let extras = {
        name: `HttpError ${response.status}${response.statusText ? ` (${response.statusText})` : ''}`,
        status: response.status,
        statusText: response.statusText,
        url,
        method: request.method
      };
      try {
        const payload = JSON.parse(content);
        if (payload?.message) {
          const { message, ...rest } = payload;
          extras = { ...rest, ...extras };
          content = message;
        }
      } catch { /***/ }
      const err = new Error(content);
      throw Object.assign(err, extras);
    }
    if (response.status === 204) {
      return undefined;
    }
    return await response.json();
  }
}