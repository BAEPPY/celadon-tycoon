// Green is a fixed grip, not merely a target crossed by some other clay edge.
// This uses the same physical distance allowance as a 90%-matched green point.
export function settleSculptLocks(points, guide, locked, width, height, acquire = true) {
  const xs = guide.map(p => p[0] * width), ys = guide.map(p => p[1] * height);
  const tolerance = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * .019;
  const fixed = guide.map((goal, i) => locked?.[i] === true || (acquire && Math.hypot((points[i][0] - goal[0]) * width, (points[i][1] - goal[1]) * height) <= tolerance));
  return {locked: fixed, points: points.map((point, i) => [...(fixed[i] ? guide[i] : point)])};
}

export function nextUnlockedSculptPoint(locked, selected, direction = 1) {
  for (let step = 1; step <= locked.length; step++) {
    const index = (selected + direction * step + locked.length) % locked.length;
    if (!locked[index]) return index;
  }
  return selected;
}
