#!/usr/bin/env node
// Generates the app's cue tones as 44.1kHz 16-bit mono PCM WAV files under assets/sounds/.
// Pure Node, no dependencies. Deterministic: rerun to regenerate identical bytes.
// Usage: node scripts/gen-tones.mjs

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets', 'sounds');
// The Android session runner (modules/session-runner, D39) plays the same tones natively from res/raw,
// so locked-mode cues never depend on Metro or JS asset resolution. Same bytes, `sr_` prefix.
const RUNNER_RAW_DIR = join(ROOT, 'modules', 'session-runner', 'android', 'src', 'main', 'res', 'raw');

/** Linear attack, flat sustain, linear release — keeps every tone click-free at its edges. */
function envelopeAt(i, n, attackN, releaseN) {
  if (i < attackN) return i / attackN;
  if (i > n - releaseN) return Math.max(0, (n - i) / releaseN);
  return 1;
}

function tone(freq, durationSec, { amplitude = 0.3, attackMs = 15, releaseMs = 30 } = {}) {
  const n = Math.round(durationSec * SAMPLE_RATE);
  const attackN = Math.max(1, Math.round((attackMs / 1000) * SAMPLE_RATE));
  const releaseN = Math.max(1, Math.round((releaseMs / 1000) * SAMPLE_RATE));
  const samples = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = Math.sin(2 * Math.PI * freq * t) * amplitude * envelopeAt(i, n, attackN, releaseN);
  }
  return samples;
}

/** A tone that glides linearly from freqStart to freqEnd over its duration. */
function glide(freqStart, freqEnd, durationSec, { amplitude = 0.3, attackMs = 15, releaseMs = 30 } = {}) {
  const n = Math.round(durationSec * SAMPLE_RATE);
  const attackN = Math.max(1, Math.round((attackMs / 1000) * SAMPLE_RATE));
  const releaseN = Math.max(1, Math.round((releaseMs / 1000) * SAMPLE_RATE));
  const samples = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const freq = freqStart + ((freqEnd - freqStart) * i) / n;
    phase += (2 * Math.PI * freq) / SAMPLE_RATE;
    samples[i] = Math.sin(phase) * amplitude * envelopeAt(i, n, attackN, releaseN);
  }
  return samples;
}

function silence(durationSec) {
  return new Float32Array(Math.round(durationSec * SAMPLE_RATE));
}

function concat(...chunks) {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function toWav(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate (mono 16-bit)
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

/** A single sine cycle count keeps the loop point phase-continuous (no click) at freq Hz. */
function loopableTone(freq, durationSec, amplitude) {
  const cycles = Math.round(freq * durationSec);
  const exactDuration = cycles / freq;
  return tone(freq, exactDuration, { amplitude, attackMs: 200, releaseMs: 200 });
}

/**
 * A struck resonator: a sum of sine partials, each with its own exponential decay, a short attack and a
 * linear fade over the last 120 ms so the file ends click-free. partials = [freq, amplitude, decaySec].
 * Normalised to the given peak so the end sounds sit at the same loudness as the chime.
 */
function resonance(partials, durationSec, { peak = 0.32, attackMs = 6 } = {}) {
  const n = Math.round(durationSec * SAMPLE_RATE);
  const attackN = Math.max(1, Math.round((attackMs / 1000) * SAMPLE_RATE));
  const releaseN = Math.round(0.12 * SAMPLE_RATE);
  const samples = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let v = 0;
    for (const [freq, amp, decay] of partials) v += amp * Math.sin(2 * Math.PI * freq * t) * Math.exp(-t / decay);
    v *= envelopeAt(i, n, attackN, releaseN);
    samples[i] = v;
    max = Math.max(max, Math.abs(v));
  }
  for (let i = 0; i < n; i++) samples[i] = (samples[i] / max) * peak;
  return samples;
}

// End sounds the user can pick besides the chime (end.wav): V3 P3 "endSound".
// Bell: a bright strike with inharmonic overtones that die away faster than the fundamental.
const bell = resonance(
  [
    [659.25, 1, 1.5],
    [1318.5, 0.5, 1.0],
    [1822.0, 0.32, 0.7],
    [3559.0, 0.14, 0.35],
  ],
  3.4
);
// Singing bowl: a low, soft strike; every partial is doubled a hair apart, which makes it shimmer slowly.
const bowl = resonance(
  [
    [261.6, 1, 2.0],
    [262.9, 0.9, 2.0],
    [709.0, 0.38, 1.3],
    [711.2, 0.34, 1.3],
    [1347.0, 0.14, 0.7],
  ],
  4.4,
  { attackMs: 25 }
);

// SPEC "Sound": inhale rising two-note, exhale falling, hold soft tick, sip short blip, end three-note chime.
const cues = {
  'inhale.wav': concat(tone(440, 0.28, { attackMs: 20, releaseMs: 20 }), silence(0.02), tone(587, 0.3, { attackMs: 15, releaseMs: 40 })),
  'exhale.wav': concat(tone(587, 0.3, { attackMs: 15, releaseMs: 15 }), silence(0.02), tone(392, 0.28, { attackMs: 15, releaseMs: 60 })),
  'hold.wav': tone(660, 0.08, { amplitude: 0.25, attackMs: 8, releaseMs: 30 }),
  'sip.wav': glide(500, 700, 0.15, { amplitude: 0.28, attackMs: 10, releaseMs: 40 }),
  'end.wav': concat(
    tone(523.25, 0.36, { amplitude: 0.3, attackMs: 15, releaseMs: 40 }), // C5
    silence(0.03),
    tone(659.25, 0.36, { amplitude: 0.3, attackMs: 15, releaseMs: 40 }), // E5
    silence(0.03),
    tone(783.99, 0.42, { amplitude: 0.32, attackMs: 15, releaseMs: 120 }) // G5
  ),
  'bell.wav': bell,
  'bowl.wav': bowl,
  // Near-silent (~ -40dB) looping bed so iOS/Android keep the audio session (and JS timers) alive
  // while "Keep guiding when locked" is on (D11); phase-continuous loop point, ~10s.
  'ambient.wav': loopableTone(60, 3, 0.01),
};

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(RUNNER_RAW_DIR, { recursive: true });
for (const [name, samples] of Object.entries(cues)) {
  writeFileSync(join(OUT_DIR, name), toWav(samples));
  writeFileSync(join(RUNNER_RAW_DIR, `sr_${name}`), toWav(samples));
  console.log(`wrote ${name} (${(samples.length / SAMPLE_RATE).toFixed(2)}s, ${samples.length * 2} bytes PCM)`);
}
