let atlasPromise;
export function loadTooltipBitmapFont() {
  return atlasPromise ??= Promise.all([
    fetch('/fonts/simsun-16.json').then(response => { if (!response.ok) throw new Error('Bitmap metadata unavailable'); return response.json(); }),
    new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = '/fonts/simsun-16.png'; }),
  ]).then(([meta, image]) => ({meta, image})).catch(error => { atlasPromise = null; throw error; });
}

export function wrapTooltipText(value, limit = 14) {
  return String(value ?? '').split(/\r?\n/).flatMap(paragraph => {
    const chars = Array.from(paragraph);
    if (!chars.length) return [''];
    const lines = [];
    for (let i = 0; i < chars.length; i += limit) lines.push(chars.slice(i, i + limit).join(''));
    return lines;
  });
}

export async function paintTooltipBitmapText(tooltip) {
  const elements = [...tooltip.querySelectorAll('[data-bitmap-text]')];
  let font;
  try { font = await loadTooltipBitmapFont(); } catch { return; } // Readable HTML if asset loading fails.
  for (const element of elements) {
    if (!tooltip.contains(element) || element.querySelector('canvas')) continue; // A different card may now be hovered.
    const text = Array.from(element.childNodes).map(node => node.nodeName === 'BR' ? '\n' : node.textContent).join('');
    const lines = text.split('\n');
    const getGlyph = ch => font.meta.glyphs[ch.codePointAt(0)];
    // Preserve unusual player-given names as readable text, never replace them with boxes.
    if (Array.from(text).some(ch => ch !== '\n' && ch !== ' ' && !getGlyph(ch))) continue;
    const advance = ch => getGlyph(ch)?.[6] ?? (ch === ' ' ? 8 : 16);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, ...lines.map(line => Array.from(line).reduce((sum, ch) => sum + advance(ch), 0)));
    canvas.height = lines.length * font.meta.lineHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    ctx.imageSmoothingEnabled = false;
    lines.forEach((line, row) => {
      let x = 0;
      for (const ch of line) {
        const g = getGlyph(ch);
        if (g && g[2] && g[3]) ctx.drawImage(font.image, g[0], g[1], g[2], g[3], x + g[4], row * font.meta.lineHeight + font.meta.baseline - g[5], g[2], g[3]);
        x += advance(ch);
      }
    });
    ctx.globalCompositeOperation = 'source-in'; ctx.fillStyle = getComputedStyle(element).color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.style.width = `${canvas.width}px`; canvas.style.height = `${canvas.height}px`;
    canvas.className = 'classic-tip-bitmap'; canvas.setAttribute('aria-hidden', 'true');
    const accessible = document.createElement('span');
    accessible.className = 'classic-tip-accessible'; accessible.textContent = text;
    element.replaceChildren(accessible, canvas);
  }
}
