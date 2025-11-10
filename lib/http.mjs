import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { docRoot } from "./config.mjs";

export async function getStatic(request, response) {
  const staticFile = join(docRoot, ...request.path.split('/'));
  if (!existsSync(staticFile)) return;
  const ext = request.path.match(/\.(?<ext>[^\.]+)$/)?.groups?.ext;
  const type = MimeTypes[ext] ?? MimeTypes.txt;
  response.writeHead(200, { 'content-type': type }).end(await readFile(staticFile));
  process.stderr.write(`OK: ${request.method} ${request.url}\n`);
  return true;
}

export class HttpError extends Error {
  constructor(message, { status, headers, request: { url, method } = {} } = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
    this.url = url;
    this.method = method;
  }

  static factory(request, andThrow) {
    const factory = (message, options) => new HttpError(message, { request, ...options });
    if (andThrow) {
      (message, options) => {
        throw factory(message, options);
      }
    }
    return factory;
  }
}

export const HttpCode = Object.freeze({
  ok: 200,
  found: 302,
  badRequest: 400,
  notFound: 404,
  internalServerError: 500,
  serviceUnavailable: 503,
});

export function hydrateRequest(request, indexFile = 'index.html') {
  const protocol = request.protocol ?? 'http:';
  const host = request.host ?? request.headers.host ?? `localhost:${PORT}`;
  const serverRoot = new URL(`${protocol}//${host}/`).toString();
  const fullUrl = new URL(request.url, serverRoot);
  Object.assign(request, {
    protocol,
    host,
    serverRoot,
    fullUrl,
    path: fullUrl.pathname.replace(/\/\.+\//g, '/'),
    error: HttpError.factory(request),
  });
  if (request.path.endsWith('/')) {
    request.path = `${request.path}${indexFile}`;
  }
}

export const MimeTypes = {
  ico: 'image/svg+xml',
  html: 'text/html',
  js: 'text/javascript',
  txt: 'text/plain',
  mjs: 'text/javascript',
};
