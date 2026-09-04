import { createRequire } from 'node:module';
import { Card } from '../../src/core/Card.js';

const require = createRequire(import.meta.url);
const cardJson = require('../../src/data/card.json');

let cardDb = null;

export function getPvpCardDb() {
  if (!cardDb) {
    const cards = cardJson.map((raw) => new Card(raw));
    cardDb = {
      cards,
      getById: (id) => cards.find((card) => card.id === Number(id)) ?? null,
      stages: [{ stage_id: 1, stage_name: 'PVP', hp: 3000, enemy_res: 5 }],
    };
  }
  return cardDb;
}
