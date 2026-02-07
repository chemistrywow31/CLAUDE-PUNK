/**
 * Seat registry -- defines all available seats in the bar.
 * Characters are assigned to random available seats as sessions are created.
 *
 * Coordinates are at 1920x1080 resolution, measured from
 * the bar-interior.png background image.
 *
 * faceLeft: true = sprite faces left (flipX), false = faces right (default).
 * drinkAnchor: (x, y) where drinks are placed for this seat.
 */

export const SEATS = [
  // Bar stools (row at y~650, along the counter)
  { id: 'bar-1', x: 660,  y: 652, faceLeft: false, drinkAnchor: { x: 570,  y: 483 } },
  { id: 'bar-2', x: 855,  y: 651, faceLeft: false, drinkAnchor: { x: 757,  y: 477 } },
  { id: 'bar-3', x: 1040, y: 649, faceLeft: true,  drinkAnchor: { x: 1122, y: 475 } },
  { id: 'bar-4', x: 1226, y: 649, faceLeft: true,  drinkAnchor: { x: 1300, y: 476 } },

  // Tables row 1 (y~840-877)
  { id: 'table1', x: 569,  y: 877, faceLeft: true,  drinkAnchor: { x: 408, y: 703 } },
  { id: 'table2', x: 839,  y: 840, faceLeft: false, drinkAnchor: { x: 952, y: 727 } },
  { id: 'table3', x: 1564, y: 839, faceLeft: true,  drinkAnchor: { x: 1439, y: 730 } },

  // Tables row 2 (y~1014-1022)
  { id: 'table4', x: 1085, y: 1022, faceLeft: true,  drinkAnchor: { x: 947,  y: 900 } },
  { id: 'table5', x: 1317, y: 1014, faceLeft: false, drinkAnchor: { x: 1442, y: 909 } },
];

// Door position -- on the right wall where characters spawn and walk from
export const DOOR_POSITION = { x: 1505, y: 545 };

// Drink placement offsets relative to seat drinkAnchor
export const DRINK_OFFSETS = [
  { x: 0, y: 0 },
  { x: -24, y: 0 },
  { x: 24, y: 0 },
  { x: -12, y: -16 },
  { x: 12, y: -16 },
  { x: 0, y: -16 },
];
