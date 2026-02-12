/**
 * Shared download utility — converts base64 content to a browser download.
 */

/** Map file extension to MIME type */
const MIME_MAP = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  ts: 'text/typescript',
  md: 'text/markdown',
  txt: 'text/plain',
  csv: 'text/csv',
};

/**
 * Detect MIME type from file extension.
 * @param {string} filePath
 * @returns {string}
 */
function getMimeType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

/**
 * Trigger a browser download from base64-encoded content.
 *
 * @param {string} filePath - full or relative path (used to extract filename)
 * @param {string} base64Content - base64-encoded file data
 */
export function downloadBase64File(filePath, base64Content) {
  const fileName = filePath.split('/').pop();
  const mime = getMimeType(filePath);

  // Decode base64 to Uint8Array
  const binaryStr = atob(base64Content);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);

  // Invisible anchor click trick
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Cleanup
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 100);
}
