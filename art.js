/**
 * Original SVG illustrations for the celadon workshop. No external assets.
 * vesselSVG({shape:'pillow',stage:'finished',technique:'inlay',pattern:'crane',
 *   placements:[{x:145,y:190},{x:215,y:200}],uid:'order-1'})
 * Coordinates use the 360 × 360 viewBox before the optional width transform.
 * An empty placements array deliberately produces no decorative motifs.
 * Images simplify historical objects for a primary-school learning activity.
 */

const SHAPES = {
  maebyeong: {
    label: '매병',
    body: 'M159 58 Q180 62 201 58 L199 83 C208 98 232 98 244 122 C262 159 247 208 228 248 Q216 275 217 292 Q180 307 143 292 Q144 276 132 248 C113 208 98 159 116 122 C128 98 152 98 161 83 Z',
    rim: '<ellipse cx="180" cy="58" rx="23" ry="6"/><ellipse cx="180" cy="58" rx="16" ry="2.8" fill="#294e43" opacity=".5"/>',
    foot: '<path d="M143 290 Q180 302 217 290 L218 300 Q181 314 142 300 Z"/>',
    lines: '<path d="M123 122 Q180 139 237 122 M130 237 Q180 255 230 237 M139 277 Q180 291 221 277"/>',
    shine: 'M140 113 C119 139 126 184 135 207',
    shadow: [180, 316, 62, 10],
  },
  pitcher: {
    label: '주전자',
    body: 'M154 107 Q180 96 207 107 C217 125 214 136 224 153 C247 181 249 229 230 253 C211 278 152 281 127 257 C104 234 110 186 132 154 C145 135 143 122 154 107 Z',
    before: '<path d="M214 129 C280 96 296 150 276 193 Q262 212 239 205 L240 184 Q260 190 265 174 C275 143 254 133 222 151 Z"/><path d="M132 176 C105 168 94 141 76 118 L60 116 C70 159 79 198 116 216 Z"/>',
    rim: '<path d="M152 109 Q180 98 209 109 L205 120 Q181 130 156 120 Z"/><path d="M145 106 Q180 82 215 106 Q181 117 145 106 Z"/><path d="M175 88 Q168 70 180 69 Q193 70 186 88 Z"/>',
    foot: '<path d="M143 266 Q180 277 218 265 L216 278 Q181 292 144 278 Z"/>',
    lines: '<path d="M125 238 Q178 256 237 237 M146 140 Q180 151 216 140"/>',
    shine: 'M148 157 C129 178 125 205 132 224',
    shadow: [179, 302, 89, 12],
  },
  pillow: {
    label: '베개',
    body: 'M65 146 Q180 170 295 146 L292 229 Q180 265 68 229 Z',
    before: '<path d="M65 146 L92 117 Q180 138 268 117 L295 146 Q180 176 65 146 Z"/>',
    rim: '<path d="M68 229 Q180 265 292 229 L286 244 Q179 280 74 244 Z"/><path d="M65 146 L92 117 L96 201 L68 229 Z"/>',
    foot: '',
    lines: '<path d="M84 161 Q180 182 277 161 L275 218 Q180 247 85 218 Z"/><path d="M102 131 Q180 148 258 131"/>',
    shine: 'M101 174 Q175 191 253 175',
    shadow: [180, 284, 119, 15],
  },
  stool: {
    label: '의자',
    body: 'M126 104 Q180 123 234 104 C227 130 227 147 237 173 Q250 192 237 212 C225 232 227 251 235 275 Q180 300 125 275 C133 252 135 231 123 212 Q110 193 123 173 C133 148 132 129 126 104 Z',
    rim: '<ellipse cx="180" cy="100" rx="65" ry="19"/><ellipse cx="180" cy="97" rx="53" ry="12" fill="none" stroke-width="1.5"/><path d="M115 100 L118 113 Q180 137 242 113 L245 100 Q181 124 115 100 Z"/>',
    foot: '<path d="M125 270 Q180 290 235 270 L240 286 Q180 310 120 286 Z"/>',
    lines: '<path d="M131 147 Q180 164 229 147 M126 229 Q180 249 234 229"/><path d="M139 126 Q180 140 221 126 M137 257 Q180 270 223 257"/>',
    shine: 'M144 169 Q133 191 144 214',
    shadow: [180, 316, 72, 11],
  },
  incense: {
    label: '향로',
    body: 'M112 176 Q180 190 248 176 Q246 232 217 244 L213 267 Q180 280 147 267 L143 244 Q114 232 112 176 Z',
    before: '<path d="M145 258 Q180 273 215 258 L231 283 Q180 309 129 283 Z"/>',
    rim: '<path d="M111 174 C115 142 131 122 155 111 Q180 94 205 111 C230 122 246 142 249 174 Q180 198 111 174 Z"/><path d="M173 102 Q163 81 180 76 Q197 81 187 102 Z"/><ellipse cx="180" cy="178" rx="70" ry="12" fill="none"/>',
    foot: '<path d="M136 282 Q180 296 224 282 L226 293 Q180 312 134 293 Z"/>',
    lines: '<path d="M126 199 Q142 235 159 243 Q162 220 150 198 M160 202 Q180 235 180 251 Q184 222 200 202 M208 198 Q198 224 202 243 Q222 230 234 199"/>',
    shine: 'M145 125 Q126 139 125 155',
    shadow: [180, 322, 75, 11],
  },
};

