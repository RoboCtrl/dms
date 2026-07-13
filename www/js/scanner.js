/**
 * Camera + Data Matrix decode loop using the vendored ZXing-js UMD global.
 * Owns the live video stream (acquired via getUserMedia) and a camera on/off
 * toggle, and runs its own requestAnimationFrame decode loop that crops each
 * frame to the on-screen reticle region before decoding, so only the indicated
 * area is scanned. Keeps the stream running after a recognition (pausing only
 * result *processing*), overlays the frozen frame through a radial alpha mask
 * centered on the detected code (opaque at the code, transparent towards the
 * edges) with a highlight polygon, discards it with a configurable darken,
 * slide-down, shrink, and fade animation, shows the placement reticle while
 * scanning, and throttles duplicate recordings via a cooldown gate. Emits
 * recognised content via the onRecognized callback.
 *
 * Freeze lifecycle (when to freeze, when to unfreeze, tap-to-continue hint)
 * is delegated to freeze-controller.js; the resume trigger depends on the
 * selected freeze mode (auto, tap, or timer).
 */

/* global ZXing */

import { setIcon } from "./util/icon.js";
import { createScanGate } from "./util/scan-gate.js";
import { createFreezeController } from "./util/freeze-controller.js";
import { computeCropRegion } from "./util/crop-region.js";
import { computeFreezeMask } from "./util/freeze-mask.js";
import { freezeConfigFromSettings } from "./freeze.js";

