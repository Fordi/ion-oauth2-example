import { createServer } from 'node:http';

import { getConfig, port } from "./lib/config.mjs";
import { getStatic, HttpCode, hydrateRequest } from "./lib/http.mjs";
import { getOauthCallback, getOauthRequest } from './lib/oauth2.mjs';

createServer(async function (request, response) {
  hydrateRequest(request);
  try {
    switch (request.path) {
      case '/config': return await getConfig(request, response);
      case '/oauth/request': return await getOauthRequest(request, response);
      case '/oauth/callback': return await getOauthCallback(request, response);
      default: return (
        await getStatic(request, response)
        ?? request.error("Not Found", { status: HttpCode.notFound }, true)
      );
    }
  } catch (e) {
    console.warn(e);
    response
      .writeHead(e.status ?? HttpCode.internalServerError, e.headers ?? {})
      .end(e.status ? e.message : `Internal Server Error\n${e.stack}`);
    return;
  }
}).listen(port);
