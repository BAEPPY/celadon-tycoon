import { normalizeGlazeDip } from './glaze-dip-rules.js';

const TAU = Math.PI * 2;
const artwork = new Map();
const fallback = new Map();
const canvas = (width, height) => Object.assign(document.createElement('canvas'), { width, height });

// Only a completed dip changes the material. Earlier student work and a successful
// dip keep their original artwork, and an unfired pot never turns green early.
export function glazeSurfaceTreatment(raw, stage) {
  const dip = normalizeGlazeDip(raw);
  if (!dip || dip.success || !['glazed', 'finished'].includes(stage)) return null;
  const amount = .3 + dip.severity * .7;
  const fired = stage === 'finished';
  return {
    outcome: dip.outcome, fired, amount,
    wash: dip.outcome === 'thin' ? (fired ? '#c9c8b0' : '#ded7c9') : (fired ? '#a5b9a0' : '#f3f2eb'),
    washAlpha: dip.outcome === 'thin' ? .13 + amount * .18 : .04 + amount * .08,
    textureAlpha: dip.outcome === 'thin' ? (fired ? .35 + amount * .30 : .12 + amount * .16) : .50 + amount * .30,
  };
}

export function loadGlazeSurfaceArt(raw) {
  const dip = normalizeGlazeDip(raw);
  if (!dip || dip.success) return Promise.resolve(null);
  if (!artwork.has(dip.outcome)) {
    const state = { image: null, promise: null };
    state.promise = new Promise(resolve => {
      const image = new Image();
      image.onload = () => { state.image = image; resolve(image); };
      image.onerror = () => resolve(null);
      image.src = `./assets/glaze-dip/${dip.outcome}-overlay.webp`;
    });
    artwork.set(dip.outcome, state);
  }
  return artwork.get(dip.outcome).promise;
}

// A small, deterministic material map is shown while its generated artwork loads.
// These are surface marks, never replacement pottery silhouettes or random holes.
function fallbackTexture(outcome) {
  if (fallback.has(outcome)) return fallback.get(outcome);
  const image = canvas(768, 384), c = image.getContext('2d');
  if (outcome === 'thin') {
    for (const [x,y,rx,ry] of [[.12,.43,.14,.24],[.45,.65,.13,.27],[.77,.30,.18,.22],[.91,.83,.12,.15]]) {
      c.save(); c.translate(x*768,y*384); c.scale(rx*768,ry*384);
      const wash = c.createRadialGradient(0,0,.12,0,0,1);
      wash.addColorStop(0,'rgba(204,175,137,.76)');wash.addColorStop(.66,'rgba(212,191,158,.46)');wash.addColorStop(1,'rgba(212,191,158,0)');
      c.fillStyle=wash;c.fillRect(-1,-1,2,2);c.restore();
    }
  } else {
    for (const [x,top,bottom,width] of [[.11,.15,.78,.035],[.4,.27,.94,.052],[.69,.07,.67,.035],[.90,.32,.88,.045]]) {
      const px=x*768,py=top*384,by=bottom*384,r=width*768;
      c.beginPath();c.moveTo(px-r,py);c.bezierCurveTo(px-r*1.2,py+65,px+r*.2,by-45,px-r*.75,by-10);
      c.bezierCurveTo(px-r*.8,by+12,px+r*.8,by+12,px+r*.8,by-10);c.bezierCurveTo(px+r*.6,by-60,px+r,py+40,px+r,py);
      c.closePath();c.fillStyle='rgba(74,116,95,.78)';c.fill();
      c.beginPath();c.moveTo(px-r*.35,py+9);c.bezierCurveTo(px-r*.3,py+75,px+r*.28,by-34,px-r*.18,by-11);
      c.lineWidth=3;c.lineCap='round';c.strokeStyle='rgba(225,231,202,.85)';c.stroke();
    }
    c.fillStyle='rgba(95,126,101,.6)';c.beginPath();c.moveTo(0,358);
    for(let x=0;x<=768;x+=16)c.lineTo(x,348+Math.sin(x/53)*7);
    c.lineTo(768,384);c.lineTo(0,384);c.closePath();c.fill();
  }
  fallback.set(outcome,image);return image;
}

// Draw one triangle from an unwrapped material map onto its projected body. The
// same vessel coordinates as the student's motifs make marks travel with a turn.
function triangle(c, image, a, b, d) {
  const [x0,y0,u0,v0]=a,[x1,y1,u1,v1]=b,[x2,y2,u2,v2]=d;
  const det=u0*(v1-v2)+u1*(v2-v0)+u2*(v0-v1);
  if(Math.abs(det)<.00001)return;
  const ax=(x0*(v1-v2)+x1*(v2-v0)+x2*(v0-v1))/det;
  const bx=(x0*(u2-u1)+x1*(u0-u2)+x2*(u1-u0))/det;
  const ay=(y0*(v1-v2)+y1*(v2-v0)+y2*(v0-v1))/det;
  const by=(y0*(u2-u1)+y1*(u0-u2)+y2*(u1-u0))/det;
  c.save();c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.lineTo(x2,y2);c.closePath();c.clip();
  c.setTransform(ax,ay,bx,by,x0-ax*u0-bx*v0,y0-ay*u0-by*v0);
  c.drawImage(image,0,0);c.restore();
}

function projectTexture(image, source, project) {
  const { width, height }=source.pixels, bounds=source.artBounds;
  const output=canvas(width,height), c=output.getContext('2d');
  const top=bounds.y/height, span=bounds.height/height, cols=64, rows=20;
  const points=Array.from({length:rows+1},(_,y)=>Array.from({length:cols+1},(_,x)=>{
    const p=project((x/cols-.5)*TAU,top+y/rows*span);
    return p ? [p.uv[0]*width,p.uv[1]*height,x/cols*image.width,y/rows*image.height] : null;
  }));
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
    const a=points[y][x],b=points[y][x+1],d=points[y+1][x],e=points[y+1][x+1];
    if(a&&b&&d)triangle(c,image,a,b,d);
    if(b&&d&&e)triangle(c,image,b,e,d);
  }
  return output;
}

export class GlazeSurface {
  constructor() { this.projections = new WeakMap(); }
  prepare(raw) { return loadGlazeSurfaceArt(raw); }
  paint(c, { raw, stage, source, project }) {
    const treatment=glazeSurfaceTreatment(raw,stage);
    if(!treatment)return;
    const image=artwork.get(treatment.outcome)?.image || fallbackTexture(treatment.outcome);
    let cached=this.projections.get(source);
    if(!cached){cached=new Map();this.projections.set(source,cached);}
    const key=treatment.outcome;
    let projection=cached.get(key);
    if(!projection || projection.image!==image){projection={image,canvas:projectTexture(image,source,project)};cached.set(key,projection);}
    c.save();c.globalCompositeOperation='source-atop';
    c.globalAlpha=treatment.washAlpha;c.fillStyle=treatment.wash;c.fillRect(0,0,c.canvas.width,c.canvas.height);
    c.globalAlpha=treatment.textureAlpha;
    if(!treatment.fired)c.filter='grayscale(1) brightness(1.32)';
    c.drawImage(projection.canvas,0,0);c.restore();
  }
}
