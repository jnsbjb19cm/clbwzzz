import { createRequire } from 'node:module';
import { Card } from '../../src/core/Card.js';

const require = createRequire(import.meta.url);
const cardJson = require('../../src/data/card.json');
// 2026-09-11：野外冒险(PVE)联机需要真实关卡波形/基地血量，服务端卡库里带上完整 stageInfo。
const stageInfoJson = require('../../src/data/stageInfo.json');

let cardDb = null;

export function getPvpCardDb() {
  if (!cardDb) {
    const cards = cardJson.map((raw) => new Card(raw));
    cardDb = {
      cards,
      getById: (id) => cards.find((card) => card.id === Number(id)) ?? null,
      stages: Array.isArray(stageInfoJson) && stageInfoJson.length
        ? stageInfoJson
        : [{ stage_id: 1, stage_name: 'PVP', hp: 3000, enemy_res: 5 }],
    };
  }
  return cardDb;
}
