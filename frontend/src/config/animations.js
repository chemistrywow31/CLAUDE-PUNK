/**
 * Animation definitions for character poses and effects.
 * Characters cycle through 4 sitting poses for liveliness.
 */

// Character pose keys
export const POSE = {
  IDLE: 'pose-idle',
  DRINKING: 'pose-drinking',
  LEANING: 'pose-leaning',
  LOOKING: 'pose-looking',
};

// All available poses — the character randomly switches between these
export const CHARACTER_POSES = [POSE.IDLE, POSE.DRINKING, POSE.LEANING, POSE.LOOKING];

// Total number of character variants (0-7 regular, 8-9 hidden/rare)
export const CHARACTER_VARIANT_COUNT = 10;

// Hidden character variant indices (lower spawn probability)
export const HIDDEN_VARIANTS = [8, 9];

// Spawn weight: hidden variants have 1/5 the chance of regular ones
export const HIDDEN_VARIANT_WEIGHT = 0.2;

// Animation definitions (used when real sprite sheets are loaded)
const variantIndices = Array.from({ length: CHARACTER_VARIANT_COUNT }, (_, i) => i);
export const ANIMATION_DEFS = [
  {
    key: POSE.IDLE,
    frames: variantIndices.map((i) => `char-idle-${i}`),
    frameRate: 2,
    repeat: -1,
  },
  {
    key: POSE.DRINKING,
    frames: variantIndices.map((i) => `char-drink-${i}`),
    frameRate: 4,
    repeat: 0,
  },
  {
    key: POSE.LEANING,
    frames: variantIndices.map((i) => `char-lean-${i}`),
    frameRate: 2,
    repeat: -1,
  },
  {
    key: POSE.LOOKING,
    frames: variantIndices.map((i) => `char-look-${i}`),
    frameRate: 3,
    repeat: 0,
  },
];

// Pose transition timing (ms)
export const POSE_MIN_DURATION = 3000;
export const POSE_MAX_DURATION = 8000;

// Entrance walk speed (pixels per second)
export const WALK_SPEED = 120;

// Neon flicker timing
export const NEON_FLICKER_MIN = 2000;
export const NEON_FLICKER_MAX = 5000;
