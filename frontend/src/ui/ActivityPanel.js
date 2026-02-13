/**
 * Activity Panel V2 — Multi-Section Dashboard
 *
 * Sections:
 * 1. Workflow strip (horizontal node flow with pulse on latest)
 * 2. Agents panel (subagents, teams, skills)
 * 3. Detail grid:
 *    - Thinking (latest thinking block)
 *    - Plan (latest ExitPlanMode output)
 *    - Files (Write & Edit paths)
 *    - Text & Bash (remaining events feed)
 *
 * Supports docked (inside DialogBox tab) and floating (draggable overlay) modes.
 */

import wsService from '../services/websocket.js';
import { createDialogResizeHandles } from './resizeHandle.js';
import contextTracker, { contextColorForPercentage, formatContextTokens } from '../services/contextTracker.js';

// ─── Workflow node config ────────────────────────────────────────────────────

const WORKFLOW_TOOLS = {
  thinking:         { label: 'THINK',   color: '#8040c0' },
  Read:             { label: 'READ',    color: '#00f0ff' },
  Grep:             { label: 'GREP',    color: '#00f0ff' },
  Glob:             { label: 'GLOB',    color: '#00f0ff' },
  Edit:             { label: 'EDIT',    color: '#ffaa00' },
  Write:            { label: 'WRITE',   color: '#ffaa00' },
  Task:             { label: 'AGENT',   color: '#00ff88' },
  AskUserQuestion:  { label: 'ASK',     color: '#00f0ff' },
  ExitPlanMode:     { label: 'EXITPL',  color: '#ff0080' },
  EnterPlanMode:    { label: 'ENTERPL', color: '#ff0080' },
};

// Tools that add a workflow node
const WORKFLOW_TOOL_SET = new Set(Object.keys(WORKFLOW_TOOLS));

// Tools that route to Files section
const FILE_TOOLS = new Set(['Write', 'Edit']);