// Additional learning silhouettes; actual construction uses the catalog GLBs.
SHAPES.chrysanthemumCup={label:'잔',body:'M100 135 Q180 160 260 135 L240 260 Q180 295 120 260 Z',rim:'<ellipse cx="180" cy="135" rx="80" ry="22"/><ellipse cx="180" cy="135" rx="67" ry="14" fill="#5e684c"/>',foot:'',lines:'',shine:'M135 170 L145 240',shadow:[180,310,85,12]};
SHAPES.cupStand={...SHAPES.chrysanthemumCup,label:'잔과 받침',before:'<ellipse cx="180" cy="275" rx="120" ry="32"/>',body:'M120 125 Q180 145 240 125 L225 240 Q180 263 135 240 Z',rim:'<ellipse cx="180" cy="125" rx="60" ry="17"/>'};
SHAPES.duckDropper={label:'연적',body:'M106 170 Q65 240 145 265 Q235 290 266 224 Q284 177 250 165 Q233 151 239 128 Q242 95 214 94 Q180 95 186 131 Q186 163 160 167 Z',rim:'<path d="M236 110 L274 125 L238 132Z"/>',foot:'',lines:'<path d="M115 200 Q176 160 228 215 Q180 249 125 224Z"/>',shine:'M125 185 Q95 210 120 230',shadow:[180,305,100,12]};
SHAPES.gourdBottle={label:'조롱박 병',body:'M163 60 L197 60 L198 84 Q240 95 225 140 Q206 170 222 187 Q275 220 246 275 Q180 318 114 275 Q85 220 138 187 Q154 170 135 140 Q120 95 162 84Z',rim:'<ellipse cx="180" cy="60" rx="20" ry="7"/>',foot:'',lines:'<path d="M143 180 Q180 194 217 180"/>',shine:'M155 102 Q140 120 155 140 M130 220 Q116 250 140 266',shadow:[180,324,80,12]};

const PALETTES = {
  clay: ['#e2ba83', '#bb8758', '#86613f'],
  carved: ['#dfb67e', '#b78051', '#815d3c'],
  filled: ['#dfb67e', '#b78051', '#815d3c'],
  scraped: ['#dfb67e', '#b78051', '#815d3c'],
  biscuit: ['#efd8b4', '#d3ae7f', '#a47e54'],
  glazed: ['#d4e0ce', '#aabfa9', '#738e78'],
  finished: ['#bfdbb8', '#7fae96', '#406e5b'],
};

