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
  const robe = king ? '#a74f3b' : lady ? '#b78371' : '#557d82';
  const bg = king ? '#ead8b0' : lady ? '#e6d6cc' : '#d7e4d7';
  const hat = king
    ? '<path d="M39 39 L36 18 Q60 9 84 18 L81 39Z" fill="#253b34"/><path d="M38 25 L21 20 L20 28 L39 32 M82 25 L99 20 L100 28 L81 32" fill="#253b34"/><path d="M40 32 H81" stroke="#d4b572" stroke-width="4"/><circle cx="60" cy="27" r="4" fill="#d4b572"/>'
    : lady
      ? '<path d="M35 45 Q28 17 60 18 Q92 17 85 45 L77 32 Q64 41 43 31Z" fill="#333a32"/><ellipse cx="60" cy="17" rx="15" ry="9" fill="#333a32"/><path d="M37 25 L86 20" stroke="#b89b5e" stroke-width="3"/><circle cx="87" cy="20" r="4" fill="#e0b9a2"/>'
      : '<path d="M36 39 L39 16 Q59 9 80 16 L84 39Z" fill="#304b47"/><path d="M38 29 Q60 36 82 29" stroke="#9bb6a6" stroke-width="2"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${Math.max(24, finite(size,100))}" height="${Math.max(24, finite(size,100))}" role="img" aria-label="${king ? '왕' : lady ? '귀족 손님' : '귀족 손님'}" class="customer-svg">
    <circle cx="60" cy="60" r="57" fill="${bg}"/>
    <path d="M20 118 L25 93 Q31 78 46 78 H74 Q90 78 96 93 L102 118" fill="${robe}" stroke="#465844" stroke-width="2"/>
    <path d="M46 77 L60 94 L75 77 L79 84 L61 108 L41 84Z" fill="#f5ead2"/>
    <path d="M60 94 L50 118 M61 108 L76 118" stroke="#e2c29c" stroke-width="2"/>
    <rect x="51" y="66" width="18" height="17" rx="6" fill="#dca77d"/>
    <ellipse cx="35" cy="52" rx="5" ry="8" fill="#e4b48c"/><ellipse cx="85" cy="52" rx="5" ry="8" fill="#e4b48c"/>
    <path d="M36 36 Q60 23 84 36 L82 59 Q79 78 60 81 Q41 78 38 59Z" fill="#f2c9a0" stroke="#a57e58" stroke-width="1.4"/>
    ${hat}
    <path d="M45 47 Q49 44 54 47 M66 47 Q71 44 76 47" stroke="#544635" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M47 53 Q50 50 53 53 M67 53 Q70 50 73 53" stroke="#443e32" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="44" cy="59" rx="5" ry="3" fill="#d98d74" opacity=".4"/><ellipse cx="76" cy="59" rx="5" ry="3" fill="#d98d74" opacity=".4"/>
    <path d="M59 54 L57 61 H61" fill="none" stroke="#c3916e" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M54 68 Q60 72 67 67" stroke="#8f5645" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${king ? '<path d="M49 66 Q55 61 60 66 Q66 61 71 66 M52 75 Q60 89 68 75" stroke="#5c4c39" stroke-width="2" fill="none"/><circle cx="60" cy="112" r="8" fill="#d8b86f"/><path d="M57 109 L63 115 M63 109 L57 115" stroke="#986e42" stroke-width="1.4"/>' : ''}
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
