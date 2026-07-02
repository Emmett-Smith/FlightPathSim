// Captures the Cesium canvas directly via MediaRecorder — no server, no
// ffmpeg. Output is .webm, which every major browser can record natively.
export class CanvasRecorder {
  constructor(canvas, { fps = 30 } = {}) {
    this.canvas = canvas;
    this.fps = fps;
    this.chunks = [];
    this.recorder = null;
  }

  start() {
    const stream = this.canvas.captureStream(this.fps);
    const mimeType = ["video/webm;codecs=vp9", "video/webm"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );

    this.chunks = [];
    this.recorder = new MediaRecorder(stream, { mimeType });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  stop() {
    return new Promise((resolve) => {
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: "video/webm" });
        resolve(blob);
      };
      this.recorder.stop();
    });
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
