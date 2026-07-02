// Same math as generate_tour.py: bearing/distance on a spherical earth,
// linear interpolation between waypoints, and exponential heading smoothing.

const R_EARTH = 6371000; // meters

export function bearing(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);

  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function distance(lat1, lon1, lat2, lon2) {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const dPhi = ((lat2 - lat1) * Math.PI) / 180;
  const dLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;

  return 2 * R_EARTH * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function interpolate(p1, p2, stepM) {
  const [lat1, lon1, alt1] = p1;
  const [lat2, lon2, alt2] = p2;

  const d = distance(lat1, lon1, lat2, lon2);
  const steps = Math.max(Math.round(d / stepM), 1);

  const result = [];
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    result.push([
      lat1 + (lat2 - lat1) * t,
      lon1 + (lon2 - lon1) * t,
      alt1 + (alt2 - alt1) * t,
    ]);
  }
  return result;
}

export function densifyPath(points, stepM) {
  const dense = [];
  for (let i = 0; i < points.length - 1; i++) {
    dense.push(...interpolate(points[i], points[i + 1], stepM));
  }
  dense.push(points[points.length - 1]);
  return dense;
}

export function computeHeadings(points) {
  const headings = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [lat1, lon1] = points[i];
    const [lat2, lon2] = points[i + 1];
    headings.push(bearing(lat1, lon1, lat2, lon2));
  }
  headings.push(headings[headings.length - 1]);
  return headings;
}

export function smoothHeadings(values, alpha = 0.25) {
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    // Headings wrap at 360; blend across the shorter arc so 359 -> 1
    // smooths through 0 instead of swinging the long way around.
    const prev = out[i - 1];
    let diff = values[i] - prev;
    diff = ((diff + 540) % 360) - 180;
    out.push((prev + alpha * diff + 360) % 360);
  }
  return out;
}

export function totalPathLength(segments) {
  let total = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.length - 1; i++) {
      total += distance(seg[i][0], seg[i][1], seg[i + 1][0], seg[i + 1][1]);
    }
  }
  return total;
}

const MAX_TOTAL_POINTS = 5000;
const MIN_STEP_M = 5.0;

export function chooseStepM(segments) {
  const length = totalPathLength(segments);
  return Math.max(MIN_STEP_M, length / MAX_TOTAL_POINTS);
}
