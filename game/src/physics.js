// Vector Protocol — physics helpers: AABB collide-and-slide, raycast vs AABB set.
// All math closed-form against the map's box list; no three.js Raycaster in hot paths.

export function aabbCollide(pos, radius, height, colliders) {
  // pos = feet position. Resolve XZ penetration against each box, then step-up allowance.
  const feetY = pos.y;
  const headY = pos.y + height;
  for (const c of colliders) {
    if (headY <= c.min[1] || feetY >= c.max[1]) continue; // vertical no-overlap
    const closestX = Math.max(c.min[0], Math.min(pos.x, c.max[0]));
    const closestZ = Math.max(c.min[2], Math.min(pos.z, c.max[2]));
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const d2 = dx * dx + dz * dz;
    if (d2 > radius * radius) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      const push = radius - d;
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    } else {
      // center inside box: push out along smallest axis
      const pushXMin = pos.x - c.min[0] + radius;
      const pushXMax = c.max[0] - pos.x + radius;
      const pushZMin = pos.z - c.min[2] + radius;
      const pushZMax = c.max[2] - pos.z + radius;
      const m = Math.min(pushXMin, pushXMax, pushZMin, pushZMax);
      if (m === pushXMin) pos.x = c.min[0] - radius;
      else if (m === pushXMax) pos.x = c.max[0] + radius;
      else if (m === pushZMin) pos.z = c.min[2] - radius;
      else pos.z = c.max[2] + radius;
    }
  }
}

export function groundHeightAt(x, z, fromY, colliders) {
  // Highest box top at or below fromY+step within the XZ footprint (radius approximated by center).
  let best = 0;
  for (const c of colliders) {
    if (x < c.min[0] - 0.3 || x > c.max[0] + 0.3 || z < c.min[2] - 0.3 || z > c.max[2] + 0.3) continue;
    if (c.max[1] <= fromY + 0.55 && c.max[1] > best) best = c.max[1];
  }
  return best;
}

// Ray vs AABB slab test. Returns distance or Infinity. o=origin, d=direction (normalized), maxDist.
export function rayBox(o, d, min, max, maxDist) {
  let tmin = 0, tmax = maxDist;
  for (let i = 0; i < 3; i++) {
    const di = d[i], oi = o[i];
    if (Math.abs(di) < 1e-9) {
      if (oi < min[i] || oi > max[i]) return Infinity;
    } else {
      let t1 = (min[i] - oi) / di;
      let t2 = (max[i] - oi) / di;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

export function raycastWorld(o, d, maxDist, colliders) {
  let best = maxDist;
  for (const c of colliders) {
    const t = rayBox([o.x, o.y, o.z], [d.x, d.y, d.z], c.min, c.max, best);
    if (t < best) best = t;
  }
  return best;
}

export function raySphere(o, d, center, radius) {
  // center: {x,y,z}; returns t or Infinity
  const ox = o.x - center.x, oy = o.y - center.y, oz = o.z - center.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  const t1 = -b - sq;
  if (t1 > 0) return t1;
  const t2 = -b + sq;
  return t2 > 0 ? t2 : Infinity;
}

export function rayCylinderY(o, d, cx, cz, baseY, height, radius) {
  // vertical capsule approx: infinite cylinder clamped to [baseY, baseY+height]
  const ox = o.x - cx, oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) {
    // vertical ray: hit only if inside column and y-range overlaps
    if (ox * ox + oz * oz > radius * radius) return Infinity;
    // find entry into y slab
    const t = d.y > 0 ? (baseY - o.y) / d.y : (baseY + height - o.y) / d.y;
    return t > 0 ? t : Infinity;
  }
  const b = ox * d.x + oz * d.z;
  const c = ox * ox + oz * oz - radius * radius;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / a;
  if (t < 0) t = (-b + sq) / a;
  if (t < 0) return Infinity;
  const y = o.y + d.y * t;
  if (y >= baseY && y <= baseY + height) return t;
  return Infinity;
}

// Segment (o -> o + d*t) vs moving sphere for grenades vs actors: simple sphere test each step.
export function segSphere(o, end, center, radius) {
  const dx = end.x - o.x, dy = end.y - o.y, dz = end.z - o.z;
  const fx = center.x - o.x, fy = center.y - o.y, fz = center.z - o.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 1e-9 ? (fx * dx + fy * dy + fz * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = o.x + dx * t - center.x;
  const py = o.y + dy * t - center.y;
  const pz = o.z + dz * t - center.z;
  return px * px + py * py + pz * pz <= radius * radius;
}
