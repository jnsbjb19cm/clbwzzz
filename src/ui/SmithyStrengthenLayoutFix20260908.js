const STYLE_ID = 'smithy-strengthen-layout-fix-20260908';

export function installSmithyStrengthenLayoutFix20260908() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-layout {
      display: grid !important;
      grid-template-areas: 'info workbench cards' !important;
      grid-template-columns: minmax(190px, .72fr) minmax(330px, 1.18fr) minmax(280px, .92fr) !important;
      align-items: start !important;
      gap: 12px !important;
      min-width: 0 !important;
      width: 100% !important;
    }

    .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-info {
      grid-area: info !important;
      min-width: 0 !important;
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

    @media (max-width: 900px) {
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-layout {
        grid-template-areas:
          'info workbench'
          'cards cards' !important;
        grid-template-columns: minmax(180px, .72fr) minmax(320px, 1.28fr) !important;
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
      .classic-smithy-screen[data-smithy-mode='strengthen'] .starup-card-list .starup-scroll {
        grid-template-columns: repeat(3, minmax(78px, 1fr)) !important;
      }
    }
  `;
  document.head.appendChild(style);
}
