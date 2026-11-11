// Words sit close together: two pixels between their boxes.
export const CLOUD_GAP = 2;
const GAP = CLOUD_GAP;
const overlaps = (a, b) => a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y;

// A deterministic elliptical spiral keeps common words central, without rotating Korean text. Each word takes the
// first free place along the spiral and is then drawn in toward the middle as far as it goes, so the words sit close
// together instead of leaving the spaces the spiral steps over.
export function placeCloudWords(boxes, width, height) {
  const placed = [], limit = Math.ceil(Math.hypot(width / 2, height / 1.32) / .28) + 1;
  const free = candidate => candidate.x >= 0 && candidate.y >= 0 && candidate.x + candidate.width <= width && candidate.y + candidate.height <= height
    && !placed.some(other => overlaps(candidate, other));
  for (const box of [...boxes].sort((a, b) => b.size - a.size || a.index - b.index)) {
    const centerX = Math.round(width / 2 - box.width / 2), centerY = Math.round(height / 2 - box.height / 2);
    let found;
    for (let step = 0; step < limit; step++) {
      const angle = step * .1, radius = angle * 2.8;
      const candidate = {...box, x: Math.round(centerX + Math.cos(angle) * radius), y: Math.round(centerY + Math.sin(angle) * radius * .66)};
      if (free(candidate)) {found = candidate; break;}
    }
    if (!found) return null;
    for (let moved = true, guard = width + height; moved && guard > 0; guard--) {
      moved = false;
      for (const next of [{...found, x: found.x + Math.sign(centerX - found.x)}, {...found, y: found.y + Math.sign(centerY - found.y)}]) {
        if ((next.x !== found.x || next.y !== found.y) && free(next)) {found = next; moved = true;}
      }
    }
    placed.push(found);
  }
  return placed;
}

// `fill`: the cloud is the only thing in its box (워드 클라우드만 크게 보기), so the words are drawn as large as fits
// the box instead of at their usual sizes, and the box never grows.
export function mountWordCloud(container, {fill = false} = {}) {
  const words = [...container.children].filter(element => element.matches('span:not(.empty)'));
  if (!words.length) return {dispose() {}};
  const originals = words.map(element => element.getAttribute('style'));
  const originalContainer = container.getAttribute('style');
  const sizes = words.map(element => Math.max(14, parseFloat(getComputedStyle(element).fontSize) || 24));
  const smallest = Math.min(...sizes), largest = Math.max(...sizes);
  let disposed = false, frame = 0, lastWidth = 0, lastMinimum = 0;
  container.classList.add('cloud-positioned');
  Object.assign(container.style, {position: 'relative', display: 'block'});
  words.forEach(element => {
    element.classList.add('cloud-word');
    Object.assign(element.style, {position: 'absolute', width: 'max-content', whiteSpace: 'normal',
      overflowWrap: 'anywhere', wordBreak: 'keep-all', margin: '0', visibility: 'hidden'});
  });

  function measure(width, scale) {
    const minimum = Math.max(14, Math.round(smallest * scale));
    const maximum = smallest === largest ? minimum : Math.max(minimum * 2, Math.round(largest * scale));
    words.forEach((element, index) => {
      // Retain an obvious frequency difference while fitting; equal counts stay equal.
      const weight = largest === smallest ? 0 : (sizes[index] - smallest) / (largest - smallest);
      element.style.fontSize = `${Math.round(minimum + weight * (maximum - minimum))}px`;
      element.style.maxWidth = `${Math.max(1, Math.floor(width * (element.textContent.trim().length > 10 ? .38 : .72)))}px`;
      element.style.left = '0';element.style.top = '0';
    });
    return words.map((element, index) => {const bounds = element.getBoundingClientRect();return {index,
      size: parseFloat(element.style.fontSize), width: Math.ceil(bounds.width), height: Math.ceil(bounds.height)};});
  }
  function layout() {
    frame = 0;
    if (disposed || !container.isConnected || !container.clientWidth) return;
    const style = getComputedStyle(container), left = parseFloat(style.paddingLeft) || 0,
      right = parseFloat(style.paddingRight) || 0, top = parseFloat(style.paddingTop) || 0, bottom = parseFloat(style.paddingBottom) || 0;
    const width = Math.max(1, container.clientWidth - left - right);
    const minimum = Math.max(240, parseFloat(style.minHeight) || 0);
    lastWidth = container.clientWidth;lastMinimum = minimum;
    let height = minimum - top - bottom, positions, boxes;
    // Filling a box: from words half the box tall downwards (the usual sizes are for a board about 430px tall).
    const steps = [1, .88, .77, .67, .58, .5, .43, .37, .31, .26, .22, .18, .15, .12, .1, .08];
    for (const scale of fill ? steps.map(step => step * height / 144) : [1, .86, .72, .6, .5, .4, .3, .2]) {
      boxes = measure(width, scale);
      positions = placeCloudWords(boxes, width, height);
      if (positions) break;
    }
    // Dense boards grow instead of hiding less-common answers or shrinking below 14px.
    for (let attempt = 0; !fill && !positions && attempt < 8; attempt++) {
      height = Math.ceil(height * 1.4);
      positions = placeCloudWords(boxes, width, height);
    }
    if (!positions) {
      let y = 0;
      positions = boxes.map(box => {const item = {...box, x: Math.max(0, (width - box.width) / 2), y};y += box.height + GAP;return item;});
      height = Math.max(height, y);
    }
    container.style.height = `${height + top + bottom}px`;
    for (const position of positions) Object.assign(words[position.index].style,
      {left: `${left + position.x}px`, top: `${top + position.y}px`, visibility: 'visible'});
    container.dataset.cloudLayout = 'ready';
  }
  function schedule() {if (!disposed && !frame) frame = requestAnimationFrame(layout);}
  const observer = new ResizeObserver(() => {
    const minimum = Math.max(240, parseFloat(getComputedStyle(container).minHeight) || 0);
    if (Math.abs(container.clientWidth - lastWidth) > 1 || minimum !== lastMinimum) schedule();
  });
  observer.observe(container);
  schedule();
  document.fonts?.ready.then(schedule);
  return {dispose() {
    if (disposed) return;disposed = true;cancelAnimationFrame(frame);observer.disconnect();
    container.classList.remove('cloud-positioned');delete container.dataset.cloudLayout;
    if (originalContainer === null) container.removeAttribute('style');else container.setAttribute('style', originalContainer);
    words.forEach((element, index) => {element.classList.remove('cloud-word');
      if (originals[index] === null) element.removeAttribute('style');else element.setAttribute('style', originals[index]);});
  }};
}
