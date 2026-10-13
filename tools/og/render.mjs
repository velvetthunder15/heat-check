// Renders the link-preview image (public/og-vN.png, 1200x630) from tools/og/og.html with the
// original public/logo-wordmark.webp. 2x render -> Lanczos downscale -> libimagequant palette -> optipng.
// LD_LIBRARY_PATH=/workspace/work/heatcheck/pw/libs/x/usr/lib/aarch64-linux-gnu node tools/og/render.mjs
// then: python3 -c "from PIL import Image;import imagequant;im=Image.open('/tmp/og@2x.png').convert('RGBA').resize((1200,630),Image.LANCZOS);imagequant.quantize_pil_image(im,dithering_level=1.0,max_quality=95,min_quality=70).save('public/og-vN.png',optimize=True)" && optipng -o5 public/og-vN.png
// Always save under a NEW name (og-v3.png...) and repoint the meta tags: WhatsApp/Telegram cache per URL.
import { chromium } from '/workspace/work/heatcheck/pw/node_modules/playwright/index.mjs';
const here = new URL('.', import.meta.url).pathname;
const b = await chromium.launch({ executablePath: '/workspace/work/heatcheck/pw/browsers/chromium_headless_shell-1148/chrome-linux/headless_shell', args: ['--allow-file-access-from-files'] });
const pg = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
await pg.goto('file://' + here + 'og.html'); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(400);
await pg.screenshot({ path: '/tmp/og@2x.png', clip: { x: 0, y: 0, width: 1200, height: 630 } }); await b.close();
