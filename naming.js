import {PATTERNS,SHAPES} from './domain.js';

export function motifLabel(pattern) {
  const p = typeof pattern === 'string' ? PATTERNS.find(p=>p.id===pattern) : pattern;
  if (!p) return '';
  return p.reading && p.reading !== p.name ? `${p.name}(${p.reading})` : p.name;
}
export function workMotifs(work) {
  if (work.technique === 'plain') return [];
  return [...new Set([
    ...(work.placements||[]).map(p=>p.pattern||work.pattern),
    ...(work.strokes?.length ? [work.drawingLabel||work.recognition?.id||work.pattern] : []),
  ])].filter(id=>PATTERNS.some(p=>p.id===id));
}
export function motifTitleChoices(work) {
  const ids=workMotifs(work);
  if (!ids.length) return [{value:'',label:'무늬 없음'}];
  const ordered=[...ids].sort((a,b)=>['cloud','crane'].indexOf(b)-['cloud','crane'].indexOf(a));
  const combined=ids.includes('cloud')&&ids.includes('crane')&&ids.length===2?'운학문':ordered.map(id=>{const p=PATTERNS.find(p=>p.id===id);return p.reading||p.name;}).join('')+'문';
  return [{value:combined,label:`${combined} · ${ids.map(motifLabel).join('·')}`}];
}
export function nameParts(work) {
  const choices=motifTitleChoices(work),motif=choices.find(choice=>choice.value===work.titleMotif)?.value??choices[0].value;
  return {technique:{inlay:'상감',openwork:'투각',plain:''}[work.technique]||'',motif,shape:SHAPES.find(s=>s.id===work.shape)?.name.replace('청자 ','')||'그릇'};
}
export function suggestedName(work) {
  const p=nameParts(work);
  return ['청자',p.technique,p.motif,p.shape].filter(Boolean).join(' ');
}
