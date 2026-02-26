import type { GameState } from '@ice-king/shared';

export interface PopupAction {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface PopupMenu {
  text: string;
  screenX: number;
  screenY: number;
  warningText?: string;
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
  private readonly debugOverlay: HTMLDivElement;
  private readonly debugToggleButton: HTMLButtonElement;
  private readonly seasonBar: HTMLDivElement;
  private readonly toastStack: HTMLDivElement;
  private readonly popupHost: HTMLDivElement;
  private readonly opponentHead: HTMLDivElement;
  private readonly skipSummerButton: HTMLButtonElement;
  private readonly skipSummerLabel: HTMLSpanElement;
  private readonly skipSummerStatus: HTMLDivElement;

  private readonly statRows: Record<string, HTMLSpanElement>;
  private readonly opponentStatRows: Record<string, HTMLSpanElement>;
  private collapsed = false;
  private opponentCollapsed = false;
  private opponentVisible = true;
  private instructionsCollapsed = true;
  private debugEnabled = false;
  private toasts: ToastItem[] = [];
  private lastPopupSignature: string | null = null;
  private readonly opponentHudBody: HTMLDivElement;
  private readonly opponentHudToggle: HTMLButtonElement;

  constructor(
    mount: HTMLElement,
    onPopupActionClick: (actionId: string) => void,
    sideRailMount?: HTMLElement,
    onSkipSummerClick?: () => void,
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
      '  End the match with the highest money total.',
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

    this.opponentHead = document.createElement('div');
    this.opponentHead.className = 'hud-head pixel-panel';
    this.opponentHead.style.padding = '8px';

    const opponentTitle = document.createElement('h2');
    opponentTitle.className = 'hud-title';
    opponentTitle.textContent = "Other User's Stats";

    this.opponentHudToggle = document.createElement('button');
    this.opponentHudToggle.className = 'hud-toggle';
    this.opponentHudToggle.textContent = '▲';
    this.opponentHudToggle.addEventListener('click', () => {
      this.opponentCollapsed = !this.opponentCollapsed;
      this.opponentHudBody.style.display = this.opponentCollapsed ? 'none' : 'grid';
      this.opponentHudToggle.textContent = this.opponentCollapsed ? '▼' : '▲';
    });

    this.opponentHead.append(opponentTitle, this.opponentHudToggle);

    this.opponentHudBody = document.createElement('div');
    this.opponentHudBody.className = 'hud-body pixel-panel';
    this.opponentHudBody.style.borderColor = 'var(--ui-border)';

    this.opponentStatRows = Object.fromEntries(
      labels.map((label) => {
        const row = document.createElement('div');
        row.className = 'hud-row';
        const key = document.createElement('span');
        key.textContent = label;
        const value = document.createElement('span');
        value.textContent = '-';
        row.append(key, value);
        this.opponentHudBody.append(row);
        return [label, value];
      }),
    ) as Record<string, HTMLSpanElement>;

    this.skipSummerButton = document.createElement('button');
    this.skipSummerButton.className = 'skip-summer-button';
    this.skipSummerButton.type = 'button';
    this.skipSummerButton.style.display = 'none';
    this.skipSummerButton.addEventListener('click', () => {
      onSkipSummerClick?.();
    });

    const skipSummerIcon = document.createElement('span');
    skipSummerIcon.className = 'skip-summer-icon';

    const skipSummerSun = document.createElement('span');
    skipSummerSun.className = 'skip-summer-sun';
    const skipSummerSnow = document.createElement('span');
    skipSummerSnow.className = 'skip-summer-snow';
    skipSummerIcon.append(skipSummerSun, skipSummerSnow);

    this.skipSummerLabel = document.createElement('span');
    this.skipSummerLabel.className = 'skip-summer-label';
    this.skipSummerLabel.textContent = 'skip summer';

    this.skipSummerButton.append(skipSummerIcon, this.skipSummerLabel);

    this.skipSummerStatus = document.createElement('div');
    this.skipSummerStatus.className = 'skip-summer-status';
    this.skipSummerStatus.style.display = 'none';

    this.instructions.append(instructionsHead, this.instructionsBody);
    this.hud.append(
      this.instructions,
      hudHead,
      this.hudBody,
      this.opponentHead,
      this.opponentHudBody,
      this.skipSummerButton,
      this.skipSummerStatus,
    );

    this.debugToggleButton = document.createElement('button');
    this.debugToggleButton.className = 'pixel-button debug-toggle';
    this.debugToggleButton.textContent = 'Toggle debug';
    this.debugToggleButton.addEventListener('click', () => {
      this.debugEnabled = !this.debugEnabled;
      this.debugOverlay.style.display = this.debugEnabled ? 'block' : 'none';
    });

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

    if (sideRailMount) {
      sideRailMount.append(this.hud);
    } else {
      this.overlay.append(this.hud);
    }

    this.overlay.append(
      this.debugToggleButton,
      this.debugOverlay,
      this.seasonBar,
      this.toastStack,
      this.popupHost,
    );

    mount.append(this.overlay);

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

  setOpponentStatsVisible(visible: boolean): void {
    this.opponentVisible = visible;
    this.opponentHead.style.display = visible ? 'flex' : 'none';
    this.opponentHudBody.style.display = visible
      ? this.opponentCollapsed
        ? 'none'
        : 'grid'
      : 'none';
  }

  updateStats(
    state: GameState,
    playerId: string,
    extra: { refrigerated: number; unrefrigerated: number; capacity: number },
    opponentId: string | null,
    opponentExtra: { refrigerated: number; unrefrigerated: number; capacity: number },
  ): void {
    const player = state.players[playerId] ?? null;
    const opponent = opponentId ? state.players[opponentId] ?? null : null;

    const setRows = (rows: Record<string, HTMLSpanElement>, targetPlayer: GameState['players'][string] | null, storage: {
      refrigerated: number;
      unrefrigerated: number;
      capacity: number;
    }) => {
      if (!targetPlayer) {
        rows.money.textContent = '-';
        rows.ice.textContent = '-';
        rows.blueIce.textContent = '-';
        rows.refrigerators.textContent = '-';
        rows.refrigerated.textContent = '-';
        rows.unrefrigerated.textContent = '-';
        rows.unrefrigerated.className = '';
        rows.season.textContent = '-';
        rows.trainWindow.textContent = '-';
        return;
      }

      rows.money.textContent = `$${targetPlayer.money}c`;
      rows.ice.textContent = `${targetPlayer.ice}`;
      rows.blueIce.textContent = `${targetPlayer.blueIce}`;
      rows.refrigerators.textContent = `${targetPlayer.refrigerators}`;
      rows.refrigerated.textContent = `${storage.refrigerated}/${storage.capacity}`;
      rows.unrefrigerated.textContent = `${storage.unrefrigerated}`;
      rows.unrefrigerated.className = storage.unrefrigerated > 0 ? 'warning' : '';
      rows.season.textContent = `${state.season.logicSeason} kf:${state.season.transitionKeyframeIndex}`;

      const year = state.trainSales.currentYear;
      const used = state.trainSales.usedByPlayerId[targetPlayer.id] === year;
      rows.trainWindow.textContent = used ? `Year ${year}: Used` : `Year ${year}: Ready`;
    };

    setRows(this.statRows, player, extra);
    setRows(this.opponentStatRows, opponent, opponentExtra);

    if (this.opponentVisible) {
      this.opponentHead.style.display = 'flex';
      this.opponentHudBody.style.display = this.opponentCollapsed ? 'none' : 'grid';

      if (opponent?.color === 'RED') {
        this.opponentHead.style.borderColor = 'var(--red)';
        this.opponentHudBody.style.borderColor = 'var(--red)';
      } else if (opponent?.color === 'BLUE') {
        this.opponentHead.style.borderColor = 'var(--blue)';
        this.opponentHudBody.style.borderColor = 'var(--blue)';
      } else {
        this.opponentHead.style.borderColor = 'var(--ui-border)';
        this.opponentHudBody.style.borderColor = 'var(--ui-border)';
      }
    } else {
      this.opponentHead.style.display = 'none';
      this.opponentHudBody.style.display = 'none';
    }

    const canVoteToSkipSummer = Boolean(
      player &&
        opponent &&
        player.controller === 'HUMAN' &&
        opponent.controller === 'HUMAN' &&
        state.season.logicSeason === 'SUMMER' &&
        !state.match.ended,
    );
    this.skipSummerButton.style.display = canVoteToSkipSummer ? 'flex' : 'none';
    this.skipSummerStatus.style.display = canVoteToSkipSummer ? 'block' : 'none';

    if (canVoteToSkipSummer && opponentId) {
      const playerVoted = state.summerSkipVotesByPlayerId[playerId] === true;
      const opponentVoted = state.summerSkipVotesByPlayerId[opponentId] === true;

      this.skipSummerButton.disabled = playerVoted;
      this.skipSummerLabel.textContent = playerVoted ? 'vote locked' : 'skip summer';

      if (playerVoted && opponentVoted) {
        this.skipSummerStatus.textContent = 'Both voted. Skipping to winter.';
      } else if (playerVoted) {
        this.skipSummerStatus.textContent = 'Vote sent. Waiting for the other player.';
      } else if (opponentVoted) {
        this.skipSummerStatus.textContent = 'Other player voted. Click to agree and skip.';
      } else {
        this.skipSummerStatus.textContent = 'Both players must vote to skip summer.';
      }
    } else {
      this.skipSummerButton.disabled = true;
      this.skipSummerLabel.textContent = 'skip summer';
      this.skipSummerStatus.textContent = '';
    }

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

  setPondPopup(popup: PopupMenu | null): void {
    const signature = popup
      ? `${popup.text}::${popup.warningText ?? ''}::${popup.screenX}::${popup.screenY}::${popup.actions
          .map((action) => `${action.id}|${action.label}|${action.disabled ? '1' : '0'}`)
          .join(',')}`
      : '';
    if (signature === this.lastPopupSignature) {
      return;
    }
    this.lastPopupSignature = signature;

    if (!popup) {
      this.popupHost.innerHTML = '';
      return;
    }

    const node = document.createElement('div');
    node.className = 'popup pixel-panel';
    node.style.left = `${popup.screenX}px`;
    node.style.top = `${popup.screenY}px`;
    node.style.pointerEvents = 'auto';

    const text = document.createElement('div');
    text.textContent = popup.text;
    node.append(text);

    if (popup.warningText) {
      const warning = document.createElement('div');
      warning.className = 'popup-warning';
      warning.textContent = popup.warningText;
      node.append(warning);
    }

    const buttons = document.createElement('div');
    buttons.className = 'popup-buttons';

    for (const action of popup.actions) {
      const button = document.createElement('button');
      button.className = 'pixel-button';
      button.textContent = action.label;
      button.disabled = Boolean(action.disabled);
      button.setAttribute('data-popup-action-id', action.id);
      buttons.append(button);
    }

    if (buttons.children.length > 0) {
      node.append(buttons);
    }

    this.popupHost.innerHTML = '';
    this.popupHost.append(node);
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

  destroy(): void {
    for (const toast of this.toasts) {
      window.clearTimeout(toast.timeout);
    }
    this.overlay.remove();
  }
}
