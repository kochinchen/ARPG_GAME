/**
 * 可攜版遊戲包（npm run package）：
 * 1. 以 vite.portable.config.ts 建置（相對路徑、單一 JS）
 * 2. 把 JS、CSS、圖示全部內嵌成一個 HTML（file:// 直接開啟即可，不需要伺服器或安裝）
 * 3. 產生 release/ARPG-遊戲包/：遊戲 HTML、Windows / Mac 啟動檔（以 Chrome / Edge 的 App 視窗開啟）、說明
 * 4. 壓縮成 release/ARPG-遊戲包-<版本>.zip（系統有 zip 指令時）
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = `v${pkg.version}`;
const build = join(root, 'release', '.build');
const outDir = join(root, 'release', 'ARPG-遊戲包');
const zipPath = join(root, 'release', `ARPG-遊戲包-${version}.zip`);
const GAME = 'ARPG.html';

console.log('建置中…');
execFileSync('npx', ['vite', 'build', '-c', 'vite.portable.config.ts', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });

// ── 內嵌成單一 HTML ──
const read = (href) => readFileSync(join(build, href.replace(/^\.\//, '')));
const html = inline(readFileSync(join(build, 'index.html'), 'utf8'));
if (/src="\.\/assets|href="\.\/assets/.test(html)) throw new Error('仍有未內嵌的檔案');

/** 把 JS、CSS、圖示內嵌進 HTML（用 slice 拼接：程式內容中的 $ 不會被當成替換樣式） */
function inline(source) {
  let out = source;
  const script = /<script type="module" crossorigin src="([^"]+)"><\/script>/.exec(out);
  if (script) {
    // 內嵌的程式裡不能出現 </script>，否則 HTML 會提早結束
    const js = read(script[1]).toString('utf8').replace(/<\/script/gi, '<\\/script');
    out = out.slice(0, script.index) + `<script type="module">${js}</script>` + out.slice(script.index + script[0].length);
  }
  const style = /<link rel="stylesheet" crossorigin href="([^"]+)">/.exec(out);
  if (style) {
    const css = read(style[1]).toString('utf8');
    out = out.slice(0, style.index) + `<style>${css}</style>` + out.slice(style.index + style[0].length);
  }
  const icon = /<link rel="icon" href="([^"]+)" \/>/.exec(out);
  if (icon && existsSync(join(build, icon[1]))) {
    const data = read(icon[1]).toString('base64');
    out = out.slice(0, icon.index) + `<link rel="icon" href="data:image/x-icon;base64,${data}" />` + out.slice(icon.index + icon[0].length);
  }
  return out;
}

// ── 遊戲包資料夾 ──
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, GAME), html);

// Windows：優先用 Edge / Chrome 的 App 視窗（沒有網址列，像一般遊戲視窗），找不到就用預設瀏覽器。
// 路徑可能有中文與空白：用 PowerShell 轉成正確編碼的 file:/// 網址
writeFileSync(
  join(outDir, '啟動遊戲（Windows）.bat'),
  [
    '@echo off',
    'chcp 65001 >nul',
    'set "GAME=%~dp0ARPG.html"',
    'for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "([System.Uri]$env:GAME).AbsoluteUri"`) do set "URL=%%U"',
    'for %%B in ("%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" "%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe") do (',
    '  if exist %%B if defined URL (',
    '    start "" %%B --app="%URL%" --start-maximized --autoplay-policy=no-user-gesture-required',
    '    exit /b',
    '  )',
    ')',
    'start "" "%GAME%"',
    '',
  ].join('\r\n'),
);

