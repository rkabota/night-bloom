// Zero-dependency static server for local testing: `npm start`, then open http://localhost:8080
// WebXR needs a secure origin: localhost counts. For a Quest on the same Wi-Fi, use
// `adb reverse tcp:8080 tcp:8080` and open http://localhost:8080 in the Quest Browser,
// or deploy to an https host (GitHub Pages).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 8080;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^([/\\])+/, '');
  const full = resolve(join(root, clean || 'index.html'));
  if (full !== root && !full.startsWith(root + sep)) return null; // no escaping the project folder
  return full;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  createServer(async (req, res) => {
    let file = resolvePath(req.url);
    if (file === root) file = join(root, 'index.html');
    if (!file) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  }).listen(port, () => console.log(`Night Bloom on http://localhost:${port}`));
}
