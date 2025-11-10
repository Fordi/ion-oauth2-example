# Example OAuth2 for Cesium Ion with zero dependencies

> See [Connecting to Cesium ion with OAuth2](https://cesium.com/learn/ion/ion-oauth2/) for the full explanation.

## Getting this repo working

### Serverless version

- [Create an application in Ion](https://ion.cesium.com/account/developer) with a redirect URI of `http://localhost:8080/`
- Populate `./docs/ionConfig.json` with:

```json
  {
    "clientId": {ion client id},
    "callbackUrl": "http://localhost:8080/"
  }
```

- `npm start:serverless`

#### Short explanation (serverless)

1. The user initiates OAuth2 by interacting with the client
1. The user's browser:
    - generates and stores a `state` and `code_verifier`
    - calculates a `code_challenge` as the SHA-256 of `code_verifier`
    - redirects the user to `{ion}/oauth`, with a `code_challenge` (hashed validator), `state` (request identifier), and
    `scope` (list of scopes) in the query, among other things

1. The user approves the sign-in on Ion, and is redirected to `/oauth/callback`, for token exchange:

    - retrieves the `code_verifier` from its own storage using the `state` from the query
    - POSTs to `{ionApi}/oauth/token`, body has `client_id`, `code` (from the query), `redirect_uri`, and `code_verifier`, etc,
    retrieving an `access_token`
    - The `access_token` is given to the client somehow.  In this example, it's via the local storage item, `ion_access_token`.

1. The `access_token` is used for making requests to `{ionApi}` by passing the header `Authorization: Bearer {access_token}`

> Note: `{ion}` and `{ionApi}` are typically `https://ion.cesium.com` and `https://api.cesium.com` respectively, but changing these values will work
> against staging, development, and local instances of Ion just the same.

### Server-backed version

- [Create an application in Ion](https://ion.cesium.com/account/developer) with a redirect URI of `http://localhost:8080/oauth/callback`
- Populate `./ionConfig.json` with:

```json
  {
    "clientId": {ion client id},
    "callbackUrl": "http://localhost:8080/oauth/callback"
  }
```

- `npm run start:server-backed`

#### Short explanation (server-backed)

1. The user initiates OAuth2 by interacting with the client
1. The user's browser is directed to `/oauth/request`, which:

    - generates and stores a `state` and `code_verifier`
    - calculates a `code_challenge` as the SHA-256 of `code_verifier`
    - redirects the user to `{ion}/oauth`, with a `code_challenge` (hashed validator), `state` (request identifier), and
    `scope` (list of scopes) in the query, among other things

1. The user approves the sign-in on Ion, and is redirected to `/oauth/callback`, for token exchange:

    - retrieves the `code_verifier` from its own storage using the `state` from the query
    - POSTs to `{ionApi}/oauth/token`, body has `client_id`, `code` (from the query), `redirect_uri`, and `code_verifier`, etc,
    retrieving an `access_token`
    - The `access_token` is given to the client somehow.  In this example, it's via the `/config` endpoint.

1. The `access_token` is used for making requests to `{ionApi}` by passing the header `Authorization: Bearer {access_token}`

> Note: `{ion}` and `{ionApi}` are typically `https://ion.cesium.com` and `https://api.cesium.com` respectively, but this will work
> against staging, development, and local instances of Ion just the same.

`index.mjs` provides, essentially, five entry points.  It does no proxying.

- `/oauth/request` - handles the code authorization and redirect explained in step 2
- `/oauth/callback` - handles the token exchange explained in step 3, and hands the access_token to the client
- `/config` - serves up the microserver's current configuration - presently, just the value of `{ionApi}` and the `HttpOnly` cookie, `ion_access_token`.
- `/oauth/signout` - Deletes the `ion_access_token` cookie.
- A default handler for static files and 404's

## IonOAuthClient

`docs/common/IonOAuthClient.mjs` provides a simple API for server-backed and less clients to use:

- `new IonOAuthClient({ ion?, ionApi?, callbackUrl, clientId, scopes })`

  - `ion?: string` - the user-facing endpoint for an Ion instance.  Default: `"https://ion.cesium.com"`
  - `ionApi?: string` - the API endpoint for an Ion instance, Default: `"https://api.cesium.com/"`
  - `callbackUrl: string` - where Ion should redirect the user when they've approved.  Must match the  [OAuth Applications](https://ion.cesium.com/account/developer) row on your account exactly.
  - `clientId: number` - The ID for the OAuth Application.  Must match the [OAuth Applications](https://ion.cesium.com/account/developer) row on your account exactly.
  - `scopes: string[]` - List of scopes the token should have access to (see [Scopes](#scopes) below)

- `new IonOAuthClient({ access_token })`

  - `ionApi: string` - the API endpoint for an Ion instance, Default: `"https://api.cesium.com"`
  - `access_token: string` - the access_token to use for authorization against Ion

- `IonOAuthClient#init(location?)`

  - `location?: string | Location` - location to check for `code` and `state`
  - Checks the passed location for a `code` and `state` and, if present, attempts token exchange
  - Retrieves the access_token from storage, if present

- `IonOAuthClient#loggedIn` - if true, the instance is logged in, and an `access_token` is available on the instance.
- `IonOAuthClient#signIn()` - Redirects the user to the Ion OAuth page.  Returns the URL if `location` is not available (in Node).
- `IonOAuthClient#signOut()` - Deletes the access_token and refreshes.  Only clears its `access_token` if `location` is not available.
- `IonOAuthClient#fetch(urlOrInit, init?)` - Make an Ion API request; similar to `global#fetch`, but prepopulates the `Authorization` header and assumes the response is JSON.

## Scopes

- `geocode` - Make geocode requests
- `archives:read` - List and download the user's asset archives
- `archives:write` - Create and delete the user's asset archives
- `assets:list` - List the metadata for all of the user's assets
- `assets:read` - Read metadata and access the tiled data for the user's assets
- `assets:source` -  the uploaded source data for the user's assets
- `assets:write` - Create, modify, and delete the user's assets
- `exports:read` - List the user's asset exports
- `exports:write` - Export the user's assets
- `profile:read` - Read the user's  username, email address, avatar, and storage quota
- `tokens:read` - List the user's tokens and see their scopes and assets
- `tokens:write` - Create and delete the user's tokens, modify what a token can access
