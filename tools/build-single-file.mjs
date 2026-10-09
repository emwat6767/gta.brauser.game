// Собирает игру в ОДИН html-файл (все модули и стили внутри, three.js — с CDN).
// Нужен только для публикации (например, чтобы открыть на телефоне); для разработки
// бандлер не нужен — src/ работает как есть.
//
//   node tools/build-single-file.mjs                 -> dist/open-city.html (полная страница)
//   node tools/build-single-file.mjs out.html --body -> без <html>/<head>/<body>
//                                                      (для хостингов, которые оборачивают страницу сами)
//
// Требуется Node 18+ и доступ к npm (esbuild запускается через npx).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const bodyOnly = args.includes('--body');
const out = args.find((a) => !a.startsWith('--')) ?? path.join(root, 'dist', 'open-city.html');

const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/css/style.css'), 'utf8');
const threeUrl = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports.three;

let js = execFileSync('npx', [
  '--yes', 'esbuild@0.24.0', path.join(root, 'src/js/main.js'),
  '--bundle', '--format=esm', '--external:three', '--minify', '--target=es2020', '--legal-comments=none',
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
js = js.replace(/from\s*["']three["']/g, `from"${threeUrl}"`).replace(/<\/script/gi, '<\\/script');
if (/["']three["']/.test(js)) throw new Error('Остался импорт "three" без адреса CDN');

const title = html.match(/<title>(.*?)<\/title>/)[1];
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace('<script type="module" src="js/main.js"></script>', () => `<script type="module">${js}</script>`);

const page = bodyOnly
  ? `<title>${title}</title>\n<style>\n${css}\n</style>\n${body}`
  : `<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n` +
    `<title>${title}</title>\n<style>\n${css}\n</style>\n</head>\n<body>${body}</body>\n</html>\n`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`Готово: ${out} (${(page.length / 1024).toFixed(0)} КБ)`);