/**
 * Create the scanner controller.
 * @param {object} opts
 * @param {(content: string) => void} opts.onRecognized - Called when a code is recognised and recorded.
 * @param {object} opts.settings - Settings instance for reading/persisting cameraOn.
 * @returns {{start: () => Promise<void>, refreshFreezeConfig: () => void}}
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
  const tapHint = document.getElementById("tap-hint");

  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.DATA_MATRIX,
  ]);
  const reader = new ZXing.BrowserMultiFormatReader(hints);
  const gate = createScanGate(2000);
  const freezeCtl = createFreezeController(freezeConfigFromSettings(settings.get()));

  // Reticle geometry: side is 60% of the panel width (matches #reticle CSS),
  // grown by 8 on-screen pixels per side before mapping to source pixels.
  const RETICLE_FRACTION = 0.6;
  const RETICLE_PAD = 8;

  // Slack (ms) added to the configured discard duration for the fallback
  // timer that force-hides the freeze layers if transitionend never fires.
  const DISCARD_FALLBACK_SLACK_MS = 50;

  // Reused offscreen canvas the cropped frame is drawn onto before decoding.
  const capture = document.createElement("canvas");
  const captureCtx = capture.getContext("2d", { willReadFrequently: true });

  let frozen = false;
  let transitioning = false;
  let cameraOn = settings.get().cameraOn;
  let stream = null;
  let rafId = 0;
  let discardTimer = 0;

  /**
   * Show a camera error message in place of the video.
   * @param {string} message - The message to display.
   */
  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  /**
   * Translate ZXing result points from cropped-canvas coordinates back to
   * full-frame video coordinates by adding the crop's top-left offset. The
   * freeze/overlay canvases are sized to the full frame, so points must be in
   * full-frame space to line up. Returns lightweight point-likes exposing the
   * same getX/getY interface drawFreeze consumes.
   * @param {Array<{getX:()=>number,getY:()=>number}>} points - Crop-local points.
   * @param {number} dx - Crop left offset in source pixels (sx).
   * @param {number} dy - Crop top offset in source pixels (sy).
   * @returns {Array<{getX:()=>number,getY:()=>number}>} Full-frame point-likes.
   */
  function offsetPoints(points, dx, dy) {
    return points.map((p) => ({
      getX: () => p.getX() + dx,
      getY: () => p.getY() + dy,
    }));
  }

  /**
   * Cancel any in-flight discard animation: clears the pending hide timer and
   * removes the .discarding class from both freeze layers. The CSS transition
   * is defined on .discarding only, so removing the class snaps the layers
   * back to full scale/opacity instantly.
   */
  function cancelDiscard() {
    if (discardTimer) {
      clearTimeout(discardTimer);
      discardTimer = 0;
    }
    freeze.classList.remove("discarding");
    overlay.classList.remove("discarding");
  }

  /**
   * Finish a discard: cancel any animation state and hide both freeze layers.
   * Idempotent — used as the transition-end handler, the timeout fallback,
   * and the instant hide path on camera-off.
   */
  function endDiscard() {
    cancelDiscard();
    freeze.hidden = true;
    overlay.hidden = true;
  }

  /**
   * Draw the frozen frame and a highlight polygon around the recognised code.
   * The freeze layer's alpha channel is shaped by a radial gradient centered
   * on the detected code — opaque at the code, fully transparent at 2/3 of
   * the distance to the farthest visible corner — so the live feed shows
   * through towards the edges. The overlay polygon stays full opacity. Also
   * cancels any discard animation still in flight (a re-freeze interrupts it),
   * records the mask center as the transform-origin both layers shrink
   * towards when discarded, and records the downward travel (--discard-shift)
   * the layers slide on discard.
   * @param {Array<{getX:()=>number,getY:()=>number}>} points - ZXing result points (video-pixel coords).
   */
  function drawFreeze(points) {
    cancelDiscard();
    const w = video.videoWidth;
    const h = video.videoHeight;
    for (const c of [freeze, overlay]) {
      c.width = w;
      c.height = h;
      c.hidden = false;
    }

    const mask = computeFreezeMask({
      points: points.map((p) => ({ x: p.getX(), y: p.getY() })),
      panelW: panel.clientWidth,
      panelH: panel.clientHeight,
      videoW: w,
      videoH: h,
    });
    freeze.style.transformOrigin = `${mask.originX}px ${mask.originY}px`;
    overlay.style.transformOrigin = `${mask.originX}px ${mask.originY}px`;
    const shift = Math.max(0, panel.clientHeight - mask.originY);
    freeze.style.setProperty("--discard-shift", `${shift}px`);
    overlay.style.setProperty("--discard-shift", `${shift}px`);

    const fctx = freeze.getContext("2d");
    fctx.drawImage(video, 0, 0, w, h);
    const grad = fctx.createRadialGradient(mask.cx, mask.cy, 0, mask.cx, mask.cy, mask.radius);
    grad.addColorStop(0, "rgba(0, 0, 0, 1)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    fctx.globalCompositeOperation = "destination-in";
    fctx.fillStyle = grad;
    fctx.fillRect(0, 0, w, h);
    fctx.globalCompositeOperation = "source-over";

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

  /**
   * Discard the frozen overlay and resume processing (the camera never
   * stopped). The decoded-text bar and tap hint hide immediately. When the
   * fade-off animation is enabled, the freeze/overlay layers darken, slide
   * down, shrink, and fade over the configured duration (via --discard-ms)
   * and are hidden once the CSS transition ends, with a timeout fallback in
   * case transitionend never fires; when disabled they hide instantly.
   */
  function resume() {
    if (!frozen) return;
    frozen = false;
    content.hidden = true;
    tapHint.hidden = true;
    const { discardAnimation, discardMs } = freezeConfigFromSettings(settings.get());
    if (!discardAnimation) {
      endDiscard();
      return;
    }
    freeze.style.setProperty("--discard-ms", `${discardMs}ms`);
    overlay.style.setProperty("--discard-ms", `${discardMs}ms`);
    freeze.classList.add("discarding");
    overlay.classList.add("discarding");
    discardTimer = setTimeout(endDiscard, discardMs + DISCARD_FALLBACK_SLACK_MS);
  }

  /**
   * Decode one frame: compute the reticle crop, draw just that region onto the
   * capture canvas, and run ZXing's Data Matrix decoder on it. Returns the
   * result plus the crop offset so the caller can map points to full-frame
   * coordinates. A "not found" frame (no code) returns a null result; ZXing's
   * routine not-found exception is swallowed.
   * @returns {{result: object|null, sx: number, sy: number}}
   */
  function decodeCropFrame() {
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    const { sx, sy, sw, sh } = computeCropRegion({
      panelW: panel.clientWidth,
      panelH: panel.clientHeight,
      videoW,
      videoH,
      fraction: RETICLE_FRACTION,
      padCss: RETICLE_PAD,
    });
    if (capture.width !== sw) capture.width = sw;
    if (capture.height !== sh) capture.height = sh;
    captureCtx.drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);

    let result = null;
    try {
      const source = new ZXing.HTMLCanvasElementLuminanceSource(capture);
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
      result = reader.decodeBitmap(bitmap);
    } catch {
      result = null; // No code in the crop this frame.
    }
    return { result, sx, sy };
  }

  /**
   * Per-frame scan loop. Schedules itself via requestAnimationFrame, decodes
   * the reticle crop, and drives the freeze controller exactly as the old
   * ZXing callback did: freeze + draw + record on a fresh recognition, resume
   * on auto/timer unfreeze. Skips frames until the video reports dimensions.
   */
  function scanLoop() {
    rafId = requestAnimationFrame(scanLoop);
    if (!video.videoWidth || !video.videoHeight) return;

    const { result, sx, sy } = decodeCropFrame();
    const now = Date.now();
    const text = result ? result.getText() : null;
    const action = freezeCtl.onResult(text, now);
    if (action === "freeze") {
      frozen = true;
      drawFreeze(offsetPoints(result.getResultPoints(), sx, sy));
      content.textContent = text;
      content.hidden = false;
      tapHint.hidden = settings.get().freezeMode !== "tap";
      // Throttle duplicate records (e.g. brief flicker re-freeze).
      if (gate.accept(text, now)) onRecognized(text);
    } else if (action === "unfreeze") {
      resume();
    }
  }

  /**
   * Start the rear-camera stream and the decode loop. Acquires the stream
   * directly (so the loop can crop to the reticle), attaches it to the video
   * element, and begins scanning. Camera/permission errors are caught and
   * surfaced via the on-screen error box; this function never throws.
   */
  async function startDecode() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      video.srcObject = stream;
      await video.play();
      scanLoop();
    } catch (err) {
      showError(
        "Camera unavailable. Grant camera permission and use HTTPS or localhost. (" +
          (err?.name || err) +
          ")",
      );
      reticle.hidden = true;
    }
  }

  /**
   * Turn the camera on or off, persist the choice, and update the UI: when off,
   * stop the stream and show the dark camera-off screen; when on, restart the
   * decode loop and show the placement reticle.
   * @param {boolean} on - Desired camera state.
   */
  async function setCamera(on) {
    if (transitioning) return;
    transitioning = true;
    try {
      cameraOn = on;
      settings.setCameraOn(on);
      setIcon(camBtn, on ? "camera" : "camera-off");
      if (on) {
        camOff.hidden = true;
        reticle.hidden = false;
        await startDecode();
      } else {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        if (stream) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
        }
        video.srcObject = null;
        resume(); // clears frozen state and starts a discard...
        endDiscard(); // ...which camera-off cuts short: hide immediately
        freezeCtl.reset();
        reticle.hidden = true;
        camOff.hidden = false;
      }
    } finally {
      transitioning = false;
    }
  }

  panel.addEventListener("click", (e) => {
    // Ignore clicks on the control buttons themselves.
    if (e.target.closest(".cam-ctrl")) return;
    if (freezeCtl.onTap(Date.now()) === "unfreeze") resume();
  });

  // Hide the freeze layers as soon as the discard transition finishes (the
  // guard keeps unrelated transitions from hiding a live freeze; endDiscard
  // is idempotent when both opacity and transform fire the event).
  freeze.addEventListener("transitionend", () => {
    if (freeze.classList.contains("discarding")) endDiscard();
  });

  camBtn.addEventListener("click", () => setCamera(!cameraOn));

  return {
    /** Start the scanner, honoring the persisted camera on/off state. */
    async start() {
      setIcon(camOffIcon, "camera-off");
      await setCamera(cameraOn);
    },
    /**
     * Re-read freeze settings and apply them to the live controller. Also
     * re-evaluates the tap hint visibility: if the mode switches away from tap
     * while frozen, the hint is hidden immediately rather than waiting for the
     * next resume.
     * @returns {void}
     */
    refreshFreezeConfig() {
      freezeCtl.setConfig(freezeConfigFromSettings(settings.get()));
      tapHint.hidden = settings.get().freezeMode !== "tap" || !frozen;
    },
  };
}
