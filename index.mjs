import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { docRoot, getConfig, port } from "./lib/config.mjs";
import { HttpCode, hydrateRequest, MimeTypes } from "./lib/http.mjs";
import { getOauthCallback, getOauthRequest } from './lib/oauth2.mjs';

async function getStatic(request, response) {
  const staticFile = join(docRoot, ...request.path.split('/'));
  if (!existsSync(staticFile)) return;
  const ext = request.path.match(/\.(?<ext>[^\.]+)/)?.groups?.ext;
  const type = MimeTypes[ext] ?? MimeTypes.txt;
  return response.writeHead(200, { 'content-type': type }).end(await readFile(staticFile));
}

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