function safe(value) { return String(value).replace(/[^a-zA-Z0-9_-]/g, '') || 'celadon'; }
function finite(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }

function motif(pattern, stroke, fill, carved = false) {
  const style = `stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" fill="${carved ? 'none' : fill}"`;
  if (pattern === 'cloud') return `<g ${style}><path d="M-24 5 C-34 1-26-11-18-8 C-18-22 3-24 7-10 C20-18 30-7 24 2 C38 9 23 19 10 13 L-17 13 C-27 17-35 9-24 5Z"/><path d="M-16 4 Q-2-4 4 4 Q10 11 20 5 M-8-9 Q-3-12 2-7" fill="none"/></g>`;
  if (pattern === 'lotus') return `<g ${style}><path d="M0 19 C-11 6-11-9 0-23 C11-9 11 6 0 19Z"/><path d="M0 19 C-18 18-27 3-25-13 C-10-8-1 2 0 19Z M0 19 C18 18 27 3 25-13 C10-8 1 2 0 19Z"/><path d="M0 19 C-18 24-33 14-35 2 C-20-1-8 5 0 19Z M0 19 C18 24 33 14 35 2 C20-1 8 5 0 19Z"/><path d="M-18 24 Q0 31 18 24" fill="none"/></g>`;
  return `<g ${style}><path d="M-5 5 C-11-10-28-19-36-18 C-26-6-22 5-8 12 Q-1 17 6 10 C23 5 26-4 36-11 C21-12 9-6 3 3 Z"/><path d="M0 9 C12 7 6-6 14-17 Q18-22 22-18 Q25-15 21-12 C16-12 16-5 17 0" fill="none" stroke-width="3"/><path d="M21-15 L32-12 L22-10"/><path d="M-2 12 L-11 27 M2 12 L-4 27" fill="none"/><path d="M-30-13 L-12 6 M28-7 L9 7" fill="none"/><circle cx="20" cy="-16" r="1.3" fill="${stroke}" stroke="none"/></g>`;
}

function decoration(placements, pattern, technique, stage) {
  if (technique === 'plain') return '';
  return placements.slice(0, 12).map((placement, index) => {
    const x = Math.max(35, Math.min(325, finite(placement.x, 180)));
    const y = Math.max(45, Math.min(305, finite(placement.y, 190)));
    const scale = Math.max(.45, Math.min(1.3, finite(placement.scale, .67)));
    if (technique === 'openwork') return `<g transform="translate(${x} ${y}) scale(${scale})">${motif(pattern, '#e1edd8', '#36574c')}</g>`;
    const carved = stage === 'carved' || stage === 'clay';
    const fill = stage === 'finished' ? '#f5f0d7' : '#fff5d9';
    const stroke = carved ? '#785037' : stage === 'finished' ? '#416459' : '#8a7254';
    const patch = stage === 'filled' ? `<path d="M-44-22 Q-18-38 9-26 Q40-34 42-10 L39 26 Q8 36-13 25 Q-40 35-46 11Z" fill="#fff6dc" opacity=".88"/>` : '';
    return `<g transform="translate(${x} ${y}) scale(${scale})">${patch}${motif(pattern, stroke, fill, carved)}${stage === 'finished' && index % 2 === 0 ? '<path d="M-20 34 Q0 39 20 34" fill="none" stroke="#edf0d6" stroke-width="1.5" opacity=".65"/>' : ''}</g>`;
  }).join('');
}

