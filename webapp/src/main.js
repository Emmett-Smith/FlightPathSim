import "cesium/Build/Cesium/Widgets/widgets.css";
import { extractSegmentsFromFile } from "./kml.js";
import { buildFlightPath } from "./flightPath.js";
import { createViewer, FlightAnimator } from "./viewer.js";
import { CanvasRecorder, downloadBlob } from "./recorder.js";

const dropzone = document.getElementById("dropzone");
const dropzoneLabel = document.getElementById("dropzoneLabel");
const fileInput = document.getElementById("fileInput");
const statusEl = document.getElementById("status");
const controls = document.getElementById("controls");
const scrub = document.getElementById("scrub");
const timeLabel = document.getElementById("timeLabel");
const playBtn = document.getElementById("playBtn");
const resetBtn = document.getElementById("resetBtn");
const speedSelect = document.getElementById("speedSelect");
const recordBtn = document.getElementById("recordBtn");

let viewer = null;
let animator = null;
let recorder = null;
let scrubbing = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function formatTime(seconds) {
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  const m = Math.floor(seconds / 60);
  return `${m}:${s}`;
}

async function loadFile(file) {
  setStatus(`Parsing ${file.name}...`);
  playBtn.disabled = true;
  recordBtn.disabled = true;

  try {
    const segments = await extractSegmentsFromFile(file);
    const { samples, stepM, totalDuration } = buildFlightPath(segments);

    if (!viewer) {
      viewer = await createViewer("cesiumContainer");
    }

    animator?.pause();
    animator = new FlightAnimator(viewer, samples);
    animator.onTick = (elapsed, total) => {
      if (!scrubbing) scrub.value = String((elapsed / total) * 1000);
      timeLabel.textContent = `${formatTime(elapsed)} / ${formatTime(total)}`;
    };
    animator.onEnd = () => {
      playBtn.textContent = "Play";
    };
    animator.seek(0);

    controls.hidden = false;
    playBtn.disabled = false;
    recordBtn.disabled = false;
    playBtn.textContent = "Play";
    dropzoneLabel.textContent = file.name;

    setStatus(
      `${samples.length.toLocaleString()} points, ${stepM.toFixed(
        1,
      )}m step, ${formatTime(totalDuration)} flight`,
    );
  } catch (err) {
    setStatus(err.message, true);
  }
}

fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

["dragenter", "dragover"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  }),
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  }),
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

playBtn.addEventListener("click", () => {
  if (!animator) return;
  if (animator.playing) {
    animator.pause();
    playBtn.textContent = "Play";
  } else {
    animator.play();
    playBtn.textContent = "Pause";
  }
});

resetBtn.addEventListener("click", () => {
  animator?.pause();
  animator?.seek(0);
  playBtn.textContent = "Play";
});

scrub.addEventListener("input", () => {
  scrubbing = true;
  if (!animator) return;
  const frac = Number(scrub.value) / 1000;
  animator.seek(frac * animator.totalDuration);
});
scrub.addEventListener("change", () => {
  scrubbing = false;
});

speedSelect.addEventListener("change", () => {
  animator?.setSpeed(Number(speedSelect.value));
});

recordBtn.addEventListener("click", async () => {
  if (!animator || !viewer) return;

  if (recorder) {
    // A recording is in progress; ignore repeat clicks until it finishes.
    return;
  }

  animator.pause();
  animator.seek(0);

  recorder = new CanvasRecorder(viewer.canvas);
  recorder.start();
  recordBtn.classList.add("recording");
  recordBtn.textContent = "Recording...";
  playBtn.disabled = true;
  scrub.disabled = true;

  animator.onEnd = async () => {
    const blob = await recorder.stop();
    downloadBlob(blob, "flightvid-tour.webm");
    recorder = null;
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "Record flight (.webm)";
    playBtn.disabled = false;
    playBtn.textContent = "Play";
    scrub.disabled = false;
  };

  animator.play();
});
