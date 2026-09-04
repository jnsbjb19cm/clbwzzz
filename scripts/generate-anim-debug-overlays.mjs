import fs from 'fs';
import path from 'path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const ROOT = path.resolve(path.dirname(''));
const ANIM_DIR = path.join(ROOT, 'assets', 'sprites', 'unit_anim');
const OUT = path.join(ROOT, 'scripts', '_debug_overlays');
fs.mkdirSync(OUT, { recursive: true });

const FULL_FRAME_ATTACK_RES = new Set([20,22,34,36,38,41,43,48,54,62,64,72,75,77,92,101,118]);
const GROUND_UNIFORM_STATES = new Set(['default', 'moving']);
const PER_FRAME_DRAW_STATES = new Set(['flying','toGround','jump']);

function padBounds(bounds, pad, frameW, frameH) {
  if (!bounds) return null;
  return {
    left: Math.max(0, bounds.left - pad),
    top: Math.max(0, bounds.top - pad),
    right: Math.min((frameW ?? 999) - 1, bounds.right + pad),
    bottom: Math.min((frameH ?? 999) - 1, bounds.bottom + pad),
  };
}

function attackUnion(frames, frameW, frameH) {
  let left = Infinity, top = Infinity, right = -1, bottom = -1;
  for (const fr of frames) {
    const b = fr.bounds;
    if (!b) continue;
    left = Math.min(left, b.left);
    top = Math.min(top, b.top);
    right = Math.max(right, b.right);
    bottom = Math.max(bottom, b.bottom);
  }
  if (!Number.isFinite(left)) return null;
  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
    right: Math.min(frameW - 1, right),
    bottom: Math.min(frameH - 1, bottom),
  };
}

async function processPack(file) {
  const p = path.join(ANIM_DIR, file);
  const json = JSON.parse(fs.readFileSync(p, 'utf8'));
  const res = String(json.res ?? file.replace('.json',''));
  const pngPath = path.join(ANIM_DIR, `${res}.png`);
  if (!fs.existsSync(pngPath)) return;
  const sheet = await loadImage(pngPath);
  const frameW = json.frameW;
  const frameH = json.frameH;

  const animKeys = Object.keys(json.animations ?? {});
  const targets = animKeys.filter(k => k === 'default' || k === 'attacking' || /^attacking_/.test(k) );
  if (!targets.length) targets.push('default');

  for (const key of targets) {
    const anim = json.animations[key];
    if (!anim?.frames?.length) continue;
    const frames = anim.frames;
    const samples = [0, Math.floor(frames.length/2), frames.length-1].filter((v,i,arr)=>arr.indexOf(v)===i);
    // compute attack union if attack-like
    const isAttack = key === 'attacking' || /^attacking_/.test(key);
    const attackUnionBounds = isAttack && json.uniformBounds ? attackUnion(frames, frameW, frameH) : null;

    for (const fi of samples) {
      const fr = frames[fi];
      // determine fullFrame
      const fullFrame = (json.flying) || (isAttack && FULL_FRAME_ATTACK_RES.has(Number(res)));
      let drawBounds;
      if (fullFrame && fr) {
        drawBounds = { left:0, top:0, right: fr.w - 1, bottom: fr.h - 1 };
      } else if (isAttack && json.uniformBounds) {
        drawBounds = attackUnionBounds ?? json.uniformBounds;
      } else {
        const usePerFrame = json.usePerFrameBounds || !GROUND_UNIFORM_STATES.has(key) || (json.flying && PER_FRAME_DRAW_STATES.has(key));
        if (usePerFrame) {
          const raw = fr?.bounds ?? json.uniformBounds ?? null;
          const pad = PER_FRAME_DRAW_STATES.has(key) ? 22 : 8;
          drawBounds = padBounds(raw, pad, frameW, frameH) ?? raw;
        } else if (json.uniformBounds) {
          drawBounds = json.uniformBounds;
        } else {
          drawBounds = fr?.bounds ?? null;
        }
      }
      if (!drawBounds) continue;
      const srcX = fr.x + drawBounds.left;
      const srcY = fr.y + drawBounds.top;
      const srcW = drawBounds.right - drawBounds.left + 1;
      const srcH = drawBounds.bottom - drawBounds.top + 1;

      const canvasW = Math.max(256, srcW*2);
      const canvasH = Math.max(256, srcH*2);
      const canvas = createCanvas(canvasW, canvasH);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333';
      ctx.fillRect(0,0,canvasW,canvasH);

      // draw extracted image centered
      const scale = Math.min((canvasW-20)/srcW, (canvasH-20)/srcH, 2);
      const dw = srcW*scale;
      const dh = srcH*scale;
      const dx = (canvasW - dw)/2;
      const dy = (canvasH - dh)/2;
      ctx.drawImage(sheet, srcX, srcY, srcW, srcH, dx, dy, dw, dh);

      // red rect = actual drawn src region
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,0,0,0.9)';
      ctx.strokeRect(dx, dy, dw, dh);

      // white rect = full frame area (frameW x frameH)
      const frameLeft = dx - drawBounds.left*scale;
      const frameTop = dy - drawBounds.top*scale;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(frameLeft, frameTop, frameW*scale, frameH*scale);

      const out = path.join(OUT, `${res}_${key}_f${fi}.png`);
      fs.writeFileSync(out, canvas.toBuffer('image/png'));
      console.log('wrote', out);
    }
  }
}

(async ()=>{
  const files = fs.readdirSync(ANIM_DIR).filter(f => f.endsWith('.json'));
  for (const f of files) {
    if (f === 'manifest.json') continue;
    try { await processPack(f); } catch(e){ console.error('err',f,e.message); }
  }
})();
