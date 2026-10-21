// Собирает игру в ОДИН html-файл (все модули и стили внутри, three.js — с CDN).
// Нужен только для публикации (например, чтобы открыть на телефоне); для разработки
// бандлер не нужен — src/ работает как есть.
//
//   node tools/build-single-file.mjs                       -> dist/open-city.html (Open City, полная страница)
//   node tools/build-single-file.mjs --page=school.html    -> dist/school.html (Школа № 17: Тревога)
//   node tools/build-single-file.mjs out.html --body       -> без <html>/<head>/<body>
//                                                            (для хостингов, которые оборачивают страницу сами)
//
// Страница берётся из src/<page>: локальные стили (<link href="css/...">) встраиваются,
// внешние (Google Fonts) остаются ссылками, модуль из <script type="module" src> собирается esbuild.
// Требуется Node 18+ и доступ к npm (esbuild запускается через npx).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const bodyOnly = args.includes('--body');
const pageArg = args.find((a) => a.startsWith('--page='));
const pageName = pageArg ? pageArg.slice(7) : 'index.html';
const defaultOut = pageName === 'index.html' ? 'open-city.html' : pageName;
const out = args.find((a) => !a.startsWith('--')) ?? path.join(root, 'dist', defaultOut);

const html = fs.readFileSync(path.join(root, 'src', pageName), 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const threeUrl = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports.three;

// Стили: локальные — внутрь, внешние ссылки (шрифты) — как есть.
let css = '';
const links = [];
for (const m of head.matchAll(/<link\s+([^>]*?)>/g)) {
  const href = m[1].match(/href="([^"]+)"/)?.[1];
  if (!href) continue;
  if (/^https?:/.test(href)) links.push(m[0]);
  else if (/rel="stylesheet"/.test(m[1])) css += fs.readFileSync(path.join(root, 'src', href), 'utf8') + '\n';
}

const scriptTag = html.match(/<script type="module" src="([^"]+)"><\/script>/);
let js = execFileSync('npx', [
  '--yes', 'esbuild@0.24.0', path.join(root, 'src', scriptTag[1]),
  '--bundle', '--format=esm', '--external:three', '--minify', '--target=es2020', '--legal-comments=none',
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
js = js.replace(/from\s*["']three["']/g, `from"${threeUrl}"`).replace(/<\/script/gi, '<\\/script');
if (/["']three["']/.test(js)) throw new Error('Остался импорт "three" без адреса CDN');

const title = html.match(/<title>(.*?)<\/title>/)[1];
const body = html
  .slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(scriptTag[0], () => `<script type="module">${js}</script>`);

const page = bodyOnly
  ? `<title>${title}</title>\n${links.join('\n')}\n<style>\n${css}\n</style>\n${body}`
  : `<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">\n` +
    `<title>${title}</title>\n${links.join('\n')}\n<style>\n${css}\n</style>\n</head>\n<body>${body}</body>\n</html>\n`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`Готово: ${out} (${(page.length / 1024).toFixed(0)} КБ)`);
