import type { GameState } from '@ice-king/shared';

export interface TileActionOption {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface PopupAction {
  id: string;
  label: string;
}

export interface PondPopup {
  text: string;
  screenX: number;
  screenY: number;
  actions: PopupAction[];
}

interface ToastItem {
  id: string;
  text: string;
  timeout: number;
}

export class HudLayer {
  readonly overlay: HTMLDivElement;
  private readonly hud: HTMLDivElement;
  private readonly instructions: HTMLDivElement;
  private readonly instructionsBody: HTMLDivElement;
  private readonly instructionsToggle: HTMLButtonElement;
  private readonly hudBody: HTMLDivElement;
  private readonly hudToggle: HTMLButtonElement;
  private readonly actionPanel: HTMLDivElement;
  private readonly actionButtons: HTMLDivElement;
  private readonly actionInfo: HTMLDivElement;
  private readonly debugOverlay: HTMLDivElement;
  private readonly seasonBar: HTMLDivElement;
  private readonly toastStack: HTMLDivElement;
  private readonly popupHost: HTMLDivElement;

  private readonly statRows: Record<string, HTMLSpanElement>;
  private collapsed = false;
  private instructionsCollapsed = true;
  private debugEnabled = false;
  private toasts: ToastItem[] = [];
  private lastActionPanelSignature: string | null = null;

