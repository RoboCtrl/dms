/**
 * Camera + Data Matrix decode loop using the vendored ZXing-js UMD global.
 * Owns the live video stream, freezes the frame and draws a highlight polygon
 * on recognition, and resumes scanning when the camera panel is tapped. Emits
 * recognised content via the onRecognized callback.
 */

/* global ZXing */

/**
 * Create the scanner controller.
 * @param {object} opts
 * @param {(content: string) => void} opts.onRecognized - Called after a code is recognised and frozen.
 * @returns {{start: () => Promise<void>}}
 */
export function createScanner({ onRecognized }) {
  const panel = document.getElementById("camera-panel");
  const video = document.getElementById("video");
  const freeze = document.getElementById("freeze");
  const overlay = document.getElementById("overlay");
  const content = document.getElementById("scan-content");
  const errorBox = document.getElementById("camera-error");

  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.DATA_MATRIX,
  ]);
  const reader = new ZXing.BrowserMultiFormatReader(hints);

  let frozen = false;

  /**
   * Show a camera error message in place of the video.
   * @param {string} message - The message to display.
   */
  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  /**
   * Draw the frozen frame and a highlight polygon around the recognised code.
   * @param {Array<{getX:()=>number,getY:()=>number}>} points - ZXing result points (video-pixel coords).
   */
  function drawFreeze(points) {
    const w = video.videoWidth;
    const h = video.videoHeight;
    for (const c of [freeze, overlay]) {
      c.width = w;
      c.height = h;
      c.hidden = false;
    }
    freeze.getContext("2d").drawImage(video, 0, 0, w, h);

    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "#4caf50";
    ctx.lineWidth = Math.max(3, w * 0.01);
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = p.getX();
      const y = p.getY();
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  /** Resume live scanning by clearing the freeze and restarting decode. */
  async function resume() {
    if (!frozen) return;
    frozen = false;
    freeze.hidden = true;
    overlay.hidden = true;
    content.hidden = true;
    await startDecode();
  }

  /** Start the continuous decode loop on the rear camera. */
  async function startDecode() {
    try {
      await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        video,
        (result) => {
          if (!result || frozen) return;
          frozen = true;
          reader.reset();
          const text = result.getText();
          drawFreeze(result.getResultPoints());
          content.textContent = text;
          content.hidden = false;
          onRecognized(text);
        },
      );
    } catch (err) {
      showError(
        "Camera unavailable. Grant camera permission and use HTTPS or localhost. (" +
          (err?.name || err) +
          ")",
      );
    }
  }

  panel.addEventListener("click", () => {
    if (frozen) resume();
  });

  return {
    /** Start the scanner. */
    async start() {
      await startDecode();
    },
  };
}
