// 共用原始金星素材；七颗一行，高星卡不截成六颗或用“+N”替代。
export function cardStarRows(stars, className) {
  const count = Math.max(0, Math.min(99, Math.floor(Number(stars) || 0)));
  return `<span class="${className} glass-card-stars" aria-label="强化${count}星">${Array.from({length:count},()=>'<img src="/sprites/parts/single_star_1.png" alt="" aria-hidden="true" draggable="false">').join('')}</span>`;
}