  constructor(
    mount: HTMLElement,
    onActionClick: (actionId: string) => void,
    onPopupActionClick: (actionId: string) => void,
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay-layer';

    this.hud = document.createElement('div');
    this.hud.className = 'hud';

    this.instructions = document.createElement('div');
    this.instructions.className = 'instructions';

    const instructionsHead = document.createElement('div');
    instructionsHead.className = 'hud-head pixel-panel';
    instructionsHead.style.padding = '8px';

    const instructionsTitle = document.createElement('h2');
    instructionsTitle.className = 'hud-title';
    instructionsTitle.textContent = 'Instructions';

    this.instructionsToggle = document.createElement('button');
    this.instructionsToggle.className = 'hud-toggle';
    this.instructionsToggle.textContent = '▼';
    this.instructionsToggle.addEventListener('click', () => {
      this.instructionsCollapsed = !this.instructionsCollapsed;
      this.instructionsBody.style.display = this.instructionsCollapsed ? 'none' : 'block';
      this.instructionsToggle.textContent = this.instructionsCollapsed ? '▼' : '▲';
    });

    instructionsHead.append(instructionsTitle, this.instructionsToggle);

    this.instructionsBody = document.createElement('div');
    this.instructionsBody.className = 'instructions-body pixel-panel';
    this.instructionsBody.style.display = 'none';
    this.instructionsBody.textContent = [
      'Welcome, Your Majesty.',
      '',
      'Goal:',
      '  End the match with the highest net worth: cash + land + ice + industry.',
      '',
      'How To Rule:',
      '  1) Buy land. Click a tile to select it, then click again to open Tile Actions.',
      '  2) Winter freezes ponds. Own a pond to start a harvest job and collect ice when ready.',
      '  3) Build factories on owned grass/forest to craft refrigerators and blue ice.',
      '  4) Refrigerators protect ice from the summer melt.',
      '  5) Sell ice at your houses for coins, or ship big loads at the train once per year.',
      '',
      'Royal Tips:',
      '  - Drag the map to pan. Use the minimap to jump the camera.',
      '  - Borders are dead land: you cannot buy or build there.',
      '  - Press F3 for debug, F for fullscreen.',
      '',
      'May your treasury grow cold and your rival grow broke.',
    ].join('\n');

    const hudHead = document.createElement('div');
    hudHead.className = 'hud-head pixel-panel';
    hudHead.style.padding = '8px';

    const hudTitle = document.createElement('h2');
    hudTitle.className = 'hud-title';
    hudTitle.textContent = 'Stats';

    this.hudToggle = document.createElement('button');
    this.hudToggle.className = 'hud-toggle';
    this.hudToggle.textContent = '▲';
    this.hudToggle.addEventListener('click', () => {
      this.collapsed = !this.collapsed;
      this.hudBody.style.display = this.collapsed ? 'none' : 'grid';
      this.hudToggle.textContent = this.collapsed ? '▼' : '▲';
    });

    hudHead.append(hudTitle, this.hudToggle);

    this.hudBody = document.createElement('div');
    this.hudBody.className = 'hud-body pixel-panel';

    const labels = [
      'money',
      'ice',
      'blueIce',
      'refrigerators',
      'refrigerated',
      'unrefrigerated',
      'season',
      'trainWindow',
    ] as const;

    this.statRows = Object.fromEntries(
      labels.map((label) => {
        const row = document.createElement('div');
        row.className = 'hud-row';
        const key = document.createElement('span');
        key.textContent = label;
        const value = document.createElement('span');
        value.textContent = '-';
        row.append(key, value);
        this.hudBody.append(row);
        return [label, value];
      }),
    ) as Record<string, HTMLSpanElement>;

    this.instructions.append(instructionsHead, this.instructionsBody);
    this.hud.append(this.instructions, hudHead, this.hudBody);

    this.actionPanel = document.createElement('div');
    this.actionPanel.className = 'action-panel pixel-panel';

    const actionTitle = document.createElement('h3');
    actionTitle.textContent = 'Tile Actions';
    this.actionInfo = document.createElement('div');
    this.actionInfo.textContent = 'Select a tile.';

    this.actionButtons = document.createElement('div');
    this.actionButtons.className = 'action-buttons';

    const debugButton = document.createElement('button');
    debugButton.className = 'pixel-button';
    debugButton.style.fontSize = '9px';
    debugButton.textContent = 'Toggle Debug (F3)';
    debugButton.addEventListener('click', () => {
      this.debugEnabled = !this.debugEnabled;
      this.debugOverlay.style.display = this.debugEnabled ? 'block' : 'none';
    });

    this.actionPanel.append(actionTitle, this.actionInfo, this.actionButtons, debugButton);

    this.debugOverlay = document.createElement('div');
    this.debugOverlay.className = 'debug-overlay pixel-panel';
    this.debugOverlay.style.display = 'none';
    this.debugOverlay.textContent = 'Debug overlay';

    this.seasonBar = document.createElement('div');
    this.seasonBar.className = 'season-bar pixel-panel';

    this.toastStack = document.createElement('div');
    this.toastStack.className = 'toast-stack';

    this.popupHost = document.createElement('div');
    this.popupHost.style.position = 'absolute';
    this.popupHost.style.inset = '0';
    this.popupHost.style.pointerEvents = 'none';

    this.overlay.append(
      this.hud,
      this.actionPanel,
      this.debugOverlay,
      this.seasonBar,
      this.toastStack,
      this.popupHost,
    );

    mount.append(this.overlay);

    this.actionButtons.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const actionButton = target.closest<HTMLElement>('[data-action-id]');
      const actionId = actionButton?.getAttribute('data-action-id');
      if (!actionId) {
        return;
      }
      onActionClick(actionId);
    });