export function vesselSVG({ shape = 'maebyeong', stage = 'finished', pattern = 'crane', technique = 'inlay', placements = [], width = 1, uid = 'vessel' } = {}) {
  const kind = SHAPES[shape] || SHAPES.maebyeong;
  const colors = PALETTES[stage] || PALETTES.finished;
  const id = safe(uid);
  const outline = stage === 'finished' || stage === 'glazed' ? '#426855' : '#916746';
  const scaleX = Math.max(.75, Math.min(1.2, finite(width, 1)));
  const [cx,cy,rx,ry] = kind.shadow;
  const finished = stage === 'finished';
  // The broad surface clip includes the lid on a censer and the seat on a stool.
  const clip = `<path d="${kind.body}"/>${shape === 'incense' ? '<path d="M111 174 C115 142 131 122 155 111 Q180 94 205 111 C230 122 246 142 249 174Z"/>' : ''}`;
  const lidHoles = shape === 'incense' ? '<g fill="#335c4b" stroke="#e6efd7" stroke-width="1.3"><circle cx="153" cy="141" r="5"/><circle cx="180" cy="128" r="5"/><circle cx="207" cy="141" r="5"/><circle cx="167" cy="160" r="5"/><circle cx="194" cy="160" r="5"/></g>' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360" role="img" aria-label="${kind.label} 제작 모습" class="vessel-svg">
  <title>${kind.label} — 학습용으로 단순화한 청자</title>
  <defs>
    <linearGradient id="${id}-glaze" x1="0" y1="0" x2="1" y2=".3"><stop stop-color="${colors[2]}"/><stop offset=".2" stop-color="${colors[1]}"/><stop offset=".48" stop-color="${colors[0]}"/><stop offset=".72" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient>
    <linearGradient id="${id}-light" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".27"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#213e31" stop-opacity=".13"/></linearGradient>
    <clipPath id="${id}-clip">${clip}</clipPath>
    <pattern id="${id}-grain" width="24" height="21" patternUnits="userSpaceOnUse"><circle cx="6" cy="5" r=".7" fill="#fffbea" opacity=".23"/><circle cx="18" cy="15" r=".7" fill="#324c3a" opacity=".13"/></pattern>
  </defs>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#3e4b35" opacity=".12"/>
  <g transform="translate(180 0) scale(${scaleX} 1) translate(-180 0)" stroke="${outline}" stroke-width="2.5" stroke-linejoin="round" fill="url(#${id}-glaze)">
    ${kind.before || ''}
    <path d="${kind.body}"/>
    ${kind.foot}${kind.rim}
    <g clip-path="url(#${id}-clip)" stroke="none"><rect x="30" y="45" width="300" height="270" fill="url(#${id}-light)"/><rect x="30" y="45" width="300" height="270" fill="url(#${id}-grain)"/>${decoration(Array.isArray(placements) ? placements : [], pattern, technique, stage)}</g>
    <g fill="none" stroke="${outline}" stroke-width="1.5" opacity=".47">${kind.lines}</g>
    ${lidHoles}
    ${shape === 'pillow' ? '<ellipse cx="82" cy="177" rx="5" ry="11" fill="#45614a" stroke="#d9e6c7" stroke-width="1.6"/>' : ''}
    <path d="${kind.shine}" fill="none" stroke="#fffeec" stroke-width="${finished ? '8' : '5'}" opacity="${finished ? '.3' : '.14'}" stroke-linecap="round"/>
  </g>
  ${finished ? '<g stroke="#c4a45e" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"><path d="M282 88 V100 M276 94 H288 M76 248 V256 M72 252 H80"/></g>' : ''}
</svg>`;
}

export function customerSVG(kind = 'king', size = 100) {
  const king = kind === 'king';
  const lady = ['lady', 'noblewoman', 'queen'].includes(kind);
  const robe = king ? '#ed6846' : lady ? '#ee85ad' : '#47b5c0';
  const shade = king ? '#c64432' : lady ? '#cd5689' : '#218b9c';
  const outline = '#573b31';
  const hat = king
    ? '<path d="M31 27 L9 20 Q5 26 9 32 L32 36 M89 27 L111 20 Q115 26 111 32 L88 36" fill="#3c4e4a"/><path d="M30 40 L34 16 Q60 8 86 16 L90 40Z" fill="#344844"/><path d="M37 21 Q60 16 82 21" stroke="#6f8880" stroke-width="4"/><path d="M31 34 Q60 28 89 34 L90 42 Q60 36 30 42Z" fill="#ffd76b"/><circle cx="60" cy="32" r="6" fill="#ec6b49" stroke="#ffdf7a" stroke-width="3"/>'
    : lady
      ? '<ellipse cx="60" cy="17" rx="18" ry="11" fill="#51413a"/><path d="M26 49 Q21 19 60 21 Q99 19 94 49 L84 36 Q72 42 64 31 Q48 46 34 35Z" fill="#51413a"/><path d="M39 27 Q49 22 58 24" stroke="#887066" stroke-width="4"/><path d="M78 25 L104 16" stroke="#eeb94f" stroke-width="4"/><path d="M94 16 Q95 5 103 10 Q113 8 110 17 Q114 26 104 26 Q97 31 94 22 Q88 21 94 16" fill="#f5a2bd" stroke-width="2.5"/><circle cx="102" cy="19" r="3.5" fill="#fff0a4" stroke="none"/>'
      : '<path d="M28 41 L33 15 Q60 5 86 15 L93 42Z" fill="#35585d"/><path d="M36 22 Q60 14 83 23" stroke="#5c8783" stroke-width="5"/><path d="M29 35 Q60 28 91 35 L93 43 Q61 37 28 43Z" fill="#82ceb4"/><path d="M51 15 L49 32 M69 15 L71 32" stroke="#243f44" stroke-width="2.5"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${Math.max(24, finite(size,100))}" height="${Math.max(24, finite(size,100))}" role="img" aria-label="${king ? '왕' : '귀족 손님'}" class="customer-svg" data-art-version="tycoon-v2">
  <g stroke="${outline}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
    <ellipse cx="60" cy="115" rx="40" ry="4" fill="#775139" opacity=".15" stroke="none"/>
    <path d="M39 85 Q25 87 20 102 L31 112 L43 101 M81 85 Q95 85 103 100 L94 111 L80 101" fill="${robe}"/>
    <path d="M41 83 Q60 76 80 83 L88 115 Q60 122 32 115Z" fill="${robe}"/>
    <path d="M36 104 Q60 111 84 103 L87 115 Q60 120 33 115Z" fill="${shade}" stroke="none"/>
    <path d="M45 81 L60 94 L75 81 L80 87 L61 107 L40 87Z" fill="#fff3cc" stroke-width="2.8"/>
    <path d="M60 94 L50 116" fill="none" stroke-width="2.4"/>
    <path d="M26 100 Q20 93 15 97 Q10 103 17 110 Q24 117 30 110Z" fill="#ffd1a6"/><path d="M94 99 Q98 90 104 93 Q111 97 105 106 Q100 113 94 108Z" fill="#ffd1a6"/>
    <ellipse cx="25" cy="58" rx="7" ry="9" fill="#f5ba91"/><ellipse cx="95" cy="58" rx="7" ry="9" fill="#f5ba91"/>
    <path d="M27 41 Q35 26 60 26 Q85 26 93 41 L95 64 Q96 80 80 86 Q60 95 40 86 Q24 80 25 64Z" fill="#ffd7b2"/>
    <path d="M28 69 Q35 87 60 88 Q84 86 92 69 Q93 80 80 86 Q60 95 40 86 Q26 80 28 69Z" fill="#efaf88" opacity=".65" stroke="none"/>
    ${hat}
    <path d="M36 49 Q42 45 49 48 M71 48 Q78 45 84 49" fill="none" stroke-width="3"/>
    <ellipse cx="43" cy="59" rx="6.5" ry="9" fill="#52392f" stroke-width="1.3"/><ellipse cx="77" cy="59" rx="6.5" ry="9" fill="#52392f" stroke-width="1.3"/>
    <ellipse cx="41" cy="55" rx="2.6" ry="3.2" fill="#fffdf0" stroke="none"/><ellipse cx="75" cy="55" rx="2.6" ry="3.2" fill="#fffdf0" stroke="none"/>
    <circle cx="45" cy="63" r="1.3" fill="#dfb48a" stroke="none"/><circle cx="79" cy="63" r="1.3" fill="#dfb48a" stroke="none"/>
    <ellipse cx="34" cy="70" rx="8" ry="5" fill="#f28c81" opacity=".72" stroke="none"/><ellipse cx="86" cy="70" rx="8" ry="5" fill="#f28c81" opacity=".72" stroke="none"/>
    <path d="M59 64 Q56 68 61 68" fill="none" stroke="#d99b72" stroke-width="2"/>
    <path d="M51 74 Q60 80 69 74 Q68 86 60 86 Q52 85 51 74Z" fill="#7c4540" stroke-width="2"/><path d="M55 82 Q60 78 65 82 L63 85 H57Z" fill="#f79591" stroke="none"/>
    ${king ? '<path d="M48 71 Q54 67 59 71 M61 71 Q67 67 72 71" fill="none" stroke-width="2.4"/><circle cx="67" cy="109" r="7.5" fill="#ffda65" stroke-width="2"/><path d="M65 106 L70 111 M70 106 L65 111" stroke="#c88435" stroke-width="1.8"/>' : lady ? '<path d="M70 105 L79 101 L80 112 L70 108 L64 114 L63 104Z" fill="#ffdd77" stroke-width="1.8"/>' : '<path d="M67 105 H80 V112 H67Z" fill="#ffe0a0" stroke-width="1.8"/>'}
  </g>
  </svg>`;
}

