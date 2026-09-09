import cards from '../data/card.json';
import { cardSpriteUrl } from './SpriteAtlas.js';
import { SMITHY_MATERIAL_ART } from '../ui/SmithyMaterialArtwork.js';

const shiny = Object.values(import.meta.glob('../../resources/shiny/*.png', { eager: true, query: '?url', import: 'default' }));
export const LOGIN_IMAGE_URLS = [...new Set([
  '/background/hallbackground.png', '/atlas/items.png',
  '/background/gameroom.png', '/background/backpack.png', '/background/rwbj.png',
  '/background/gameroomck.png', '/background/bbckt.png',
  ...Object.values(SMITHY_MATERIAL_ART).flat(),
  new URL('../../resources/img/itemextension.png', import.meta.url).href,
  ...shiny,
  ...cards.filter(card => Number(card.show_card) === 1).map(card => cardSpriteUrl(card.res)),
])];

let started;
export const loginImagePreloadState = { total: LOGIN_IMAGE_URLS.length, loaded: 0, failed: 0, complete: false };

// Start on the login page, with only three low-priority requests in flight.
// Neither authentication nor startup awaits this promise. Failed images can load normally later.
export function preloadLoginImages() {
  if (started) return started;
  if (typeof Image === 'undefined') return Promise.resolve(loginImagePreloadState);
  let cursor = 0;
  const load = src => new Promise(resolve => {
    const img = new Image();
    img.fetchPriority = 'low';
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
      loginImagePreloadState[ok ? 'loaded' : 'failed']++;
      resolve();
    };
    const timer = setTimeout(() => { finish(false); img.src = ''; }, 10000);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
  });
  const worker = async () => { while (cursor < LOGIN_IMAGE_URLS.length) await load(LOGIN_IMAGE_URLS[cursor++]); };
  started = Promise.all(Array.from({ length: 3 }, worker)).then(() => {
    loginImagePreloadState.complete = true;
    return loginImagePreloadState;
  });
  return started;
}

void preloadLoginImages();