    this.popupHost.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const actionButton = target.closest<HTMLElement>('[data-popup-action-id]');
      const actionId = actionButton?.getAttribute('data-popup-action-id');
      if (!actionId) {
        return;
      }
      onPopupActionClick(actionId);
    });
  }

  setDebugVisible(visible: boolean): void {
    this.debugEnabled = visible;
    this.debugOverlay.style.display = visible ? 'block' : 'none';
  }

  updateStats(state: GameState, playerId: string, extra: { refrigerated: number; unrefrigerated: number; capacity: number }): void {
    const player = state.players[playerId];
    if (!player) {
      return;
    }

    this.statRows.money.textContent = `$${player.money}c`;
    this.statRows.ice.textContent = `${player.ice}`;
    this.statRows.blueIce.textContent = `${player.blueIce}`;
    this.statRows.refrigerators.textContent = `${player.refrigerators}`;
    this.statRows.refrigerated.textContent = `${extra.refrigerated}/${extra.capacity}`;
    this.statRows.unrefrigerated.textContent = `${extra.unrefrigerated}`;
    this.statRows.unrefrigerated.className = extra.unrefrigerated > 0 ? 'warning' : '';
    this.statRows.season.textContent = `${state.season.logicSeason} kf:${state.season.transitionKeyframeIndex}`;

    const year = state.trainSales.currentYear;
    const used = state.trainSales.usedByPlayerId[playerId] === year;
    this.statRows.trainWindow.textContent = used ? `Year ${year}: Used` : `Year ${year}: Ready`;

    const cycleElapsed = state.nowMs - state.season.cycleStartMs;
    const cycleRemaining = Math.max(0, state.season.cycleDurationMs - cycleElapsed);
    const minutes = Math.floor(cycleRemaining / 60000);
    const seconds = Math.floor((cycleRemaining % 60000) / 1000)
      .toString()
      .padStart(2, '0');

    this.seasonBar.textContent = `${state.season.logicSeason} | Next flip in ${minutes}:${seconds} | Visual transition ${Math.round(
      state.season.transitionProgress * 100,
    )}%`;
  }

  setActionPanel(title: string, actions: TileActionOption[]): void {
    const signature = title
      ? `${title}::${actions.map((action) => `${action.id}|${action.label}|${action.disabled ? '1' : '0'}`).join(',')}`
      : '';
    if (signature === this.lastActionPanelSignature) {
      return;
    }
    this.lastActionPanelSignature = signature;

    if (!title) {
      this.actionPanel.classList.add('hidden');
      this.actionInfo.textContent = 'Select a tile.';
      this.actionButtons.innerHTML = '';
      return;
    }

    this.actionPanel.classList.remove('hidden');
    this.actionInfo.textContent = title;
    this.actionButtons.innerHTML = '';

    if (actions.length === 0) {
      const noActions = document.createElement('div');
      noActions.textContent = 'No actions available for this tile.';
      this.actionButtons.append(noActions);
      return;
    }

    for (const action of actions) {
      const button = document.createElement('button');
      button.className = 'pixel-button';
      button.textContent = action.label;
      button.disabled = Boolean(action.disabled);
      button.setAttribute('data-action-id', action.id);
      this.actionButtons.append(button);
    }
  }

  setDebugText(text: string): void {
    this.debugOverlay.textContent = text;
  }

  showToast(text: string): void {
    const id = `${Date.now()}_${Math.random()}`;
    const item: ToastItem = {
      id,
      text,
      timeout: window.setTimeout(() => {
        this.toasts = this.toasts.filter((entry) => entry.id !== id);
        this.renderToasts();
      }, 2800),
    };

    this.toasts.push(item);
    this.renderToasts();
  }

  private renderToasts(): void {
    this.toastStack.innerHTML = '';
    for (const toast of this.toasts) {
      const node = document.createElement('div');
      node.className = 'toast';
      node.textContent = toast.text;
      this.toastStack.append(node);
    }
  }

  setPondPopup(popup: PondPopup | null): void {
    this.popupHost.innerHTML = '';
    if (!popup) {
      return;
    }

    const node = document.createElement('div');
    node.className = 'popup pixel-panel';
    node.style.left = `${popup.screenX}px`;
    node.style.top = `${popup.screenY}px`;
    node.style.pointerEvents = 'auto';

    const text = document.createElement('div');
    text.textContent = popup.text;

    const buttons = document.createElement('div');
    buttons.className = 'popup-buttons';

    for (const action of popup.actions) {
      const button = document.createElement('button');
      button.className = 'pixel-button';
      button.textContent = action.label;
      button.setAttribute('data-popup-action-id', action.id);
      buttons.append(button);
    }

    node.append(text, buttons);
    this.popupHost.append(node);
  }

  destroy(): void {
    for (const toast of this.toasts) {
      window.clearTimeout(toast.timeout);
    }
    this.overlay.remove();
  }
}
