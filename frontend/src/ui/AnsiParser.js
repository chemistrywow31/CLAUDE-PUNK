/**
 * Converts ANSI escape codes to HTML spans with CSS classes.
 */

const ANSI_COLORS = {
  30: 'ansi-black',
  31: 'ansi-red',
  32: 'ansi-green',
  33: 'ansi-yellow',
  34: 'ansi-blue',
  35: 'ansi-magenta',
  36: 'ansi-cyan',
  37: 'ansi-white',
  90: 'ansi-bright-black',
  91: 'ansi-bright-red',
  92: 'ansi-bright-green',
  93: 'ansi-bright-yellow',
  94: 'ansi-bright-blue',
  95: 'ansi-bright-magenta',
  96: 'ansi-bright-cyan',
  97: 'ansi-bright-white',
};

export function parseAnsi(text) {
  // Escape HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Replace ANSI codes with spans
  // eslint-disable-next-line no-control-regex
  const ansiRegex = /\x1b\[([0-9;]*)m/g;
  let result = '';
  let lastIndex = 0;
  let openSpans = 0;
  let match;

  while ((match = ansiRegex.exec(html)) !== null) {
    result += html.slice(lastIndex, match.index);
    const codes = match[1].split(';').map(Number);

    for (const code of codes) {
      if (code === 0) {
        // Reset
        while (openSpans > 0) {
          result += '</span>';
          openSpans--;
        }
      } else if (ANSI_COLORS[code]) {
        result += `<span class="${ANSI_COLORS[code]}">`;
        openSpans++;
      } else if (code === 1) {
        result += '<span class="ansi-bold">';
        openSpans++;
      } else if (code === 2) {
        result += '<span class="ansi-dim">';
        openSpans++;
      }
    }

    lastIndex = match.index + match[0].length;
  }

  result += html.slice(lastIndex);

  // Close any remaining open spans
  while (openSpans > 0) {
    result += '</span>';
    openSpans--;
  }

  return result;
}
