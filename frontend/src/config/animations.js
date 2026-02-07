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

// Animation definitions (used when real sprite sheets are loaded)
export const ANIMATION_DEFS = [
  {
    key: POSE.IDLE,
    frames: ['char-idle-0', 'char-idle-1', 'char-idle-2', 'char-idle-3'],
    frameRate: 2,
    repeat: -1,
  },
  {
    key: POSE.DRINKING,
    frames: ['char-drink-0', 'char-drink-1', 'char-drink-2', 'char-drink-3'],
    frameRate: 4,
    repeat: 0,
  },
  {
    key: POSE.LEANING,
    frames: ['char-lean-0', 'char-lean-1', 'char-lean-2', 'char-lean-3'],
    frameRate: 2,
    repeat: -1,
  },
  {
    key: POSE.LOOKING,
    frames: ['char-look-0', 'char-look-1', 'char-look-2', 'char-look-3'],
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
