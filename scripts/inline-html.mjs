import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** 把 JS、CSS、圖示內嵌進 HTML（用 slice 拼接：程式內容中的 $ 不會被當成替換樣式）；buildDir = vite 的輸出資料夾 */
export function inlineHtml(source, buildDir) {
  const read = (href) => readFileSync(join(buildDir, href.replace(/^\.\//, '')));
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
  if (icon && existsSync(join(buildDir, icon[1]))) {
    const data = read(icon[1]).toString('base64');
    out = out.slice(0, icon.index) + `<link rel="icon" href="data:image/x-icon;base64,${data}" />` + out.slice(icon.index + icon[0].length);
  }
  return out;
}
