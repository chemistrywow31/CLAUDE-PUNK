/**
 * WebSocket client service — shared singleton for communicating with the backend.
 * Handles connection, reconnection, message routing, and event dispatch.
 */

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.connected = false;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
  }

  connect(url) {
    if (this.ws) {
      this.ws.close();
    }

    const wsUrl = url || `ws://${window.location.host}/ws`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectDelay = 1000;
      this.emit('connection.open', {});
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.emit('connection.close', {});
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      this.emit('connection.error', { error: err });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type && msg.payload !== undefined) {
          this.emit(msg.type, msg.payload);
        }
      } catch (e) {
        console.warn('[WS] Failed to parse message:', e);
      }
    };
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Not connected, cannot send:', type);
      return false;
    }
    const msg = {
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  on(type, callback) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(callback);
    return () => this.off(type, callback);
  }

  off(type, callback) {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(callback);
    }
  }

  emit(type, payload) {
    const set = this.listeners.get(type);
    if (set) {
      set.forEach((cb) => {
        try {
          cb(payload);
        } catch (e) {
          console.error(`[WS] Listener error for ${type}:`, e);
        }
      });
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  // Convenience methods for the message protocol

  createSession(workDir, label, agentType = 'claude') {
    return this.send('session.create', { workDir, label, agentType });
  }

  sendPrompt(sessionId, prompt) {
    return this.send('session.prompt', { sessionId, prompt });
  }

  killSession(sessionId) {
    return this.send('session.kill', { sessionId });
  }

  browseDirectory(dirPath) {
    return this.send('fs.browse', { path: dirPath });
  }

  requestFileTree(sessionId) {
    return this.send('files.requestTree', { sessionId });
  }

  requestClaudeConfig(sessionId) {
    return this.send('claude.requestConfig', { sessionId });
  }

  sendTerminalInput(sessionId, data) {
    return this.send('terminal.input', { sessionId, data });
  }

  resizeTerminal(sessionId, cols, rows) {
    return this.send('terminal.resize', { sessionId, cols, rows });
  }
}

// Singleton
const wsService = new WebSocketService();
export default wsService;
