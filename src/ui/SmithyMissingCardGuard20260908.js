import { SmithyView } from './SmithyView.js';

const INSTALL_FLAG = Symbol.for('clbwz.smithyMissingCardGuard20260908');

function withKnownCardSlots(view, render) {
  const inventory = view?.cardInventory;
  const db = view?.db;
  if (!inventory?.getSlots || !db?.getById) return render();

  const originalGetSlots = inventory.getSlots;
  const source = originalGetSlots.call(inventory);
  if (!Array.isArray(source)) return render();

  // Keep original slot indexes stable. An obsolete/unknown DB row becomes an empty
  // display slot instead of shifting every following card or crashing on card.name.
  const safe = source.map((slot) => {
    if (!slot) return null;
    return db.getById(slot.cardId) ? slot : null;
  });

  inventory.getSlots = () => safe;
  try {
    return render();
  } finally {
    inventory.getSlots = originalGetSlots;
  }
}

export function installSmithyMissingCardGuard20260908() {
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  const strengthenBase = SmithyView.prototype.renderUpgradeRoute;
  if (!strengthenBase?.__missingCardGuard20260908) {
    function renderUpgradeRouteWithoutUnknownCards20260908(...args) {
      return withKnownCardSlots(this, () => strengthenBase.apply(this, args));
    }
    renderUpgradeRouteWithoutUnknownCards20260908.__missingCardGuard20260908 = true;
    SmithyView.prototype.renderUpgradeRoute = renderUpgradeRouteWithoutUnknownCards20260908;
  }

  const decomposeBase = SmithyView.prototype.renderDecompose;
  if (!decomposeBase?.__missingCardGuard20260908) {
    function renderDecomposeWithoutUnknownCards20260908(...args) {
      return withKnownCardSlots(this, () => decomposeBase.apply(this, args));
    }
    renderDecomposeWithoutUnknownCards20260908.__missingCardGuard20260908 = true;
    SmithyView.prototype.renderDecompose = renderDecomposeWithoutUnknownCards20260908;
  }
}
