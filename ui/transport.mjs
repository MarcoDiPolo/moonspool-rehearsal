// piano-roll-practice.js
// Browser ES module – no dependencies

/**
 * buildPractice(masks, options) → plan
 *
 * @param {number[]} masks   16-element array of integers 0..31
 * @param {object}   opts
 * @param {number}   opts.bpm      integer 60..150
 * @param {number}   opts.from     1-based step, 1..16
 * @param {number}   opts.to       1-based step, 1..16, >= from
 * @param {number}   opts.loops    integer 1..8
 * @param {number}   opts.countIn  0 or 4
 * @returns {object} plan
 */
export function buildPractice(masks, { bpm, from, to, loops, countIn } = {}) {
  if (!Array.isArray(masks) || masks.length !== 16) {
    throw new RangeError('masks must be a 16-element array');
  }
  for (let i = 0; i < 16; i++) {
    const m = masks[i];
    if (!Number.isInteger(m) || m < 0 || m > 31) {
      throw new RangeError(`masks[${i}] must be an integer 0..31, got ${m}`);
    }
  }

  if (!Number.isInteger(bpm) || bpm < 60 || bpm > 150) {
    throw new RangeError(`bpm must be an integer 60..150, got ${bpm}`);
  }

  if (!Number.isInteger(from) || from < 1 || from > 16) {
    throw new RangeError(`from must be an integer 1..16, got ${from}`);
  }
  if (!Number.isInteger(to) || to < 1 || to > 16) {
    throw new RangeError(`to must be an integer 1..16, got ${to}`);
  }
  if (from > to) {
    throw new RangeError(`from (${from}) must be <= to (${to})`);
  }

  if (!Number.isInteger(loops) || loops < 1 || loops > 8) {
    throw new RangeError(`loops must be an integer 1..8, got ${loops}`);
  }

  if (countIn !== 0 && countIn !== 4) {
    throw new RangeError(`countIn must be 0 or 4, got ${countIn}`);
  }

  // One quarter note = 60 000 / bpm ms
  // One sixteenth    = quarter / 4
  const beatMs  = 60_000 / bpm;          // ms per quarter note
  const stepMs  = beatMs / 4;            // ms per sixteenth note

  const countInMs = countIn * beatMs;    // 0 or 4 quarter beats → ms

  // Selected steps (1-based indices preserved for the caller)
  const steps = [];
  for (let s = from; s <= to; s++) {
    steps.push({ step: s, mask: masks[s - 1] });
  }

  const playMs   = steps.length * stepMs * loops;
  const totalMs  = countInMs + playMs;

  return {
    beatMs,
    stepMs,
    countInMs,
    totalMs,
    loops,
    steps,         // Array<{step:number, mask:number}>
  };
}

/**
 * locate(plan, elapsedMs) → phase descriptor
 *
 * Returns one of:
 *   { phase: 'count', beat: 1..4 }
 *   { phase: 'play',  pass: 1..loops, step: 1..16, mask: number }
 *   { phase: 'done' }
 *
 * Exact n*stepMs boundaries enter the *following* step (or phase).
 *
 * @param {object} plan       result of buildPractice()
 * @param {number} elapsedMs  non-negative finite number
 * @returns {object}
 */
export function locate(plan, elapsedMs) {
  if (
    plan === null ||
    typeof plan !== 'object' ||
    typeof plan.beatMs  !== 'number' ||
    typeof plan.stepMs  !== 'number' ||
    typeof plan.countInMs !== 'number' ||
    typeof plan.totalMs !== 'number' ||
    typeof plan.loops   !== 'number' ||
    !Array.isArray(plan.steps)
  ) {
    throw new TypeError('plan must be a valid object returned by buildPractice()');
  }

  if (typeof elapsedMs !== 'number' || !isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(`elapsedMs must be a non-negative finite number, got ${elapsedMs}`);
  }

  const { beatMs, stepMs, countInMs, totalMs, loops, steps } = plan;

  // Exact boundary at totalMs enters 'done'
  if (elapsedMs >= totalMs) {
    return { phase: 'done' };
  }

  if (countInMs > 0 && elapsedMs < countInMs) {
    // beat is 1-based; exact beat boundary enters the next beat
    let beatIndex = 0;
    while (beatIndex < 3 && (beatIndex + 1) * beatMs <= elapsedMs) beatIndex++;
    // elapsedMs < countInMs so beatIndex is at most countIn-1
    const beat = beatIndex + 1; // 1-based current beat
    return { phase: 'count', beat };
  }

  // Compare against the same absolute boundaries used to schedule the sound.
  // Dividing elapsed milliseconds can round a mathematically integral index down
  // at tempos such as 97 BPM. There are at most 128 selected slots.
  let low = 0, high = steps.length * loops;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (countInMs + middle * stepMs <= elapsedMs) low = middle;
    else high = middle;
  }
  const {step, mask} = steps[low % steps.length];
  return {phase: "play", pass: Math.floor(low / steps.length) + 1, step, mask};
}
