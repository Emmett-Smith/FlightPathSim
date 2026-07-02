import * as Cesium from "cesium";

// Cesium ion's default access token is a shared demo token (rate-limited,
// fine for local dev/testing). For a real deployed site, get a free token
// at https://ion.cesium.com/tokens and set it here or via an env var.
Cesium.Ion.defaultAccessToken =
  import.meta.env.VITE_CESIUM_ION_TOKEN || Cesium.Ion.defaultAccessToken;

export async function createViewer(containerId) {
  const viewer = new Cesium.Viewer(containerId, {
    terrain: Cesium.Terrain.fromWorldTerrain(),
    animation: false,
    timeline: false,
    baseLayerPicker: true,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
  });

  viewer.scene.globe.depthTestAgainstTerrain = true;
  return viewer;
}

function circularLerp(a, b, t) {
  const diff = (((b - a + 540) % 360) - 180) * t;
  return (a + diff + 360) % 360;
}

function lerpSample(s0, s1, t) {
  const span = s1.t - s0.t;
  const frac = span > 0 ? (t - s0.t) / span : 0;
  return {
    lat: s0.lat + (s1.lat - s0.lat) * frac,
    lon: s0.lon + (s1.lon - s0.lon) * frac,
    alt: s0.alt + (s1.alt - s0.alt) * frac,
    heading: circularLerp(s0.heading, s1.heading, frac),
  };
}

// Drives the Cesium camera first-person along the flight path: the camera
// IS the drone, looking in the direction of travel with a slight downward
// pitch, rather than orbiting a target the way the KML gx:Tour LookAt does.
export class FlightAnimator {
  constructor(viewer, samples, { pitchDeg = -8 } = {}) {
    this.viewer = viewer;
    this.samples = samples;
    this.pitchDeg = pitchDeg;
    this.totalDuration = samples[samples.length - 1].t;

    this.playing = false;
    this.elapsed = 0;
    this.speed = 1;
    this.lastFrameTime = null;
    this.onTick = null;
    this.onEnd = null;

    this._raf = this._raf.bind(this);
    this.seek(0);
  }

  _sampleAt(t) {
    const samples = this.samples;
    if (t <= samples[0].t) return samples[0];
    if (t >= samples[samples.length - 1].t) return samples[samples.length - 1];

    let lo = 0;
    let hi = samples.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].t <= t) lo = mid;
      else hi = mid;
    }
    return lerpSample(samples[lo], samples[hi], t);
  }

  _applyCamera(sample) {
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        sample.lon,
        sample.lat,
        sample.alt,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(sample.heading),
        pitch: Cesium.Math.toRadians(this.pitchDeg),
        roll: 0,
      },
    });
  }

  seek(t) {
    this.elapsed = Math.max(0, Math.min(t, this.totalDuration));
    this._applyCamera(this._sampleAt(this.elapsed));
    this.onTick?.(this.elapsed, this.totalDuration);
  }

  play() {
    if (this.playing) return;
    if (this.elapsed >= this.totalDuration) this.elapsed = 0;
    this.playing = true;
    this.lastFrameTime = null;
    requestAnimationFrame(this._raf);
  }

  pause() {
    this.playing = false;
  }

  setSpeed(multiplier) {
    this.speed = multiplier;
  }

  _raf(now) {
    if (!this.playing) return;
    if (this.lastFrameTime === null) this.lastFrameTime = now;
    const dt = ((now - this.lastFrameTime) / 1000) * this.speed;
    this.lastFrameTime = now;

    this.elapsed = Math.min(this.elapsed + dt, this.totalDuration);
    this._applyCamera(this._sampleAt(this.elapsed));
    this.onTick?.(this.elapsed, this.totalDuration);

    if (this.elapsed >= this.totalDuration) {
      this.playing = false;
      this.onEnd?.();
      return;
    }
    requestAnimationFrame(this._raf);
  }
}
