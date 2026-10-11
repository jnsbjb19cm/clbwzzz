// Measure each original image once; use CSS placement, never resample the artwork.
const boundsCache = new Map();
function boundsOf(image) {
  if (boundsCache.has(image.src)) return boundsCache.get(image.src);
  const width=image.naturalWidth, height=image.naturalHeight;
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  context.drawImage(image,0,0);
  const pixels=context.getImageData(0,0,width,height).data;
  let left=width,top=height,right=-1,bottom=-1;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=40){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  const bounds=right>=left?{left,top,right:right+1,bottom:bottom+1,width,height}:null;
  boundsCache.set(image.src,bounds);return bounds;
}

export function fitBattleHandPortraits(hand) {
  hand.querySelectorAll('img.slot-portrait').forEach(image=>{
    const fit=()=>{
      if(!image.naturalWidth)return;
      try {
        const b=boundsOf(image);if(!b)return;
        // Fixed 3:4 card: visible artwork inside x=4..96%, y=6..76%.
        // Short/wide units retain their natural silhouette and share the same baseline.
        const ratio=.75;
        const scale=Math.min(.92*ratio/(b.right-b.left),.70/(b.bottom-b.top));
        const left=(ratio/2-(b.left+b.right)/2*scale)/ratio*100;
        const top=(.76-b.bottom*scale)*100;
        for(const [key,value] of Object.entries({left,top,width:b.width*scale/ratio*100,height:b.height*scale*100})) {
          image.style.setProperty(`--portrait-${key}`,`${value}%`);
        }
        image.dataset.portraitBounds=JSON.stringify(b);
        image.classList.add('fitted-hand-portrait');
      } catch { /* Keep the existing image fallback if a resource cannot be measured. */ }
    };
    if(image.complete)fit();else image.addEventListener('load',fit,{once:true});
  });
}
