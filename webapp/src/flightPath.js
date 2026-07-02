import {
  chooseStepM,
  densifyPath,
  computeHeadings,
  smoothHeadings,
} from "./geometry.js";

const BASE_DURATION = 0.12;
const SPEED_MULTIPLIER = 1.75;

// Builds a single flat trajectory (matches generate_tour.py's dense_points /
// dense_headings) plus a cumulative timestamp per sample so the viewer can
// animate the camera at a real pace instead of just stepping frame-by-frame.
export function buildFlightPath(segments) {
  const usable = segments.filter((seg) => seg.length >= 2);
  if (usable.length === 0) {
    throw new Error("Flight path needs at least one segment with 2+ points");
  }

  const stepM = chooseStepM(usable);
  const perPointDuration = BASE_DURATION / SPEED_MULTIPLIER;

  const points = [];
  const headings = [];

  for (const seg of usable) {
    const dense = densifyPath(seg, stepM);
    const h = smoothHeadings(computeHeadings(dense), 0.25);
    points.push(...dense);
    headings.push(...h);
  }

  const samples = points.map(([lat, lon, alt], i) => ({
    lat,
    lon,
    alt,
    heading: headings[i],
    t: i * perPointDuration,
  }));

  return {
    samples,
    stepM,
    totalDuration: samples[samples.length - 1].t,
  };
}