export function workshopSVG() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 480" role="img" aria-label="청자와 가마가 있는 고려 도공의 작업실" class="workshop-svg">
  <defs><linearGradient id="ws-wall" x2="0" y2="1"><stop stop-color="#f4e8ce"/><stop offset="1" stop-color="#e8d7b3"/></linearGradient><linearGradient id="ws-pot" x2="1" y2=".2"><stop stop-color="#4c7b63"/><stop offset=".45" stop-color="#c3d9ad"/><stop offset="1" stop-color="#5e8b72"/></linearGradient><linearGradient id="ws-fire" x2="0" y2="1"><stop stop-color="#ffdc90"/><stop offset="1" stop-color="#c5713e"/></linearGradient></defs>
  <rect width="1000" height="480" rx="28" fill="url(#ws-wall)"/>
  <path d="M0 352 H1000 V480 H0Z" fill="#c8a577"/><path d="M0 386 H1000 M0 426 H1000 M0 466 H1000 M160 353 L116 480 M360 353 L344 480 M640 353 L656 480 M840 353 L884 480" stroke="#b08a5b" stroke-width="2" opacity=".45"/>
  <path d="M30 0 V357 M970 0 V357 M0 39 H1000 M0 346 H1000" stroke="#8e714b" stroke-width="18"/><path d="M30 0 V357 M970 0 V357 M0 39 H1000" stroke="#b59562" stroke-width="4" opacity=".55"/>
  <g transform="translate(401 73)"><rect width="185" height="155" rx="3" fill="#ab9270"/><rect x="9" y="9" width="167" height="137" fill="#d9e3c5"/><path d="M10 116 Q55 65 95 95 Q133 46 176 83 V147 H10" fill="#91ae90"/><path d="M10 137 Q80 99 176 126 V147 H10" fill="#678b75"/><path d="M62 9 V146 M123 9 V146 M9 53 H176 M9 100 H176" stroke="#ab9270" stroke-width="6"/></g>
  <g stroke="#735d41" stroke-width="3" stroke-linejoin="round"><path d="M86 111 H317 V305 H86Z" fill="#ba9667"/><path d="M96 121 H306 V294 H96Z" fill="#816c4e"/><path d="M87 194 H317 M87 300 H317" stroke="#c5a372" stroke-width="10"/>
  <g fill="url(#ws-pot)"><path d="M120 148 L138 148 C138 163 153 167 149 180 Q129 190 109 180 C105 167 120 163 120 148Z"/><path d="M189 136 L210 136 L208 151 Q235 163 223 183 Q200 191 178 183 Q166 163 191 151Z"/><path d="M258 159 Q277 166 292 158 L289 181 Q274 189 260 181Z"/><path d="M116 252 Q143 263 169 251 L167 284 Q142 296 119 284Z"/><path d="M212 227 L231 227 L229 242 C255 260 247 281 235 286 H207 C191 277 194 258 214 242Z"/><path d="M268 261 Q282 250 295 261 L299 284 Q280 293 264 284Z"/></g><g stroke="#e6edd0" fill="none" stroke-width="1.4"><path d="M119 174 Q128 162 138 174 M190 171 Q201 155 212 172 M121 271 Q142 279 161 270 M210 267 Q221 253 235 269"/></g></g>
  <g transform="translate(701 150)"><path d="M-15 191 V78 Q-7 18 70 0 Q140 18 155 78 V191Z" fill="#b18b62" stroke="#866545" stroke-width="4"/><path d="M-7 77 H147 M-15 113 H155 M-15 151 H155 M17 44 H120 M30 113 V151 M104 113 V151 M66 44 V77 M22 77 V113 M113 77 V113" stroke="#8f6b4a" stroke-width="3"/><path d="M30 191 V145 Q32 107 70 105 Q108 109 111 145 V191Z" fill="#574a37" stroke="#d3ae7c" stroke-width="7"/><path d="M49 186 Q38 172 54 148 Q54 164 66 157 Q67 137 81 132 Q76 158 92 164 Q106 176 92 186Z" fill="url(#ws-fire)"/><path d="M59 188 Q57 172 72 161 Q71 176 83 178 L80 188Z" fill="#f7d899"/><path d="M39 193 H102" stroke="#503e2c" stroke-width="7"/></g>
  <ellipse cx="481" cy="425" rx="171" ry="22" fill="#765b3c" opacity=".17"/><path d="M340 325 L331 439 H355 L368 337 M600 325 L610 439 H588 L575 337" fill="#886744"/><path d="M308 299 L602 299 L638 329 L326 337Z" fill="#c89b65" stroke="#8b6b47" stroke-width="3"/><path d="M326 337 L638 329 V346 L326 356Z" fill="#a77b4b"/>
  <g fill="url(#ws-pot)" stroke="#58755b" stroke-width="2"><path d="M451 218 L480 218 L477 237 Q518 265 498 299 Q465 313 433 299 Q416 263 455 237Z"/><ellipse cx="466" cy="217" rx="16" ry="5"/></g><path d="M441 269 Q453 248 462 270 Q476 247 490 266 M439 286 Q466 299 493 285" stroke="#edf1d9" stroke-width="3" fill="none"/>
  <ellipse cx="374" cy="310" rx="29" ry="9" fill="#a57a50"/><path d="M351 306 Q373 288 396 306" fill="#d8b487"/><path d="M536 308 L577 275 M546 311 L584 283" stroke="#71513c" stroke-width="5" stroke-linecap="round"/><path d="M576 276 L586 265 M583 284 L594 275" stroke="#d7c2a0" stroke-width="8"/>
  <path d="M82 343 Q72 310 78 280 M80 320 Q55 306 54 289 M80 307 Q105 289 107 274" fill="none" stroke="#779168" stroke-width="6" stroke-linecap="round"/><path d="M54 342 H104 L99 388 Q78 398 59 387Z" fill="#a27d54"/>
  <g fill="#fff5d9" opacity=".75"><circle cx="360" cy="95" r="2"/><circle cx="645" cy="135" r="2"/><circle cx="654" cy="253" r="2"/><circle cx="337" cy="238" r="2"/></g>
  </svg>`;
}
