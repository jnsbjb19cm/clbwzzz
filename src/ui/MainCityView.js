import { audio } from '../core/AudioManager.js';
import { bindClassicChat, classicBroadcastMarkup, classicChatMarkup } from './ClassicCityChrome.js';

const SHINY_ART = Object.freeze({
  hall: new URL('../../resources/shiny/名人堂shiny.png', import.meta.url).href,
  room: new URL('../../resources/shiny/游戏大厅shiny.png', import.meta.url).href,
  worldmap: new URL('../../resources/shiny/野外冒险shiny.png', import.meta.url).href,
  quest: new URL('../../resources/shiny/任务shiny.png', import.meta.url).href,
  smithy: new URL('../../resources/shiny/铁匠铺shiny.png', import.meta.url).href,
  shop: new URL('../../resources/shiny/商店shiny.png', import.meta.url).href,
  auction: new URL('../../resources/shiny/拍卖行shiny.png', import.meta.url).href,
  guild: new URL('../../resources/shiny/公会shiny.png', import.meta.url).href,
});

const BUILDINGS = [
  { id: 'hall', name: '名人堂', x:14.8, y:33.2, size:34, shineX:14.8, shineY:33.5, shineW:22 },
  { id: 'room', name: '游戏大厅', x:46.3, y:17.9, size:34, shineX:47.2, shineY:25.0, shineW:31 },
  { id: 'worldmap', name: '野外冒险', x:70.9, y:17.6, size:34, shineX:70.0, shineY:19.0, shineW:19 },
  { id: 'quest', name: '任务', x:86.6, y:19.5, size:40, shineX:87.0, shineY:20.5, shineW:14 },
  { id: 'smithy', name: '铁匠铺', x:89.2, y:47.7, size:34, shineX:89.0, shineY:48.5, shineW:16 },
  { id: 'shop', name: '商店', x:54.2, y:74.1, size:40, shineX:54.3, shineY:74.0, shineW:22 },
  { id: 'auction', name: '拍卖行', x:88.5, y:68.7, size:34, shineX:88.3, shineY:70.0, shineW:17 },
  { id: 'guild', name: '公会俱乐部', x:16.7, y:64.4, size:32, shineX:15.8, shineY:66.0, shineW:22 },
  { id: 'training', name: '训练营', x:66.2, y:48.6, size:34, shineX:66.0, shineY:49.5, shineW:18 },
];

export class MainCityView {
  constructor(onNavigate) {
    this.onNavigate = onNavigate;
  }

  render(root) {
    root.innerHTML = `
      <div class='main-city classic-city-screen'>
        <div class="classic-city-stage">
        <img class="classic-city-background" src="/background/hallbackground.png" alt="丛林保卫战主城">
        <div class="classic-city-vignette"></div>
        ${classicBroadcastMarkup(['欢迎进入魔幻森林，选择你要前往的区域。'])}
        ${BUILDINGS.map(b => `
          <button class="city-btn" data-route="${b.id}"
            style="--city-x:${b.x}%;--city-y:${b.y}%;--city-font:${b.size}px"
          ><img class='city-shiny-layer' src='${SHINY_ART[b.id]}' alt='' aria-hidden='true'><span>${b.name}</span></button>
        `).join('')}
        <div class="classic-shop-caption">SHOP</div>
        ${classicChatMarkup()}
        <button type="button" class="classic-recharge-btn">钻石充值</button>
      </div>
      </div>
    `;

    bindClassicChat(root);
    root.querySelector('.classic-recharge-btn')?.addEventListener('click', () => audio.playButton('mainCity'));
    const stage = root.querySelector('.classic-city-stage');
    for (const building of BUILDINGS) {
      const button = root.querySelector('.city-btn[data-route=' + building.id + ']');
      const shine = button?.querySelector('.city-shiny-layer');
      if (!stage || !button || !shine) continue;
      shine.remove();
      shine.dataset.shinyRoute = building.id;
      shine.dataset.shineX = String(building.shineX);
      shine.dataset.shineY = String(building.shineY);
      shine.style.setProperty('--shine-x', building.shineX + '%');
      shine.style.setProperty('--shine-y', building.shineY + '%');
      shine.style.setProperty('--shine-w', building.shineW + 'vw');
      stage.insertBefore(shine, button);
      const activate = () => shine.classList.add('is-active');
      const deactivate = () => shine.classList.remove('is-active');
      button.addEventListener('pointerenter', activate);
      button.addEventListener('pointerleave', deactivate);
      button.addEventListener('focus', activate);
      button.addEventListener('blur', deactivate);
    }

    root.querySelectorAll('.city-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        audio.playButton('mainCity');
        this.onNavigate(btn.dataset.route);
      });
    });
  }
}
