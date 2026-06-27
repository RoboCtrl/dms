/**
 * Camera + Data Matrix decode loop using the vendored ZXing-js UMD global.
 * Owns the live video stream and a camera on/off toggle, keeps the stream
 * running after a recognition (pausing only result *processing*), overlays the
 * frozen frame at 50% opacity with a highlight polygon, shows a placement
 * reticle while scanning, and throttles duplicate recordings via a cooldown
 * gate. Emits recognised content via the onRecognized callback.
 */

/* global ZXing */

import { setIcon } from "./util/icon.js";
import { createScanGate } from "./util/scan-gate.js";

/**
 * Create the scanner controller.
 * @param {object} opts
 * @param {(content: string) => void} opts.onRecognized - Called when a code is recognised and recorded.
 * @param {object} opts.settings - Settings instance for reading/persisting cameraOn.
 * @returns {{start: () => Promise<void>}}
 */
export function createScanner({ onRecognized, settings }) {
  const panel = document.getElementById("camera-panel");
  const video = document.getElementById("video");
  const freeze = document.getElementById("freeze");
  const overlay = document.getElementById("overlay");
  const content = document.getElementById("scan-content");
  const errorBox = document.getElementById("camera-error");
  const camBtn = document.getElementById("camera-btn");
  const camOff = document.getElementById("camera-off");
  const camOffIcon = camOff.querySelector(".cam-off-icon");
  const reticle = document.getElementById("reticle");

  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.DATA_MATRIX,
  ]);
  const reader = new ZXing.BrowserMultiFormatReader(hints);
  const gate = createScanGate(2000);

  let frozen = false;
  let cameraOn = settings.get().cameraOn;

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
   * The freeze layer is rendered at 50% opacity (via CSS) so the live feed
   * shows through; the overlay polygon stays full opacity.
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

  /** Clear the frozen overlay and resume processing (camera never stopped). */
  function resume() {
    if (!frozen) return;
    frozen = false;
    freeze.hidden = true;
    overlay.hidden = true;
    content.hidden = true;
  }

  /** Start the continuous decode loop on the rear camera. */
  async function startDecode() {
    try {
      await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        video,
        (result) => {
          if (!result || frozen) return;
          const text = result.getText();
          // Throttle duplicate recordings; skip entirely if within cooldown.
          if (!gate.accept(text, Date.now())) return;
          frozen = true;
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

  /**
   * Turn the camera on or off, persist the choice, and update the UI: when off,
   * stop the stream and show the dark camera-off screen; when on, restart the
   * decode loop and show the placement reticle.
   * @param {boolean} on - Desired camera state.
   */
  async function setCamera(on) {
    cameraOn = on;
    settings.setCameraOn(on);
    setIcon(camBtn, on ? "camera" : "camera-off");
    if (on) {
      camOff.hidden = true;
      reticle.hidden = false;
      await startDecode();
    } else {
      reader.reset();
      resume();
      reticle.hidden = true;
      camOff.hidden = false;
    }
  }

  panel.addEventListener("click", (e) => {
    // Ignore clicks on the control buttons themselves.
    if (e.target.closest(".cam-ctrl")) return;
    if (frozen) resume();
  });

  camBtn.addEventListener("click", () => setCamera(!cameraOn));

  return {
    /** Start the scanner, honoring the persisted camera on/off state. */
    async start() {
      setIcon(camOffIcon, "camera-off");
      await setCamera(cameraOn);
    },
  };
}
