/**
 * Streaming sample-rate converter for speech.
 *
 * Asking the browser for a 16 kHz AudioContext fails on some drivers and Bluetooth
 * headsets, so capture runs at the device's own rate and converts here instead.
 *
 * Downsampling averages each output sample's span of input — a box filter, which keeps
 * aliasing out of the speech band well enough for recognition. Upsampling (an 8 kHz
 * headset) interpolates linearly. State carries across calls, so chunk boundaries
 * neither click nor drift.
 */
export class StreamingResampler {
  private readonly ratio: number;
  private carry: Float32Array = new Float32Array(0);
  /** Fractional index, into carry + next input, of the next output sample. */
  private position = 0;

  constructor(
    readonly inputRate: number,
    readonly outputRate: number,
  ) {
    if (!(inputRate > 0) || !(outputRate > 0)) {
      throw new Error("Sample rates must be positive.");
    }
    this.ratio = inputRate / outputRate;
  }

  process(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input.slice();

    const buffer = new Float32Array(this.carry.length + input.length);
    buffer.set(this.carry, 0);
    buffer.set(input, this.carry.length);

    const out: number[] = [];
    if (this.ratio > 1) {
      while (this.position + this.ratio <= buffer.length) {
        const start = Math.floor(this.position);
        const end = Math.floor(this.position + this.ratio);
        let sum = 0;
        for (let i = start; i < end; i += 1) sum += buffer[i];
        out.push(end > start ? sum / (end - start) : buffer[start]);
        this.position += this.ratio;
      }
    } else {
      while (this.position + 1 < buffer.length) {
        const index = Math.floor(this.position);
        const fraction = this.position - index;
        out.push(buffer[index] * (1 - fraction) + buffer[index + 1] * fraction);
        this.position += this.ratio;
      }
    }

    const consumed = Math.floor(this.position);
    this.carry = buffer.slice(consumed);
    this.position -= consumed;
    return Float32Array.from(out);
  }

  reset(): void {
    this.carry = new Float32Array(0);
    this.position = 0;
  }
}
