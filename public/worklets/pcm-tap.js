/**
 * Taps the microphone render quantum and posts raw frames back to the engine.
 *
 * Shipped as a real file rather than built from a blob URL at runtime: worklet modules
 * are checked against script-src, which does not permit blob:, and widening the CSP for
 * this would be the wrong trade. Served from the app origin, so 'self' covers it.
 *
 * Shared by the Gemini and Whisper engines. Each runs its own AudioContext, so both can
 * register this processor name without colliding.
 */
class BspPcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      this.port.postMessage(channel.slice(0));
    }
    return true;
  }
}

registerProcessor("bsp-pcm-tap", BspPcmTap);
