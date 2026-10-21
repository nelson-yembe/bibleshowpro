/** Audio conversions shared by the streaming engines. */

/**
 * Served from the app origin rather than a blob URL — worklet modules are checked
 * against script-src, which does not allow blob:.
 */
export const PCM_WORKLET_URL = "/worklets/pcm-tap.js";
export const PCM_WORKLET_PROCESSOR = "bsp-pcm-tap";

/** Float samples in [-1, 1] to little-endian signed 16-bit PCM. */
export function floatTo16BitPcm(input: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return buffer;
}

export function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Convenience for the common path: float frames straight to a base64 PCM payload. */
export function encodePcmBase64(frames: Float32Array): string {
  return encodeBase64(floatTo16BitPcm(frames));
}
