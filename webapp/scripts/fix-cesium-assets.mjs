import fs from "fs";
import path from "path";

// vite-plugin-cesium double-applies vite.config.js's `base` when copying
// Cesium's static assets during build: it writes them to
// dist/<base>/cesium/ (respecting `base`), but the HTML/JS look for them
// at <base>/cesium/ relative to the site root, i.e. dist/cesium/. Move
// them to where they're actually served from.
const distDir = path.resolve(process.cwd(), "dist");
const basePrefix = "FlightPathSim";
const misplaced = path.join(distDir, basePrefix, "cesium");
const correct = path.join(distDir, "cesium");

if (fs.existsSync(misplaced)) {
  fs.rmSync(correct, { recursive: true, force: true });
  fs.renameSync(misplaced, correct);

  const baseDir = path.join(distDir, basePrefix);
  if (fs.existsSync(baseDir) && fs.readdirSync(baseDir).length === 0) {
    fs.rmdirSync(baseDir);
  }

  console.log(`Moved Cesium assets: ${misplaced} -> ${correct}`);
} else if (!fs.existsSync(correct)) {
  throw new Error(
    `Expected Cesium assets at ${misplaced} or ${correct}, found neither`,
  );
}
