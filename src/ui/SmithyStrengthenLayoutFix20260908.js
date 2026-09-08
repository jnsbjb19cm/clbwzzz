const STYLE_ID = 'smithy-strengthen-layout-fix-20260908';

export function installSmithyStrengthenLayoutFix20260908() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-page,
    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-layout {
      overflow: visible !important;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-layout {
      display: grid !important;
      grid-template-areas: 'info workbench cards' !important;
      grid-template-columns: minmax(190px, .72fr) minmax(330px, 1.18fr) minmax(280px, .92fr) !important;
      align-items: start !important;
      gap: 12px !important;
      min-width: 0 !important;
      width: 100% !important;
    }

    /*
     * 左侧有大块空白，把成功率/强化粉/保护符整个面板只向左扩展。
     * 负 margin 与增加的 width 使用同一个值，所以面板右边缘、中央工作台和
     * 右侧卡牌列表完全不移动；只是吃掉左侧原本闲置的蓝色区域。
     */
    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
      --smithy-info-left-expand: 120px;
      grid-area: info !important;
      box-sizing: border-box !important;
      position: relative !important;
      z-index: 2 !important;
      min-width: 0 !important;
      width: calc(100% + var(--smithy-info-left-expand)) !important;
      max-width: none !important;
      margin-left: calc(-1 * var(--smithy-info-left-expand)) !important;
      max-height: min(620px, calc(100dvh - 250px)) !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      overscroll-behavior: contain;
      scrollbar-gutter: stable;
      scrollbar-width: thin;
      scrollbar-color: #69dcff rgba(4, 53, 82, .9);
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info::-webkit-scrollbar {
      width: 11px;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info::-webkit-scrollbar-track {
      margin: 5px 0;
      border: 1px solid rgba(244, 193, 66, .42);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(3, 46, 73, .96), rgba(4, 84, 119, .9));
      box-shadow: inset 0 0 6px rgba(0, 0, 0, .28);
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info::-webkit-scrollbar-thumb {
      min-height: 48px;
      border: 2px solid rgba(245, 197, 74, .78);
      border-radius: 8px;
      background: linear-gradient(180deg, #8cecff 0%, #45cdf5 34%, #169ed6 72%, #0873aa 100%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, .42),
        0 0 7px rgba(71, 209, 255, .28);
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info::-webkit-scrollbar-thumb:hover {
      background: linear-gradient(180deg, #b4f5ff 0%, #61dcff 34%, #25b5ea 72%, #0d84bd 100%);
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-center {
      grid-area: workbench !important;
      min-width: 0 !important;
      width: auto !important;
      justify-self: stretch !important;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-card-list {
      grid-area: cards !important;
      min-width: 0 !important;
      width: auto !important;
      max-width: 100% !important;
      overflow: hidden !important;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-card-list .starup-scroll {
      grid-template-columns: repeat(2, minmax(94px, 1fr)) !important;
      min-width: 0 !important;
      overflow-x: hidden !important;
    }

    @media (max-width: 1250px) {
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
        --smithy-info-left-expand: 72px;
      }
    }

    @media (max-width: 900px) {
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-layout {
        grid-template-areas:
          'info workbench'
          'cards cards' !important;
        grid-template-columns: minmax(180px, .72fr) minmax(320px, 1.28fr) !important;
      }
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
        --smithy-info-left-expand: 32px;
        max-height: min(540px, calc(100dvh - 230px)) !important;
      }
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-card-list .starup-scroll {
        grid-template-columns: repeat(4, minmax(82px, 1fr)) !important;
      }
    }

    @media (max-width: 650px) {
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-layout {
        grid-template-areas: 'workbench' 'info' 'cards' !important;
        grid-template-columns: minmax(0, 1fr) !important;
      }
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
        --smithy-info-left-expand: 0px;
        max-height: min(420px, calc(100dvh - 210px)) !important;
      }
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-card-list .starup-scroll {
        grid-template-columns: repeat(3, minmax(78px, 1fr)) !important;
      }
    }
  `;
  document.head.appendChild(style);
}