// macOS：「啟動遊戲.app」（雙擊即可，不會開終端機）。內容是一個 shell 腳本：
// 找到旁邊的 ARPG.html，轉成編碼過的 file:// 網址，直接呼叫 Chrome / Edge 的執行檔開 App 視窗（已開著的瀏覽器也會接手）
const app = join(outDir, '啟動遊戲.app', 'Contents');
mkdirSync(join(app, 'MacOS'), { recursive: true });
writeFileSync(
  join(app, 'Info.plist'),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0"><dict>',
    '  <key>CFBundleExecutable</key><string>launch</string>',
    '  <key>CFBundleIdentifier</key><string>local.arpg.launcher</string>',
    '  <key>CFBundleName</key><string>ARPG</string>',
    '  <key>CFBundlePackageType</key><string>APPL</string>',
    `  <key>CFBundleShortVersionString</key><string>${pkg.version}</string>`,
    '  <key>LSUIElement</key><true/>',
    '</dict></plist>',
    '',
  ].join('\n'),
);
const launcher = join(app, 'MacOS', 'launch');
writeFileSync(
  launcher,
  [
    '#!/bin/bash',
    '# 啟動遊戲.app 在遊戲包資料夾中：Contents/MacOS → 往上三層就是資料夾',
    'DIR="$(cd "$(dirname "$0")/../../.." && pwd)"',
    'GAME="$DIR/ARPG.html"',
    '# 路徑中的中文、空白要編碼，瀏覽器才認得',
    'URL="file://$(printf "%s" "$GAME" | /usr/bin/perl -pe \'s/([^A-Za-z0-9\\/._~-])/sprintf("%%%02X", ord($1))/ge\' 2>/dev/null)"',
    'for BIN in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"; do',
    '  if [ -x "$BIN" ] && [ "$URL" != "file://" ]; then',
    '    nohup "$BIN" --app="$URL" --start-maximized --autoplay-policy=no-user-gesture-required >/dev/null 2>&1 &',
    '    exit 0',
    '  fi',
    'done',
    'open "$GAME"',
    '',
  ].join('\n'),
);
chmodSync(launcher, 0o755);

writeFileSync(
  join(outDir, '說明.txt'),
  [
    `ARPG ${version}（可攜版）`,
    '',
    '【開始遊戲】',
    '・Windows：雙擊「啟動遊戲（Windows）.bat」',
    '・Mac：雙擊「啟動遊戲.app」（第一次若出現「無法打開」：按右鍵 →「打開」→ 再按「打開」）',
    '・也可以直接用 Chrome / Edge / Firefox 開啟 ARPG.html',
    '  （建議使用 Chrome 或 Edge；Safari 也能玩，但存檔較容易被系統清除）',
    '',
    '整個資料夾可以複製到隨身碟或其他電腦，不需要安裝、不需要網路。',
    '',
    '【存檔】',
    '・遊戲有 3 個存檔欄位，會自動存檔；選單（Esc）裡也可以「儲存遊戲」。',
    '・存檔存在「這台電腦的這個瀏覽器」裡，不在資料夾中。',
    '  換電腦或換瀏覽器時：在舊的地方用選單的「匯出存檔」存成檔案，',
    '  到新的地方開始遊戲後用「匯入存檔」讀進來。',
    '・清除瀏覽器的網站資料會一併刪除存檔，請定期「匯出存檔」備份。',
    '・標題畫面的「匯入存檔」可以把匯出的存檔檔案放進任一個欄位。',
    '',
    '【操作】',
    '左鍵移動 / 攻擊、右鍵施放連段、Q / W / E 切換連段、Space 喝藥水、',
    'I 背包、C 角色、T 技能、K 怪物圖鑑、O 裝備圖鑑、Tab 地圖、Esc 選單。',
    '選單裡的「操作說明」有完整列表。',
    '',
  ].join('\r\n'),
);

// ── 壓縮 ──
rmSync(zipPath, { force: true });
try {
  execFileSync('zip', ['-qr', zipPath, 'ARPG-遊戲包'], { cwd: join(root, 'release') });
  console.log(`完成：${zipPath}`);
} catch {
  console.log(`完成：${outDir}（系統沒有 zip 指令，請自行壓縮資料夾）`);
}
rmSync(build, { recursive: true, force: true });
