import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

// Project is served from https://<user>.github.io/FlightPathSim/ by GitHub
// Pages, so asset URLs need that subpath baked in at build time.
export default defineConfig({
  base: "/FlightPathSim/",
  plugins: [cesium()],
});
