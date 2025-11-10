import { createServer, STATUS_CODES } from 'node:http';

import { getConfig, port, ion, ionApi, clientId, callbackUrl } from "./lib/config.mjs";
import { getStatic, HttpCode, hydrateRequest } from "./lib/http.mjs";
import { IonOAuth } from './docs/common/IonOAuth.mjs';
import { IonOAuthClient } from './docs/common/IonOAuthClient.mjs';

const oauth = new IonOAuth({ ion, ionApi, clientId, callbackUrl });

export async function getOAuthRequest(request, response) {
  // Construct the request URL ans redirect the user
  return response.writeHead(HttpCode.found, {
    location: await oauth.getOauthRequestUrl(),
  }).end();
}

export async function getOAuthCallback(request, response) {
  // @see https://cesium.com/learn/ion/ion-oauth2/#step-3-token-exchange
  const ionClient = new IonOAuthClient({ oauth });
  const { access_token } = await ionClient.init(request.url);
  return response.writeHead(HttpCode.found, {
    'set-cookie': `ion_access_token=${encodeURIComponent(access_token)}; path=/; HttpOnly=true`,
    location: `/`,
  }).end();
}

export async function getConfigAndToken(request, response) {
  let access_token = undefined;
  for (const cookie of request.headers.cookie.split(';')) {
    const [key, ...value] = cookie.trim().split('=');
    if (key === 'ion_access_token') {
      access_token = decodeURIComponent(value.join('='));
    }
  }
  const config = {
    ...await getConfig(),
    ...(access_token ? { access_token } : {})
  }
  console.log(config);
  return response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(config));
}

export async function deleteIonAccessToken(request, response) {
  return response.writeHead(HttpCode.found, {
    'set-cookie': `ion_access_token=; path=/; HttpOnly=true; expires=01 Jan 1970 00:00:00 UTC`,
    location: `/`,
  }).end();
}

createServer(async function (request, response) {
  hydrateRequest(request, 'index.server.html');
  try {
    switch (request.path) {
      case '/config': return await getConfigAndToken(request, response);
      case '/oauth/request': return await getOAuthRequest(request, response);
      case '/oauth/callback': return await getOAuthCallback(request, response);
      case '/oauth/sign-out': return await deleteIonAccessToken(request, response);
      default:
        if (await getStatic(request, response, 'withServer.html')) {
          return;
        }
        throw request.error("Not Found", { status: HttpCode.notFound }, true);
    }
  } catch (e) {
    const status = e.status ?? HttpCode.internalServerError;
    const message = e.status ? e.message : `Internal Server Error\n${e.stack}\n`;
    response
      .writeHead(status, e.headers ?? {})
      .end(message);
    process.stderr.write(`${STATUS_CODES[status]}: ${request.method} ${request.url}\n`);
    return;
  }
}).listen(port);
