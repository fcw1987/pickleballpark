import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ttf': 'font/ttf'
};
const varyResponseMarker = '// playwright-vary-response';

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = resolve(root, `.${pathname}`);

  if (filePath !== root && !filePath.startsWith(`${root}${sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    if (!statSync(filePath).isFile()) throw new Error('Not a file');
    response.setHeader('Content-Type', contentTypes[extname(filePath)] || 'application/octet-stream');
    response.setHeader('Cache-Control', pathname === '/sw.js' ? 'no-cache' : 'no-store');
    if (pathname === '/script.js' && request.headers.cookie?.includes('test-cache-write-failure=1')) {
      response.setHeader('Vary', '*');
      createReadStream(filePath).on('end', () => response.end(`\n${varyResponseMarker}\n`)).pipe(response, { end: false });
      return;
    }
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Pickleboard available at http://${host}:${port}`);
});
