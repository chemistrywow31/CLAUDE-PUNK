/**
 * HotkeyManager — assigns hotkey letters (a-z) to patrons and handles
 * global keyboard shortcuts for opening dialogs and closing overlays.
 *
 * - Single letter key (no modifiers, no overlay open, no input focused) opens dialog
 * - Ctrl+` closes any open overlay (dialog, folder picker, jukebox, retro TV)
 */

export default class HotkeyManager {
  constructor(scene, dialogBox, folderPicker, jukeboxUI, retroTvUI) {
    this.scene = scene;
    this.dialogBox = dialogBox;
    this.folderPicker = folderPicker;
    this.jukeboxUI = jukeboxUI;
    this.retroTvUI = retroTvUI;

    // Pool of available letters
    this.pool = 'abcdefghijklmnopqrstuvwxyz'.split('');
    // sessionId -> letter
    this.assignments = new Map();
    // letter -> sessionId (reverse lookup)
    this.letterToSession = new Map();

    this._onKeyDown = this._onKeyDown.bind(this);
    // Use capture phase so this fires BEFORE xterm.js can intercept
    document.addEventListener('keydown', this._onKeyDown, true);
  }

  /**
   * Assign the next available hotkey letter to a session.
   * @returns {string|null} The assigned letter, or null if pool exhausted.
   */
  assign(sessionId) {
    if (this.assignments.has(sessionId)) {
      return this.assignments.get(sessionId);
    }
    // Find first unused letter
    for (const letter of this.pool) {
      if (!this.letterToSession.has(letter)) {
        this.assignments.set(sessionId, letter);
        this.letterToSession.set(letter, sessionId);
        return letter;
      }
    }
    return null;
  }

  /**
   * Free a hotkey letter when a session terminates.
   */
  free(sessionId) {
    const letter = this.assignments.get(sessionId);
    if (letter) {
      this.letterToSession.delete(letter);
      this.assignments.delete(sessionId);
    }
  }

  /**
   * Check if any overlay is currently visible.
   */
  _isAnyOverlayOpen() {
    if (this.dialogBox && this.dialogBox.visible) return true;
    if (this.folderPicker && this.folderPicker.visible) return true;
    if (this.jukeboxUI && this.jukeboxUI.visible) return true;
    if (this.retroTvUI && this.retroTvUI.visible) return true;
    return false;
  }

  /**
   * Close all open overlays.
   */
  _closeAllOverlays() {
    if (this.dialogBox && this.dialogBox.visible) this.dialogBox.close();
    if (this.folderPicker && this.folderPicker.visible) this.folderPicker.hide();
    if (this.jukeboxUI && this.jukeboxUI.visible) this.jukeboxUI.hide();
    if (this.retroTvUI && this.retroTvUI.visible) this.retroTvUI.hide();
  }

  _onKeyDown(e) {
    // Ctrl+` (or Escape when not in terminal) closes any open overlay
    if (e.ctrlKey && e.key === '`') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this._closeAllOverlays();
      return;
    }

    // Escape closes overlays UNLESS focus is inside xterm (terminal handles ESC itself)
    if (e.key === 'Escape' && this._isAnyOverlayOpen()) {
      const active = document.activeElement;
      const inXterm = active?.closest('.xterm');
      if (!inXterm) {
        e.preventDefault();
        this._closeAllOverlays();
        return;
      }
    }

    // Don't trigger hotkeys when typing in an input/textarea or when modifiers are held
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Don't trigger hotkeys when an overlay is open (xterm handles its own keys)
    if (this._isAnyOverlayOpen()) return;

    // Single letter key -> open dialog for that patron
    const letter = e.key.toLowerCase();
    if (letter.length === 1 && this.letterToSession.has(letter)) {
      e.preventDefault();
      const sessionId = this.letterToSession.get(letter);
      const meta = this.scene.sessionMeta.get(sessionId) || {};
      if (this.dialogBox) {
        this.dialogBox.open(sessionId, meta.label, meta.state, meta.agentType);
      }
    }
  }

  destroy() {
    document.removeEventListener('keydown', this._onKeyDown, true);
    this.assignments.clear();
    this.letterToSession.clear();
  }
}
