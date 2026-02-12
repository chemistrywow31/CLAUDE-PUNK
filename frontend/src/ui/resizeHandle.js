/**
 * Shared drag-resize factory with localStorage persistence.
 * Creates a resize handle element that can be placed between two panels.
 *
 * @param {Object} options
 * @param {'horizontal'|'vertical'} options.direction - 'horizontal' resizes width, 'vertical' resizes height
 * @param {HTMLElement} options.target - the element whose size is being changed
 * @param {'width'|'height'} options.property - CSS property to modify
 * @param {number} options.min - minimum size in px
 * @param {number} options.max - maximum size in px
 * @param {string} [options.storageKey] - localStorage key for persistence
 * @param {(size: number) => void} [options.onResize] - callback after each resize
 * @returns {HTMLDivElement} the resize handle element
 */
export function createResizeHandle({ direction, target, property, min, max, storageKey, onResize }) {
  const isHorizontal = direction === 'horizontal';
  const handle = document.createElement('div');
  handle.className = isHorizontal ? 'resize-handle-h' : 'resize-handle-v';

  // Restore saved size
  if (storageKey) {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val >= min && val <= max) {
        target.style[property] = val + 'px';
      }
    }
  }

  let startPos = 0;
  let startSize = 0;
  let overlay = null;

  function onMouseDown(e) {
    e.preventDefault();
    startPos = isHorizontal ? e.clientX : e.clientY;
    startSize = target.getBoundingClientRect()[isHorizontal ? 'width' : 'height'];

    // Full-screen transparent overlay blocks iframe mouse capture
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;cursor:' +
      (isHorizontal ? 'col-resize' : 'row-resize');
    document.body.appendChild(overlay);

    handle.classList.add('active');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  function onMouseMove(e) {
    const delta = (isHorizontal ? e.clientX : e.clientY) - startPos;
    const newSize = Math.min(max, Math.max(min, startSize + delta));
    target.style[property] = newSize + 'px';
    if (onResize) onResize(newSize);
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    handle.classList.remove('active');

    if (overlay) {
      overlay.remove();
      overlay = null;
    }

    // Persist
    if (storageKey) {
      const size = target.getBoundingClientRect()[isHorizontal ? 'width' : 'height'];
      localStorage.setItem(storageKey, Math.round(size).toString());
    }
  }

  handle.addEventListener('mousedown', onMouseDown);

  return handle;
}

/**
 * Create 8 resize handles (4 edges + 4 corners) for a dialog box.
 *
 * @param {HTMLElement} target - the dialog element
 * @param {Object} options
 * @param {number} options.minWidth
 * @param {number} options.minHeight
 * @param {number} options.maxWidth
 * @param {number} options.maxHeight
 * @param {string} [options.widthKey] - localStorage key for width
 * @param {string} [options.heightKey] - localStorage key for height
 * @returns {HTMLDivElement[]} array of handle elements
 */
export function createDialogResizeHandles(target, { minWidth, minHeight, maxWidth, maxHeight, widthKey, heightKey }) {
  const handles = [];

  // Restore saved dimensions
  if (widthKey) {
    const saved = localStorage.getItem(widthKey);
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val >= minWidth && val <= maxWidth) {
        target.style.width = val + 'px';
      }
    }
  }
  if (heightKey) {
    const saved = localStorage.getItem(heightKey);
    if (saved) {
      const val = parseInt(saved, 10);
      if (!isNaN(val) && val >= minHeight && val <= maxHeight) {
        target.style.height = val + 'px';
      }
    }
  }

  const edges = ['top', 'right', 'bottom', 'left'];
  const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'];

  for (const edge of edges) {
    const h = document.createElement('div');
    h.className = `dialog-resize-edge dialog-resize-${edge}`;
    h.dataset.edge = edge;
    handles.push(h);
    target.appendChild(h);
  }

  for (const corner of corners) {
    const h = document.createElement('div');
    h.className = `dialog-resize-corner dialog-resize-${corner}`;
    h.dataset.corner = corner;
    handles.push(h);
    target.appendChild(h);
  }

  let overlay = null;

  function onMouseDown(e) {
    e.preventDefault();
    e.stopPropagation();

    const edge = e.target.dataset.edge || null;
    const corner = e.target.dataset.corner || null;
    if (!edge && !corner) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const rect = target.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;

    // Determine which axes to resize
    const resizeRight = edge === 'right' || (corner && corner.includes('right'));
    const resizeLeft = edge === 'left' || (corner && corner.includes('left'));
    const resizeBottom = edge === 'bottom' || (corner && corner.includes('bottom'));
    const resizeTop = edge === 'top' || (corner && corner.includes('top'));

    // Determine cursor
    let cursor = 'default';
    if (corner === 'top-left' || corner === 'bottom-right') cursor = 'nwse-resize';
    else if (corner === 'top-right' || corner === 'bottom-left') cursor = 'nesw-resize';
    else if (edge === 'left' || edge === 'right') cursor = 'ew-resize';
    else if (edge === 'top' || edge === 'bottom') cursor = 'ns-resize';

    overlay = document.createElement('div');
    overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;cursor:${cursor}`;
    document.body.appendChild(overlay);

    e.target.classList.add('active');
    const activeHandle = e.target;

    function onMove(ev) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let newW = startW;
      let newH = startH;

      if (resizeRight) newW = startW + dx;
      if (resizeLeft) newW = startW - dx;
      if (resizeBottom) newH = startH + dy;
      if (resizeTop) newH = startH - dy;

      newW = Math.min(maxWidth, Math.max(minWidth, newW));
      newH = Math.min(maxHeight, Math.max(minHeight, newH));

      target.style.width = newW + 'px';
      target.style.height = newH + 'px';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      activeHandle.classList.remove('active');

      if (overlay) { overlay.remove(); overlay = null; }

      // Persist
      const finalRect = target.getBoundingClientRect();
      if (widthKey) localStorage.setItem(widthKey, Math.round(finalRect.width).toString());
      if (heightKey) localStorage.setItem(heightKey, Math.round(finalRect.height).toString());
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  for (const h of handles) {
    h.addEventListener('mousedown', onMouseDown);
  }

  return handles;
}
