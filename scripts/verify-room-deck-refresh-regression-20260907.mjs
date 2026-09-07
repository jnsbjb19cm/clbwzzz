import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const patch = fs.readFileSync(path.join(root, 'src/ui/RoomDeckRefreshRegressionFix20260907.js'), 'utf8');
const bootstrap = fs.readFileSync(path.join(root, 'src/bootstrap.js'), 'utf8');

assert.match(
  patch,
  /DeckSelectView\.saveDeck\(copyDeck\(view\._selected\), view\._cardInventory, group\)/,
  'ready/save path must preserve the active deck group',
);
assert.match(
  patch,
  /this\.__originalSaveDeck\s*=\s*\(selected, cardInventory\)\s*=>/,
  'V3 stale save callback must be replaced',
);
assert.match(
  patch,
  /RoomView\.prototype\.refreshRoom\s*=\s*refreshRoomWithoutFullFlash20260907/,
  'room snapshots must be intercepted before legacy full rerender',
);
assert.match(
  patch,
  /state\.onSetDeck\s*=.*owner\.socket\.setDeck/,
  'deck switch must use socket ack without direct refreshRoom',
);
assert.match(
  patch,
  /state\.onChangeMap\s*=.*owner\.socket\.changeMap/,
  'map change must use snapshot-driven in-place sync',
);
assert.doesNotMatch(
  patch,
  /state\.on(?:SetDeck|ChangeMap|Ready).*refreshRoom/,
  'ordinary room actions must not explicitly rerender the room',
);

const inventoryInstall = bootstrap.indexOf('installDeckInventoryAuthorityFix20260907();');
const finalInstall = bootstrap.indexOf('installRoomDeckRefreshRegressionFix20260907();');
assert.ok(
  inventoryInstall >= 0 && finalInstall > inventoryInstall,
  'final room/deck guard must install after server deck authority',
);

console.log('room/deck refresh regression checks: OK');
