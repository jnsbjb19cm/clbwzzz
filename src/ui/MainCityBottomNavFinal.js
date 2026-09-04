import { App } from './App.js';

const PATCH_FLAG = Symbol.for('clbwzzz.mainCityBottomNavFinal');

function syncMainCityNav(app, route) {
  const nav = app?.root?.querySelector?.('.bottom-nav');
  const isMain = route === 'main' || route === 'smithy';

  document.body.classList.toggle('main-city-nav-active', isMain);
  document.body.dataset.appRoute = route ?? '';

  if (!(nav instanceof HTMLElement)) return;
  nav.classList.toggle('main-city-corner-nav', isMain);
  nav.setAttribute('aria-hidden', isMain ? 'false' : 'true');
}

export function installMainCityBottomNavFinal() {
  if (globalThis[PATCH_FLAG]) return;
  globalThis[PATCH_FLAG] = true;

  const originalNavigate = App.prototype.navigate;
  App.prototype.navigate = function navigateWithMainCityCornerNav(route, opts = {}) {
    const result = originalNavigate.call(this, route, opts);
    syncMainCityNav(this, route);
    requestAnimationFrame(() => syncMainCityNav(this, route));
    return result;
  };

  window.__verifyMainCityBottomNavFinal = () => {
    const nav = document.querySelector('.bottom-nav');
    return {
      route: document.body.dataset.appRoute ?? '',
      active: document.body.classList.contains('main-city-nav-active'),
      visible: Boolean(nav && getComputedStyle(nav).display !== 'none'),
      rect: nav?.getBoundingClientRect?.() ?? null,
      buttons: [...(nav?.querySelectorAll?.('.bottom-nav-btn') ?? [])]
        .map((button) => button.textContent.trim()),
    };
  };
}
