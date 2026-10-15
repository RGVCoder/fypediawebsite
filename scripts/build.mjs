import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
for (const name of ['index.html', 'app.js', 'styles.css', 'config.js', 'assets/fypedia-logo.png']) {
  if (!fs.existsSync(path.join(dist, name))) throw new Error(`Missing static asset: ${name}`);
}

const fileEnv = {};
for (const filename of ['.env', '.env.local']) {
  const envPath = path.join(root, filename);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match) fileEnv[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

const rawURL = process.env.FYPEDIA_INSFORGE_URL ?? fileEnv.FYPEDIA_INSFORGE_URL ?? process.env.INSFORGE_URL ?? fileEnv.INSFORGE_URL;
const url = rawURL && !/^https?:\/\//i.test(rawURL) ? `https://${rawURL}` : rawURL;
const anonKey = process.env.FYPEDIA_INSFORGE_ANON_KEY ?? fileEnv.FYPEDIA_INSFORGE_ANON_KEY ?? process.env.INSFORGE_ANON_KEY ?? fileEnv.INSFORGE_ANON_KEY;
if (url || anonKey) {
  if (!url || !anonKey || !/^https:\/\/[a-z0-9.-]+$/i.test(url)) throw new Error('Set a valid FYPEDIA_INSFORGE_URL and FYPEDIA_INSFORGE_ANON_KEY together.');
  const redirect = process.env.FYPEDIA_OAUTH_REDIRECT_TO ?? fileEnv.FYPEDIA_OAUTH_REDIRECT_TO ?? '';
  if (redirect && !/^https:\/\//.test(redirect) && !/^http:\/\/localhost(?::\d+)?\//.test(redirect)) throw new Error('FYPEDIA_OAUTH_REDIRECT_TO must be HTTPS or localhost.');
  const config = { insforgeUrl: url, insforgeAnonKey: anonKey, oauthRedirectTo: redirect, useMockData: false };
  fs.writeFileSync(path.join(dist, 'config.js'), `window.FYPEDIA_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
}

console.log('Static build ready in dist/.');
