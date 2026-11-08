const GAP = 6;
const overlaps = (a, b) => a.x < b.x + b.width + GAP && a.x + a.width + GAP > b.x && a.y < b.y + b.height + GAP && a.y + a.height + GAP > b.y;

// A deterministic elliptical spiral keeps common words central, without rotating Korean text.
export function placeCloudWords(boxes, width, height) {
  const placed = [], limit = Math.ceil(Math.hypot(width / 2, height / 1.32) / .28) + 1;
  for (const box of [...boxes].sort((a, b) => b.size - a.size || a.index - b.index)) {
    let found;
    for (let step = 0; step < limit; step++) {
      const angle = step * .1, radius = angle * 2.8;
      const candidate = {...box, x: Math.round(width / 2 - box.width / 2 + Math.cos(angle) * radius),
        y: Math.round(height / 2 - box.height / 2 + Math.sin(angle) * radius * .66)};
      if (candidate.x < 0 || candidate.y < 0 || candidate.x + box.width > width || candidate.y + box.height > height) continue;
      if (!placed.some(other => overlaps(candidate, other))) {found = candidate; break;}
    }
    if (!found) return null;
    placed.push(found);
  }
  return placed;
}

export function mountWordCloud(container) {
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
    for (const scale of [1, .86, .72, .6, .5, .4, .3, .2]) {
      boxes = measure(width, scale);
      positions = placeCloudWords(boxes, width, height);
      if (positions) break;
    }
    // Dense boards grow instead of hiding less-common answers or shrinking below 14px.
    for (let attempt = 0; !positions && attempt < 8; attempt++) {
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
