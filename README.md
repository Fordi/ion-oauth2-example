# Example OAuth2 for Cesium Ion with zero dependencies

> See https://cesium.com/learn/ion/ion-oauth2/

## Getting this repo working:

- [Create an application in Ion](https://ion.cesium.com/account/developer) with a redirect URI of `http://localhost:8080/oauth/callback`
- Set `CESIUM_CLIENT_ID` in your environment or `{ clientId }` in a new ionConfig.json with the value in the Client ID column
- `npm start`

## Short explanation

[Full explanation](https://cesium.com/learn/ion/ion-oauth2/)

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
    - The `access_token` is given to the client somehow.  In this example, it's via the cookie `cs_access_token`.

1. The `access_token` is used for making requests to `{ionApi}` by passing the header `Authorization: Bearer {access_token}`

> Note: `{ion}` and `{ionApi}` are typically `https://ion.cesium.com` and `https://api.cesium.com` respectively, but this will work
> against staging, development, and local instances of Ion just the same.

This file provides, essentially, three entry points.  It does no proxying.

- A simple example client - `indexHtml` and `clientScript` - which handles minimal user interaction
- `/oauth/request` - handles the code authorization and redirect explained in step 2
- `/oauth/callback` - handles the token exchange explained in step 3, and hands the access_token to the client