// Tools that route to Agents section
const AGENT_TOOLS = new Set(['Task', 'Skill', 'TeamCreate', 'TeamDelete', 'SendMessage',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskStop']);

// Badge map for Text & Bash
const TEXT_BASH_BADGES = {
  assistant_text:    { label: 'TEXT',  color: '#8888aa' },
  user_message:      { label: 'USER',  color: '#00f0ff' },
  error:             { label: 'ERROR', color: '#ff0080' },
  tool_use:          { label: 'BASH',  color: '#e0e0e0' },
};

// ─── Limits ──────────────────────────────────────────────────────────────────

const MAX_WORKFLOW_NODES = 200;
const MAX_TEXT_BASH = 300;
const AGENT_IDLE_MS = 15000;
const AGENT_CHECK_MS = 5000;

export default class ActivityPanel {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.mode = 'docked';
    this.el = null;
    this.floatContainer = null;
    this.unsubActivity = null;
    this._rafPending = false;

    // State
    this.workflowNodes = [];
    this.latestThinking = '';
    this.latestPlan = '';
    this.phases = new Map();       // taskKey → {subject, description, status, timestamp}
    this._selectedPhaseKey = null; // currently viewed phase in detail panel
    this.agents = new Map();       // id → {name, type, description, status, lastSeen, kind}
    this.writtenFiles = [];        // [{path, action, timestamp}]
    this.textBashEvents = [];      // [{timestamp, badge, color, text}]
    this.latestInputTokens = 0;
    this.latestContextPct = 0;

    // Dirty flags — only re-render changed sections
    this._dirty = {
      workflow: false,
      phases: false,
      thinking: false,
      plan: false,
      agents: false,
      files: false,
      textBash: false,
      context: false,
    };

    // DOM refs
    this._dom = {};

    // Agent status checker
    this._agentTimer = null;

    // Tracks whether the latest workflow node is agent-related (for agent card blinking)
    this._lastWorkflowIsAgent = false;
  }

  // === Tab interface (DialogBox calls these) ===

  render(container) {
    this._buildContent();
    container.appendChild(this.el);
    this._subscribe();
    this._startAgentTimer();
    // Force full re-render into fresh DOM from existing state
    for (const k of Object.keys(this._dirty)) this._dirty[k] = true;
    this._render();
  }

  destroy() {
    if (this.mode === 'floating') return;
    // Keep subscription alive across tab switches — only detach DOM and stop timers.
    // This prevents watchActivity backfill from re-sending events and duplicating messages.
    this._stopAgentTimer();
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }

  // === Float / Dock switching ===

  popOut() {
    this.floatContainer = document.createElement('div');
    this.floatContainer.className = 'activity-float-panel cyberpunk-panel';

    const savedX = localStorage.getItem('claudePunk_activityFloatX');
    const savedY = localStorage.getItem('claudePunk_activityFloatY');
    if (savedX && savedY) {
      this.floatContainer.style.left = savedX + 'px';
      this.floatContainer.style.top = savedY + 'px';
    } else {
      this.floatContainer.style.right = '20px';
      this.floatContainer.style.bottom = '20px';
    }

    document.getElementById('game-container').appendChild(this.floatContainer);

    createDialogResizeHandles(this.floatContainer, {
      minWidth: 350,
      minHeight: 300,
      maxWidth: 900,
      maxHeight: 700,
      widthKey: 'claudePunk_activityFloatW',
      heightKey: 'claudePunk_activityFloatH',
    });

    this.floatContainer.appendChild(this.el);
    this.mode = 'floating';
    this._updateModeButtons();

    const header = this.el.querySelector('.activity-header');
    this._initDrag(header, this.floatContainer);

    document.dispatchEvent(new CustomEvent('activity-popout'));
  }

  dockBack() {
    if (this.floatContainer) {
      this.floatContainer.remove();
      this.floatContainer = null;
    }
    this.mode = 'docked';
    this._updateModeButtons();
    document.dispatchEvent(new CustomEvent('activity-dock'));
  }

  fullDestroy() {
    this._unsubscribe();
    this._stopAgentTimer();
    if (this.floatContainer) {
      this.floatContainer.remove();
      this.floatContainer = null;
    }
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    this._dom = {};
    this.workflowNodes = [];
    this.phases.clear();
    this._selectedPhaseKey = null;
    this.agents.clear();
    this.writtenFiles = [];
    this.textBashEvents = [];
    this.latestInputTokens = 0;
    this.latestContextPct = 0;
  }

  // === Internal: Build DOM ===

  _buildContent() {
    this.el = document.createElement('div');
    this.el.className = 'activity-panel';

    this.el.innerHTML = `
      <div class="activity-header">
        <span class="activity-title">ACTIVITY</span>
        <div class="context-bar-container">
          <span class="context-bar-label">CTX</span>
          <div class="context-bar-track"><div class="context-bar-fill"></div></div>
          <span class="context-bar-value">0%</span>
        </div>
        <div class="activity-controls">
          <button class="activity-btn activity-popout" title="Pop out to floating panel">POP</button>
          <button class="activity-btn activity-dock hidden" title="Dock back to tab">DOCK</button>
        </div>
      </div>
      <div class="activity-workflow">
        <div class="workflow-track"></div>
      </div>
      <div class="activity-phases">
        <div class="section-label">PHASES</div>
        <div class="phases-container">
          <div class="phases-workflow">
            <div class="phases-track"></div>
          </div>
          <div class="phases-detail">
            <span class="phases-empty">no phases</span>
          </div>
        </div>
      </div>
      <div class="activity-agents">
        <div class="section-label">AGENTS</div>
        <div class="agent-grid"><span class="agents-empty">no agents</span></div>
      </div>
      <div class="activity-detail-area">
        <div class="detail-left">
          <div class="activity-section thinking">
            <div class="section-label collapsible">THINKING <span class="collapse-icon">\u25BE</span></div>
            <div class="section-content"></div>
          </div>
          <div class="activity-section plan">
            <div class="section-label collapsible">PLAN <span class="collapse-icon">\u25BE</span></div>
            <div class="section-content"></div>
          </div>
        </div>
        <div class="detail-right">
          <div class="activity-section files">
            <div class="section-label collapsible">FILES <span class="collapse-icon">\u25BE</span></div>
            <div class="section-content"></div>
          </div>
          <div class="activity-section textbash">
            <div class="section-label collapsible">TEXT & BASH <span class="collapse-icon">\u25BE</span></div>
            <div class="section-content"></div>
          </div>
        </div>
      </div>
    `;

    // Cache DOM refs
    this._dom.contextFill = this.el.querySelector('.context-bar-fill');
    this._dom.contextValue = this.el.querySelector('.context-bar-value');
    this._dom.workflowTrack = this.el.querySelector('.workflow-track');
    this._dom.workflowStrip = this.el.querySelector('.activity-workflow');
    this._dom.phasesTrack = this.el.querySelector('.phases-track');
    this._dom.phasesWorkflow = this.el.querySelector('.phases-workflow');
    this._dom.phasesDetail = this.el.querySelector('.phases-detail');
    this._dom.agentGrid = this.el.querySelector('.agent-grid');
    this._dom.thinkingContent = this.el.querySelector('.activity-section.thinking .section-content');
    this._dom.planSection = this.el.querySelector('.activity-section.plan');
    this._dom.planContent = this.el.querySelector('.activity-section.plan .section-content');
    this._dom.filesContent = this.el.querySelector('.activity-section.files .section-content');
    this._dom.textBashContent = this.el.querySelector('.activity-section.textbash .section-content');

    // Event handlers
    this.el.querySelector('.activity-popout').addEventListener('click', () => this.popOut());
    this.el.querySelector('.activity-dock').addEventListener('click', () => this.dockBack());

    // Collapsible section toggles
    for (const label of this.el.querySelectorAll('.section-label.collapsible')) {
      label.addEventListener('click', () => {
        const section = label.closest('.activity-section');
        if (section) section.classList.toggle('collapsed');
      });
    }
  }

  // === Internal: Subscribe to events ===

  _subscribe() {
    if (this.unsubActivity) return;
    this.unsubActivity = wsService.on('claude.activity', (payload) => {
      if (payload.gameSessionId !== this.sessionId) return;
      this._onActivity(payload);
    });
    wsService.watchActivity(this.sessionId);
  }

  _unsubscribe() {
    if (this.unsubActivity) {
      this.unsubActivity();
      this.unsubActivity = null;
    }
  }

  // === Internal: Event routing ===

  _onActivity(payload) {
    if (!payload.events || !Array.isArray(payload.events)) return;

    for (const event of payload.events) {
      this._routeEvent(event);
    }

    this._scheduleRender();
  }

  _routeEvent(event) {
    const kind = event.kind;

    // Skip hooks entirely
    if (kind === 'hook') return;

    // Thinking → workflow + thinking section
    if (kind === 'thinking') {
      this._addWorkflowNode('THINK', '#8040c0', event.timestamp);
      this.latestThinking = event.text || '';
      this._dirty.thinking = true;
      return;
    }

    // Tool use events
    if (kind === 'tool_use') {
      const tool = event.toolName;

      // Add workflow node if applicable
      if (WORKFLOW_TOOL_SET.has(tool)) {
        const wf = WORKFLOW_TOOLS[tool];
        this._addWorkflowNode(wf.label, wf.color, event.timestamp);
      }

      // Route to Files
      if (FILE_TOOLS.has(tool)) {
        const filePath = event.input || '';
        if (filePath) {
          this.writtenFiles.push({
            path: filePath,
            action: tool.toLowerCase(),
            timestamp: event.timestamp,
          });
          this._dirty.files = true;
        }
        return;
      }

      // Route to Agents
      if (tool === 'Task') {
        const agentId = event.agentName || event.description || event.toolId;
        this.agents.set(agentId, {
          name: event.agentName || event.description || 'Agent',
          type: event.subagentType || 'general',
          description: event.description || '',
          status: 'active',
          lastSeen: Date.now(),
          kind: 'agent',
        });
        this._dirty.agents = true;
        return;
      }

      if (tool === 'Skill') {
        const skillId = event.skill || event.input || event.toolId;
        this.agents.set('skill:' + skillId, {
          name: event.skill || event.input || 'Skill',
          type: 'skill',
          description: event.args || '',
          status: 'active',
          lastSeen: Date.now(),
          kind: 'skill',
        });
        this._dirty.agents = true;
        return;
      }

      if (tool === 'TeamCreate') {
        const teamId = event.teamName || event.input || event.toolId;
        this.agents.set('team:' + teamId, {
          name: event.teamName || event.input || 'Team',
          type: 'team',
          description: event.teamDescription || '',
          status: 'active',
          lastSeen: Date.now(),
          kind: 'team',
        });
        this._dirty.agents = true;
        return;
      }

      if (tool === 'SendMessage') {
        // Update last seen for recipient agent if known
        const recipient = event.recipient || '';
        if (recipient) {
          for (const [id, agent] of this.agents) {
            if (agent.name === recipient) {
              agent.lastSeen = Date.now();
              agent.status = 'active';
              break;
            }
          }
          this._dirty.agents = true;
        }
        return;
      }

      if (tool === 'TaskCreate') {
        const taskKey = event.taskSubject || event.input || event.toolId;
        this.phases.set(taskKey, {
          subject: event.taskSubject || event.input || 'Task',
          description: event.taskDescription || '',
          activeForm: event.taskActiveForm || '',
          status: 'pending',
          timestamp: event.timestamp,
        });
        this._dirty.phases = true;
        return;
      }

      if (tool === 'TaskUpdate') {
        // Update existing phase status — match by subject
        if (event.taskStatus) {
          // Try to find matching phase by subject or by order
          if (event.taskSubject) {
            const phase = this.phases.get(event.taskSubject);
            if (phase) phase.status = event.taskStatus;
          } else {
            // Match by taskId position (best effort: update first pending)
            for (const [, phase] of this.phases) {
              if (phase.status === 'in_progress') {
                phase.status = event.taskStatus;
                break;
              }
            }
          }
          // If status is in_progress, mark that phase
          if (event.taskStatus === 'in_progress' && event.taskSubject) {
            const phase = this.phases.get(event.taskSubject);
            if (phase) phase.status = 'in_progress';
          }
        }
        this._dirty.phases = true;
        return;
      }

      if (AGENT_TOOLS.has(tool)) {
        return;
      }

      // ExitPlanMode → plan section
      if (tool === 'ExitPlanMode') {
        this.latestPlan = event.plan || event.input || '';
        this._dirty.plan = true;
        return;
      }

      // EnterPlanMode, AskUserQuestion, Read, Grep, Glob → workflow only (already handled above)
      if (WORKFLOW_TOOL_SET.has(tool)) return;

      // Everything else (Bash, WebSearch, WebFetch, etc.) → Text & Bash
      this._addTextBash(event);
      return;
    }

    // Subagent tool use → Agents section + workflow node
    if (kind === 'subagent_tool_use') {
      const slug = event.slug || 'agent';
      const toolName = event.toolName || 'WORK';
      const wf = WORKFLOW_TOOLS[toolName];
      const label = wf ? wf.label : toolName.toUpperCase().slice(0, 5);
      this._addWorkflowNode(label, this._agentColor(slug), event.timestamp, slug);

      if (!this.agents.has(slug)) {
        this.agents.set(slug, {
          name: slug,
          type: 'subagent',
          description: '',
          status: 'active',
          lastSeen: Date.now(),
          kind: 'agent',
        });
      } else {
        const a = this.agents.get(slug);
        a.lastSeen = Date.now();
        a.status = 'active';
      }
      this._dirty.agents = true;
      return;
    }

    // Agent progress → Agents section
    if (kind === 'agent_progress') {
      const agentId = event.agentId || 'agent';
      if (!this.agents.has(agentId)) {
        this.agents.set(agentId, {
          name: agentId,
          type: 'agent',
          description: event.prompt || '',
          status: 'active',
          lastSeen: Date.now(),
          kind: 'agent',
        });
      } else {
        const a = this.agents.get(agentId);
        a.lastSeen = Date.now();
        a.status = 'active';
      }
      this._dirty.agents = true;
      return;
    }

    // assistant_text — also scan for text-based phases + context tracking
    if (kind === 'assistant_text') {
      // Feed context tracker
      contextTracker.onEvent(this.sessionId, event);
      if (event.usage) {
        const ctx = contextTracker.getContext(this.sessionId);
        if (ctx) {
          this.latestInputTokens = ctx.totalTokens;
          this.latestContextPct = ctx.percentage;
          this._dirty.context = true;
        }
      }

      if (event.text) {
        const textPhases = this._extractPhasesFromText(event.text);
        if (textPhases.length >= 2) {
          // Replace previous text-derived phases (keep TaskCreate-derived ones)
          for (const key of this.phases.keys()) {
            if (key.startsWith('text:')) this.phases.delete(key);
          }
          for (const p of textPhases) {
            this.phases.set(`text:${p.num}`, {
              subject: p.subject,
              description: '',
              activeForm: '',
              status: 'pending',
              timestamp: event.timestamp,
              source: 'text',
            });
          }
          this._dirty.phases = true;
        }
      }
      this._addTextBash(event);
      return;
    }

    // user_message, error → Text & Bash
    if (kind === 'user_message' || kind === 'error') {
      this._addTextBash(event);
      return;
    }
  }

  _addWorkflowNode(label, color, timestamp, agent = null) {
    const wasAgent = this._lastWorkflowIsAgent;
    this.workflowNodes.push({ label, color, timestamp, agent });
    if (this.workflowNodes.length > MAX_WORKFLOW_NODES) {
      this.workflowNodes.shift();
    }
    this._lastWorkflowIsAgent = (label === 'AGENT' || agent != null);
    this._dirty.workflow = true;
    // Re-render agent cards when blink state changes
    if (wasAgent !== this._lastWorkflowIsAgent) {
      this._dirty.agents = true;
    }
  }

  _addTextBash(event) {
    const kind = event.kind;
    let badge, color, text;

    if (kind === 'tool_use') {
      badge = event.toolName?.toUpperCase().slice(0, 6) || 'TOOL';
      color = '#e0e0e0';
      text = event.input || event.toolName || '';
      // Special coloring for known tools
      if (event.toolName === 'Bash') { badge = 'BASH'; color = '#e0e0e0'; }
      else if (event.toolName === 'WebSearch') { badge = 'SEARCH'; color = '#00f0ff'; }
      else if (event.toolName === 'WebFetch') { badge = 'FETCH'; color = '#00f0ff'; }
    } else {
      const info = TEXT_BASH_BADGES[kind] || { label: kind.toUpperCase().slice(0, 6), color: '#8888aa' };
      badge = info.label;
      color = info.color;
      text = event.text || event.error || event.input || '';
    }

    // For assistant_text with usage but no text, format usage
    if (kind === 'assistant_text' && event.usage && !event.text) {
      const u = event.usage;
      const fmtK = (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n || 0);
      text = `tokens: ${fmtK(u.inputTokens)} in / ${fmtK(u.outputTokens)} out`;
    }

    this.textBashEvents.push({
      timestamp: event.timestamp,
      badge,
      color,
      text,
      isError: kind === 'error',
    });

    if (this.textBashEvents.length > MAX_TEXT_BASH) {
      this.textBashEvents.shift();
    }

    this._dirty.textBash = true;
  }

  // === Internal: Render via RAF ===

  _scheduleRender() {
    if (this._rafPending) return;
    this._rafPending = true;
    requestAnimationFrame(() => {
      this._rafPending = false;
      this._render();
    });
  }

  _render() {
    if (!this.el) return;

    if (this._dirty.context) {
      this._renderContext();
      this._dirty.context = false;
    }
    if (this._dirty.workflow) {
      this._renderWorkflow();
      this._dirty.workflow = false;
    }
    if (this._dirty.phases) {
      this._renderPhases();
      this._dirty.phases = false;
    }
    if (this._dirty.thinking) {
      this._renderThinking();
      this._dirty.thinking = false;
    }
    if (this._dirty.plan) {
      this._renderPlan();
      this._dirty.plan = false;
    }
    if (this._dirty.agents) {
      this._renderAgents();
      this._dirty.agents = false;
    }
    if (this._dirty.files) {
      this._renderFiles();
      this._dirty.files = false;
    }
    if (this._dirty.textBash) {
      this._renderTextBash();
      this._dirty.textBash = false;
    }
  }

  _renderContext() {
    const fill = this._dom.contextFill;
    const value = this._dom.contextValue;
    if (!fill || !value) return;

    const pct = this.latestContextPct;
    const color = contextColorForPercentage(pct);
    fill.style.width = `${Math.min(pct, 100)}%`;
    fill.style.backgroundColor = color;
    value.textContent = `${formatContextTokens(this.latestInputTokens)} (${Math.round(pct)}%)`;
    value.style.color = color;
  }

  _renderWorkflow() {
    const track = this._dom.workflowTrack;
    if (!track) return;

    // Remove stale DOM nodes if trimmed
    while (track.childElementCount > this.workflowNodes.length * 2) {
      track.removeChild(track.firstChild);
    }

    // Remove .active from previous last node
    const prevActive = track.querySelector('.workflow-node.active');
    if (prevActive) prevActive.classList.remove('active');

    // Add new nodes since last render
    const existingCount = Math.floor((track.childElementCount + 1) / 2); // nodes + arrows
    for (let i = existingCount; i < this.workflowNodes.length; i++) {
      const node = this.workflowNodes[i];

      // Arrow before node (except first)
      if (track.childElementCount > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'workflow-arrow';
        arrow.textContent = '\u203a';
        track.appendChild(arrow);
      }

      const el = document.createElement('div');
      el.className = 'workflow-node' + (node.agent ? ' workflow-agent-node' : '');
      el.style.setProperty('--node-color', node.color);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'node-label';
      labelSpan.textContent = node.label;
      el.appendChild(labelSpan);

      // Agent tag for subagent nodes
      if (node.agent) {
        const agentTag = document.createElement('span');
        agentTag.className = 'node-agent';
        agentTag.textContent = node.agent;
        el.appendChild(agentTag);
      }

      const timeSpan = document.createElement('span');
      timeSpan.className = 'node-time';
      const d = new Date(node.timestamp);
      timeSpan.textContent = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
      el.appendChild(timeSpan);

      track.appendChild(el);
    }

    // Mark last node as active
    const lastNode = track.querySelector('.workflow-node:last-of-type');
    if (lastNode) lastNode.classList.add('active');

    // Auto-scroll to right
    this._dom.workflowStrip.scrollLeft = this._dom.workflowStrip.scrollWidth;
  }

  _renderPhases() {
    const track = this._dom.phasesTrack;
    const detail = this._dom.phasesDetail;
    if (!track || !detail) return;

    track.innerHTML = '';
    detail.innerHTML = '';

    if (this.phases.size === 0) {
      const empty = document.createElement('span');
      empty.className = 'phases-empty';
      empty.textContent = 'no phases';
      detail.appendChild(empty);
      return;
    }

    // Auto-select: prefer in_progress, then first unselected
    let autoKey = null;
    for (const [key, phase] of this.phases) {
      if (phase.status === 'in_progress') { autoKey = key; break; }
    }
    if (!this._selectedPhaseKey || !this.phases.has(this._selectedPhaseKey)) {
      this._selectedPhaseKey = autoKey || this.phases.keys().next().value;
    }
    // If there's an in_progress phase, auto-switch to it
    if (autoKey) this._selectedPhaseKey = autoKey;

    const STATUS_COLORS = {
      pending: '#8888aa',
      in_progress: '#ffaa00',
      completed: '#00ff88',
    };

    // Build workflow nodes
    let idx = 0;
    for (const [key, phase] of this.phases) {
      idx++;
      const color = STATUS_COLORS[phase.status] || '#8888aa';
      const isSelected = key === this._selectedPhaseKey;

      // Arrow between nodes
      if (track.childElementCount > 0) {
        const arrow = document.createElement('span');
        arrow.className = 'workflow-arrow';
        arrow.textContent = '\u203a';
        track.appendChild(arrow);
      }

      const node = document.createElement('div');
      node.className = 'phase-node'
        + (phase.status === 'in_progress' ? ' phase-active' : '')
        + (phase.status === 'completed' ? ' phase-done' : '')
        + (isSelected ? ' phase-selected' : '');
      node.style.setProperty('--phase-color', color);

      const numSpan = document.createElement('span');
      numSpan.className = 'phase-node-num';
      numSpan.textContent = idx;

      const labelSpan = document.createElement('span');
      labelSpan.className = 'phase-node-label';
      labelSpan.textContent = phase.subject;

      const statusIcon = document.createElement('span');
      statusIcon.className = 'phase-node-icon';
      statusIcon.textContent = phase.status === 'completed' ? '\u2713'
        : phase.status === 'in_progress' ? '\u25B6' : '\u25CB';

      node.appendChild(numSpan);
      node.appendChild(labelSpan);
      node.appendChild(statusIcon);
      track.appendChild(node);

      // Click to select
      node.addEventListener('click', () => {
        this._selectedPhaseKey = key;
        this._dirty.phases = true;
        this._scheduleRender();
      });
    }

    // Render detail for selected phase
    const selected = this.phases.get(this._selectedPhaseKey);
    if (selected) {
      this._renderPhaseDetail(detail, selected);
    }

    // Auto-scroll to selected/active node
    const activeNode = track.querySelector('.phase-selected') || track.querySelector('.phase-active');
    if (activeNode) {
      activeNode.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    }
  }

  _renderPhaseDetail(container, phase) {
    const STATUS_LABELS = {
      pending: 'PENDING',
      in_progress: 'IN PROGRESS',
      completed: 'COMPLETED',
    };

    const header = document.createElement('div');
    header.className = 'phase-detail-header';

    const title = document.createElement('span');
    title.className = 'phase-detail-title';
    title.textContent = phase.subject;

    const badge = document.createElement('span');
    badge.className = `phase-detail-badge phase-badge-${phase.status}`;
    badge.textContent = STATUS_LABELS[phase.status] || phase.status;

    header.appendChild(title);
    header.appendChild(badge);
    container.appendChild(header);

    // Active form (the "doing" description)
    if (phase.activeForm) {
      const active = document.createElement('div');
      active.className = 'phase-detail-active';
      active.textContent = phase.activeForm;
      container.appendChild(active);
    }

    // Description
    if (phase.description) {
      const desc = document.createElement('div');
      desc.className = 'phase-detail-desc';
      desc.textContent = phase.description;
      container.appendChild(desc);
    }

    // Timestamp
    if (phase.timestamp) {
      const time = document.createElement('div');
      time.className = 'phase-detail-time';
      const d = new Date(phase.timestamp);
      time.textContent = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      container.appendChild(time);
    }
  }

  _renderThinking() {
    const el = this._dom.thinkingContent;
    if (el) el.textContent = this.latestThinking;
  }

  _renderPlan() {
    const el = this._dom.planContent;
    const section = this._dom.planSection;
    if (!el || !section) return;

    el.textContent = this.latestPlan;
    if (this.latestPlan) {
      section.classList.add('has-content');
    }
  }

  _renderAgents() {
    const grid = this._dom.agentGrid;
    if (!grid) return;

    grid.innerHTML = '';

    if (this.agents.size === 0) {
      const empty = document.createElement('span');
      empty.className = 'agents-empty';
      empty.textContent = 'no agents';
      grid.appendChild(empty);
      return;
    }

    for (const [, agent] of this.agents) {
      const card = document.createElement('div');
      const kindClass = agent.kind === 'skill' ? 'skill-card'
        : agent.kind === 'team' ? 'team-card' : '';
      const statusClass = agent.status === 'active' ? 'agent-active' : 'agent-idle';
      const blinkClass = (this._lastWorkflowIsAgent && agent.status === 'active') ? 'agent-blink' : '';
      card.className = `agent-card ${kindClass} ${statusClass} ${blinkClass}`.trim();

      const statusEl = document.createElement('span');
      statusEl.className = 'agent-status';
      statusEl.textContent = '\u25CF'; // ●

      const nameEl = document.createElement('span');
      nameEl.className = 'agent-name';
      nameEl.textContent = agent.name;
      nameEl.title = agent.description || agent.name;

      const typeEl = document.createElement('span');
      typeEl.className = 'agent-type';
      typeEl.textContent = agent.type;

      card.appendChild(statusEl);
      card.appendChild(nameEl);
      card.appendChild(typeEl);
      grid.appendChild(card);
    }
  }

  _renderFiles() {
    const el = this._dom.filesContent;
    if (!el) return;

    // Full re-render (file list is typically small)
    el.innerHTML = '';
    for (const file of this.writtenFiles) {
      const row = document.createElement('div');
      row.className = 'file-entry';

      const action = document.createElement('span');
      action.className = `file-action ${file.action}`;
      action.textContent = file.action.toUpperCase();

      const pathEl = document.createElement('span');
      pathEl.className = 'file-path';
      pathEl.textContent = file.path;
      pathEl.title = file.path;

      row.appendChild(action);
      row.appendChild(pathEl);
      el.appendChild(row);
    }

    el.scrollTop = el.scrollHeight;
  }

  _renderTextBash() {
    const el = this._dom.textBashContent;
    if (!el) return;

    // Trim DOM if needed
    while (el.childElementCount > MAX_TEXT_BASH) {
      el.removeChild(el.firstElementChild);
    }

    // Append only new events (track rendered count)
    const rendered = el.childElementCount;
    for (let i = rendered; i < this.textBashEvents.length; i++) {
      const evt = this.textBashEvents[i];
      const row = document.createElement('div');
      row.className = 'textbash-event' + (evt.isError ? ' error-event' : '');

      const time = document.createElement('span');
      time.className = 'textbash-time';
      const d = new Date(evt.timestamp);
      time.textContent = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

      const badge = document.createElement('span');
      badge.className = 'textbash-badge';
      badge.textContent = evt.badge;
      badge.style.color = evt.color;

      const text = document.createElement('span');
      text.className = 'textbash-text';
      text.textContent = evt.text;

      row.appendChild(time);
      row.appendChild(badge);
      row.appendChild(text);
      el.appendChild(row);
    }

    el.scrollTop = el.scrollHeight;
  }

  // === Internal: Agent status timer ===

  _startAgentTimer() {
    this._agentTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [, agent] of this.agents) {
        if (agent.status === 'active' && now - agent.lastSeen > AGENT_IDLE_MS) {
          agent.status = 'idle';
          changed = true;
        }
      }
      if (changed) {
        this._dirty.agents = true;
        this._scheduleRender();
      }
    }, AGENT_CHECK_MS);
  }

  _stopAgentTimer() {
    if (this._agentTimer) {
      clearInterval(this._agentTimer);
      this._agentTimer = null;
    }
  }

  // === Internal: Mode buttons ===

  _updateModeButtons() {
    if (!this.el) return;
    const popBtn = this.el.querySelector('.activity-popout');
    const dockBtn = this.el.querySelector('.activity-dock');
    if (this.mode === 'floating') {
      popBtn.classList.add('hidden');
      dockBtn.classList.remove('hidden');
    } else {
      popBtn.classList.remove('hidden');
      dockBtn.classList.add('hidden');
    }
  }

  // === Internal: Phase extraction from text ===

  _extractPhasesFromText(text) {
    const phases = [];

    // Pattern 1: "Phase N: desc" / "Step N: desc" / "階段 N: desc" (with optional ** markdown)
    const explicit = /(?:^|\n)\s*\**\s*(?:Phase|Step|階段)\s*(\d+)\s*[:：]\**\s*(.+?)(?:\n|$)/gi;
    let m;
    while ((m = explicit.exec(text)) !== null) {
      phases.push({ num: parseInt(m[1]), subject: m[2].replace(/\*+$/g, '').trim() });
    }
    if (phases.length >= 2) return phases;

    // Pattern 2: Numbered list "1. description" — need 3+ consecutive items
    const numbered = /(?:^|\n)\s*(\d+)[.)]\s+(.{5,120})/gm;
    const items = [];
    while ((m = numbered.exec(text)) !== null) {
      items.push({ num: parseInt(m[1]), subject: m[2].trim() });
    }
    if (items.length >= 3 && items[0].num === 1) return items;

    return [];
  }

  // === Internal: Agent color assignment ===

  _agentColor(slug) {
    const COLORS = ['#00ff88', '#6bcbff', '#ffd93d', '#ff6b9d', '#c084fc', '#fb923c', '#67e8f9', '#a3e635'];
    let hash = 0;
    for (let i = 0; i < slug.length; i++) hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
    return COLORS[Math.abs(hash) % COLORS.length];
  }

  // === Internal: Drag ===

  _initDrag(header, panel) {
    let startX, startY, startLeft, startTop;
    let overlay = null;

    const onMouseDown = (e) => {
      if (e.target.closest('.activity-btn')) return;
      e.preventDefault();

      const rect = panel.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;

      overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;cursor:grabbing';
      document.body.appendChild(overlay);

      header.style.cursor = 'grabbing';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = (startLeft + dx) + 'px';
      panel.style.top = (startTop + dy) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      header.style.cursor = '';
      if (overlay) { overlay.remove(); overlay = null; }

      const rect = panel.getBoundingClientRect();
      localStorage.setItem('claudePunk_activityFloatX', Math.round(rect.left));
      localStorage.setItem('claudePunk_activityFloatY', Math.round(rect.top));
    };

    header.addEventListener('mousedown', onMouseDown);
    header.style.cursor = 'grab';
  }
}
