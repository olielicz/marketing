/**
 * lib/router.js
 * =============
 * Tiny dependency-free HTTP router built on Node's `http` module.
 *
 * Why not Express? This sandbox has no outbound network access, so
 * `npm install express` fails (403 from the npm registry). Rather than
 * hand you code that can't even be installed to test, this uses only
 * Node.js built-ins. It is a genuine drop-in replacement for the handful
 * of routing features this project needs (path params, query string, JSON
 * body parsing). If you have registry access in your real deploy
 * environment, swapping to Express is a mechanical, optional change - this
 * router's handler signature `(req, res, params) => {}` maps directly to
 * an Express `app.METHOD(path, handler)` handler.
 */

const { URL } = require('url');

class Router {
  constructor() {
    this.routes = []; // { method, pattern: RegExp, keys: string[], handler }
  }

  _compile(path) {
    const keys = [];
    const pattern = path
      .replace(/\/:[a-zA-Z0-9_]+/g, (match) => {
        keys.push(match.slice(2));
        return '/([^/]+)';
      });
    return { regex: new RegExp(`^${pattern}$`), keys };
  }

  add(method, path, handler) {
    const { regex, keys } = this._compile(path);
    this.routes.push({ method, regex, keys, handler });
  }

  get(path, handler) { this.add('GET', path, handler); }
  post(path, handler) { this.add('POST', path, handler); }
  put(path, handler) { this.add('PUT', path, handler); }
  delete(path, handler) { this.add('DELETE', path, handler); }

  async handle(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    for (const route of this.routes) {
      if (route.method !== req.method) continue;
      const match = pathname.match(route.regex);
      if (!match) continue;

      const params = {};
      route.keys.forEach((key, i) => { params[key] = decodeURIComponent(match[i + 1]); });
      const query = Object.fromEntries(parsedUrl.searchParams.entries());

      try {
        const body = await readJsonBody(req);
        await route.handler(req, res, { params, query, body });
      } catch (err) {
        sendJson(res, err.status || 500, { error: err.message, ...(err.details || {}) });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found', path: pathname, method: req.method });
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'DELETE') return resolve(null);
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 10 * 1024 * 1024) {
        req.destroy();
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
      }
    });
    req.on('end', () => {
      req.rawBody = raw;
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('Invalid JSON body'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(body);
}

module.exports = { Router, sendJson, readJsonBody };
