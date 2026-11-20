/**
 * Cloudflare Workers compatibility patch.
 *
 * iconv-lite's package.json browser map disables its Node streams adapter.
 * Wrangler exposes process.versions.node in Workers, so iconv-lite incorrectly
 * selects that disabled adapter and crashes during bundle validation.
 * Remove only the browser substitutions from the installed dependency copy;
 * keep the Node streams implementation and Cloudflare nodejs_compat runtime.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const candidates = [
  resolve('node_modules/iconv-lite/package.json'),
  resolve('node_modules/body-parser/node_modules/iconv-lite/package.json'),
];

let patched = 0;
for (const file of candidates) {
  try {
    const raw = await readFile(file, 'utf8');
    const pkg = JSON.parse(raw);
    if (pkg.browser && (
      Object.prototype.hasOwnProperty.call(pkg.browser, './lib/streams') ||
      Object.prototype.hasOwnProperty.call(pkg.browser, './lib/extend-node') ||
      Object.prototype.hasOwnProperty.call(pkg.browser, 'stream')
    )) {
      delete pkg.browser;
      await writeFile(file, JSON.stringify(pkg, null, 2) + '\\n');
      patched++;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
if (patched === 0) {
  throw new Error('Expected iconv-lite browser mapping was not found; refusing to deploy an unpatched Worker bundle.');
}
console.log(`Patched ${patched} iconv-lite package metadata copy/copies for Cloudflare Workers.`);
