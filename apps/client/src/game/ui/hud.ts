import type { GameState, WarCraftJob } from '@ice-king/shared';
import type { GameMode, RuntimeOpponentType } from '../types';

/**
 * Build the in-game instructions text for the collapsable Instructions panel,
 * tailored to the current game mode. Sections:
 *   - Intro line that names the mode + opponent makeup
 *   - Goal (mode-specific)
 *   - How To Rule — the universal economy loop
 *   - Warfare — WAR Factory / nukes / warriors (skipped or noted for SOLO)
 *   - Royal Tips — controls + mode-specific tactical hints
 *   - Closing flavour line
 */
export function buildInstructionsText(
  gameMode: GameMode,
  opponentType: RuntimeOpponentType,
): string {
  const baseEconomyLoop = [
    'How To Rule:',
    '  1) Buy land. Click a tile to select it, then click again to open Tile Actions.',
    '  2) Winter freezes ponds. Own a pond to start a harvest job and collect ice when it ripens.',
    '  3) Build factories on owned grass or forest to craft refrigerators and rare blue ice.',
    '  4) Refrigerators protect ice from the summer melt — keep your refrigerated count high.',
    '  5) Sell ice at your houses for coins, or ship a big load at the train once per year.',
  ];

  const baseControls = [
    '  - Drag the map to pan. Click the minimap to jump the camera.',
    '  - Borders are dead land: you cannot buy or build there.',
    '  - Press F3 for the debug overlay, F for fullscreen.',
  ];

  const warfareSection = (extra?: string) => {
    const lines = [
      'Warfare:',
      '  - Build a War Factory on owned land (costs 1 blue ice + $2c) to craft warriors and nukes.',
      '  - Warriors take 1 minute to craft (2 per batch); nukes take 4 minutes.',
      '  - Click WAR in the side rail to declare war. While war is active, commit warriors to the',
      '    BLUE arena — they auto-fight the enemy RED arena when the war timer expires.',
      '  - Win a battle to steal half the enemy treasury. Nukes destroy enemy tiles outright.',
    ];
    if (extra) lines.push(extra);
    return lines;
  };

  const closing = 'May your treasury grow cold and your rival grow broke.';

  switch (gameMode) {
    case 'PLAY_VS_COMPUTER':
      return [
        'Welcome, Your Majesty.',
        '',
        'A local duel against the Ice Bot.',
        '',
        'Goal:',
        '  End the 30-minute match with more money than the Ice Bot.',
        '  If you are tied at time, an overtime period decides it.',
        '',
        ...baseEconomyLoop,
        '',
        ...warfareSection(),
        '',
        'Royal Tips:',
        ...baseControls,
        '  - The Ice Bot adapts to the season — do not sleep on summer prep.',
        '  - Use the WAR button early once you have blue ice: stolen gold compounds fast.',
        '',
        closing,
      ].join('\n');

    case 'PLAY_ONLINE':
      return [
        'Welcome, Your Majesty.',
        '',
        'An online duel against another human ruler.',
        '',
        'Goal:',
        '  End the 30-minute match with more money than your rival.',
        '  Overtime breaks ties; if still tied, the match is a draw.',
        '',
        ...baseEconomyLoop,
        '',
        ...warfareSection(),
        '',
        'Royal Tips:',
        ...baseControls,
        '  - Use the chat panel to taunt, trade, or sue for peace.',
        '  - Latency aside, both rulers play on the same simulated tick — your clicks are authoritative.',
        '',
        closing,
      ].join('\n');

    case 'SOLO':
      return [
        'Welcome, Your Majesty.',
        '',
        'A solo run. No opponent — just you and the seasons.',
        '',
        'Goal:',
        '  Run your economy for 30 minutes and grow your treasury as large as possible.',
        '  Solo runs are for high-score chasing; final money is not converted to Ice Coins.',
        '',
        ...baseEconomyLoop,
        '',
        'Warfare:',
        '  - War Factory can be built and warriors crafted, but there is no enemy to fight.',
        '  - Use Solo to learn the economy and refrigerator timing without pressure.',
        '',
        'Royal Tips:',
        ...baseControls,
        '  - No rival means no land race. Optimise for refrigerator coverage and train shipments.',
        '  - Plant factories early on safe inland tiles; ponds first when winter starts.',
        '',
        closing,
      ].join('\n');

    case 'FRIENDLY':
      return [
        'Welcome, Your Majesty.',
        '',
        'A friendly co-op match. You and a teammate share land ownership,',
        'but keep separate money and ice reserves.',
        '',
        'Goal:',
        '  End the 30-minute match with the highest combined team money.',
        '  Your team total is the sum of both rulers\' coffers.',
        '',
        ...baseEconomyLoop,
        '',
        ...warfareSection(
          '  - Shared land means either teammate can build a War Factory — coordinate so you don\'t double-spend.',
        ),
        '',
        'Royal Tips:',
        ...baseControls,
        '  - Shared land = no land-grab race. Split duties: one rules ice, the other runs factories.',
        '  - Each ruler still pays their own taxes — keep both treasuries healthy.',
        '',
        closing,
      ].join('\n');

    case 'TEAM':
      return [
        'Welcome, Your Majesty.',
        '',
        'A 4-player 2v2 team match: BLUE versus RED, with a scaled-up map and pond count.',
        '',
        'Goal:',
        '  End the 30-minute match with the highest combined team money.',
        '  Both BLUE rulers pool their coffers — same for RED.',
        '',
        ...baseEconomyLoop,
        '',
        ...warfareSection(
          '  - WAR battles count team-wide: warriors from both team members fight together.',
        ),
        '',
        'Royal Tips:',
        ...baseControls,
        '  - Split economy roles with your teammate: one focuses ponds, one factories.',
        '  - Coordinate WAR timing in chat — pooled warriors swing the battle.',
        '  - Watch both enemies\' refrigerator counts. A late summer nuke on a fridge tile is devastating.',
        '',
        closing,
      ].join('\n');

    case 'ICE_WARS':
      return [
        'Welcome, Your Majesty.',
        '',
        'Ice Wars is a locked, in-development team mode.',
        'If you are seeing this in-game, it has been enabled for testing.',
        '',
        'Goal:',
        '  TBD — expect team-based warfare with the full WAR mechanic featured front-and-centre.',
        '',
        ...baseEconomyLoop,
        '',
        ...warfareSection(),
        '',
        'Royal Tips:',
        ...baseControls,
        '',
        closing,
      ].join('\n');

    default: {
      // Exhaustiveness check — if GameMode gains a new variant, this surfaces it.
      const _exhaustive: never = gameMode;
      void _exhaustive;
      return 'Welcome, Your Majesty.';
    }
  }
}

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

  // War panel
  private readonly warPanel: HTMLDivElement;
  private readonly warButton: HTMLButtonElement;
  private readonly warTimerEl: HTMLDivElement;
  private readonly warResultEl: HTMLDivElement;
  private readonly warriorBoxes: HTMLDivElement;
  private readonly blueWarriorBox: HTMLDivElement;
  private readonly redWarriorBox: HTMLDivElement;
  private readonly blueFlag: HTMLDivElement;
  private readonly redFlag: HTMLDivElement;
  private onWarButtonClick: (() => void) | null = null;
  private onWarCommitClick: ((count: number) => void) | null = null;

  constructor(
    mount: HTMLElement,
    onPopupActionClick: (actionId: string) => void,
    sideRailMount?: HTMLElement,
    onSkipSummerClick?: () => void,
    gameMode: GameMode = 'PLAY_VS_COMPUTER',
    opponentType: RuntimeOpponentType = 'BOT',
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
    this.instructionsBody.textContent = buildInstructionsText(gameMode, opponentType);

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

    // ── War Panel ──────────────────────────────────────────────────
    this.warPanel = document.createElement('div');
    this.warPanel.className = 'war-panel pixel-panel';

    const warPanelHead = document.createElement('div');
    warPanelHead.className = 'war-panel-head';

    const warPanelTitle = document.createElement('span');
    warPanelTitle.className = 'war-panel-title';
    warPanelTitle.textContent = '⚔ WAR';

    this.warButton = document.createElement('button');
    this.warButton.className = 'pixel-button war-button';
    this.warButton.textContent = 'WAR';
    this.warButton.addEventListener('click', () => {
      this.onWarButtonClick?.();
    });

    warPanelHead.append(warPanelTitle, this.warButton);

    this.warTimerEl = document.createElement('div');
    this.warTimerEl.className = 'war-timer';
    this.warTimerEl.style.display = 'none';

    this.warResultEl = document.createElement('div');
    this.warResultEl.className = 'war-result';
    this.warResultEl.style.display = 'none';

    // Warrior boxes (blue on left, red on right)
    this.warriorBoxes = document.createElement('div');
    this.warriorBoxes.className = 'warrior-boxes';

    this.blueWarriorBox = document.createElement('div');
    this.blueWarriorBox.className = 'warrior-box warrior-box-blue';

    const blueBoxLabel = document.createElement('div');
    blueBoxLabel.className = 'warrior-box-label';
    blueBoxLabel.textContent = 'BLUE';
    blueBoxLabel.style.color = 'var(--blue)';

    const blueBoxArena = document.createElement('div');
    blueBoxArena.className = 'warrior-arena';

    const blueCommitRow = document.createElement('div');
    blueCommitRow.className = 'warrior-commit-row';

    const blueAddBtn = document.createElement('button');
    blueAddBtn.className = 'pixel-button warrior-add-btn';
    blueAddBtn.textContent = '+';
    blueAddBtn.setAttribute('data-color', 'BLUE');
    blueAddBtn.addEventListener('click', () => {
      this.onWarCommitClick?.(1);
    });

    const blueCountEl = document.createElement('span');
    blueCountEl.className = 'warrior-committed-count';
    blueCountEl.textContent = '0';
    blueCountEl.setAttribute('data-warrior-color', 'BLUE');

    blueCommitRow.append(blueAddBtn, blueCountEl);

    this.blueFlag = document.createElement('div');
    this.blueFlag.className = 'war-flag war-flag-blue';
    this.blueFlag.style.display = 'none';
    this.blueFlag.textContent = '🏴';

    this.blueWarriorBox.append(blueBoxLabel, blueBoxArena, blueCommitRow, this.blueFlag);

    this.redWarriorBox = document.createElement('div');
    this.redWarriorBox.className = 'warrior-box warrior-box-red';

    const redBoxLabel = document.createElement('div');
    redBoxLabel.className = 'warrior-box-label';
    redBoxLabel.textContent = 'RED';
    redBoxLabel.style.color = 'var(--red)';

    const redBoxArena = document.createElement('div');
    redBoxArena.className = 'warrior-arena';

    const redCommitRow = document.createElement('div');
    redCommitRow.className = 'warrior-commit-row';

    const redAddBtn = document.createElement('button');
    redAddBtn.className = 'pixel-button warrior-add-btn';
    redAddBtn.textContent = '+';
    redAddBtn.setAttribute('data-color', 'RED');
    redAddBtn.addEventListener('click', () => {
      this.onWarCommitClick?.(1);
    });

    const redCountEl = document.createElement('span');
    redCountEl.className = 'warrior-committed-count';
    redCountEl.textContent = '0';
    redCountEl.setAttribute('data-warrior-color', 'RED');

    redCommitRow.append(redAddBtn, redCountEl);

    this.redFlag = document.createElement('div');
    this.redFlag.className = 'war-flag war-flag-red';
    this.redFlag.style.display = 'none';
    this.redFlag.textContent = '🏴';

    this.redWarriorBox.append(redBoxLabel, redBoxArena, redCommitRow, this.redFlag);

    this.warriorBoxes.append(this.blueWarriorBox, this.redWarriorBox);

    this.warPanel.append(warPanelHead, this.warTimerEl, this.warResultEl, this.warriorBoxes);
    // ────────────────────────────────────────────────────────────────

    this.instructions.append(instructionsHead, this.instructionsBody);
    this.hud.append(
      this.instructions,
      hudHead,
      this.hudBody,
      this.opponentHead,
      this.opponentHudBody,
      this.skipSummerButton,
      this.skipSummerStatus,
      this.warPanel,
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
        player.controller === 'HUMAN' &&
        state.season.logicSeason === 'SUMMER' &&
        !state.match.ended &&
        state.playerOrder.length > 0,
    );
    this.skipSummerButton.style.display = canVoteToSkipSummer ? 'flex' : 'none';
    this.skipSummerStatus.style.display = canVoteToSkipSummer ? 'block' : 'none';

    if (canVoteToSkipSummer) {
      const playerVoted = state.summerSkipVotesByPlayerId[playerId] === true;

      this.skipSummerButton.disabled = playerVoted;
      this.skipSummerLabel.textContent = playerVoted ? 'vote locked' : 'skip summer';

      if (playerVoted) {
        if (state.playerOrder.length === 1) {
          this.skipSummerStatus.textContent = 'Vote recorded. Summer skipped.';
        } else {
          const opponentVoted = opponentId ? state.summerSkipVotesByPlayerId[opponentId] === true : false;
          if (opponentVoted) {
            this.skipSummerStatus.textContent = 'Both voted. Skipping to winter.';
          } else {
            this.skipSummerStatus.textContent = 'Vote sent. Waiting for the other player.';
          }
        }
      } else if (opponentId && state.summerSkipVotesByPlayerId[opponentId] === true) {
        this.skipSummerStatus.textContent = 'Other player voted. Click to agree and skip.';
      } else {
        this.skipSummerStatus.textContent =
          state.playerOrder.length === 1 ? 'You can skip summer to winter.' : 'Both players must vote to skip summer.';
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

  setWarCallbacks(
    onWarButtonClick: () => void,
    onWarCommitClick: (count: number) => void,
  ): void {
    this.onWarButtonClick = onWarButtonClick;
    this.onWarCommitClick = onWarCommitClick;
  }

  updateWarPanel(
    state: GameState,
    localPlayerId: string,
    nowMs: number,
    pendingWarCraftJobs: WarCraftJob[],
  ): void {
    const session = state.warSession;
    const localPlayer = state.players[localPlayerId];
    if (!localPlayer) return;

    const isWarActive = session && !session.resolved;
    const isShowingResult = session?.resolved && session.showResultUntilMs !== null && nowMs < session.showResultUntilMs;

    // WAR button: show when no active war
    this.warButton.style.display = !isWarActive && !isShowingResult ? 'block' : 'none';

    // Timer
    if (isWarActive) {
      const remaining = Math.max(0, session.endsAtMs - nowMs);
      const min = Math.floor(remaining / 60000);
      const sec = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      this.warTimerEl.textContent = `WAR ENDS IN ${min}:${sec}`;
      this.warTimerEl.style.display = 'block';
    } else {
      this.warTimerEl.style.display = 'none';
    }

    // Result banner
    if (isShowingResult && session) {
      const winnerId = session.winnerId;
      const isWinner = winnerId === localPlayerId;
      const winner = winnerId ? state.players[winnerId] : null;
      if (!winnerId) {
        this.warResultEl.textContent = 'TIE! No winner.';
        this.warResultEl.className = 'war-result war-result-tie';
      } else if (isWinner) {
        this.warResultEl.textContent = `YOU WIN! Stole half their gold!`;
        this.warResultEl.className = 'war-result war-result-win';
      } else {
        this.warResultEl.textContent = `YOU LOSE! ${winner?.name ?? 'Enemy'} took half your gold!`;
        this.warResultEl.className = 'war-result war-result-lose';
      }
      this.warResultEl.style.display = 'block';
    } else {
      this.warResultEl.style.display = 'none';
    }

    // Update each warrior box
    for (const pid of state.playerOrder) {
      const player = state.players[pid];
      if (!player) continue;

      const color = player.color;
      const box = color === 'BLUE' ? this.blueWarriorBox : this.redWarriorBox;
      const flag = color === 'BLUE' ? this.blueFlag : this.redFlag;
      const arena = box.querySelector('.warrior-arena') as HTMLDivElement;
      const countEl = box.querySelector('.warrior-committed-count') as HTMLSpanElement;
      const addBtn = box.querySelector('.warrior-add-btn') as HTMLButtonElement;

      // Committed count display
      const committed = session?.committedByPlayerId[pid] ?? 0;
      countEl.textContent = String(committed);

      // Add button: only show if it's the local player's box, war is active, and they have warriors
      const isLocalPlayer = pid === localPlayerId;
      if (isLocalPlayer && isWarActive) {
        addBtn.style.display = 'block';
        addBtn.disabled = player.warriors < 1;
      } else {
        addBtn.style.display = 'none';
      }

      // Warriors walking animation in arena
      const totalWarriors = isShowingResult && session?.winnerId
        ? (session.winnerId === pid ? committed + (session.committedByPlayerId[session.winnerId] ?? 0) : 0)
        : committed;

      // Rebuild warrior figures if count changed
      const existing = arena.querySelectorAll('.warrior-figure').length;
      if (existing !== totalWarriors) {
        arena.innerHTML = '';
        for (let i = 0; i < Math.min(totalWarriors, 8); i++) {
          const fig = document.createElement('div');
          fig.className = `warrior-figure warrior-figure-${color.toLowerCase()}`;
          fig.style.animationDelay = `${(i * 0.18).toFixed(2)}s`;
          arena.append(fig);
        }
        if (totalWarriors > 8) {
          const more = document.createElement('span');
          more.className = 'warrior-overflow';
          more.textContent = `+${totalWarriors - 8}`;
          arena.append(more);
        }
      }

      // Flag: show on loser after result
      if (isShowingResult && session?.winnerId && session.winnerId !== pid) {
        const winnerColor = state.players[session.winnerId]?.color ?? 'BLUE';
        flag.textContent = winnerColor === 'BLUE' ? '🔵' : '🔴';
        flag.style.display = 'block';
        flag.className = `war-flag war-flag-${winnerColor.toLowerCase()}`;
      } else if (!isShowingResult) {
        flag.style.display = 'none';
      }
    }

    // Add button for non-opponent player in non-war state — show inventory
    const nukeInfo = document.getElementById('war-nuke-info');
    if (nukeInfo) {
      nukeInfo.textContent = `Nukes: ${localPlayer.nukes} | Warriors: ${localPlayer.warriors}`;
    }

    // Show inventory row at top of war panel (nukes/warriors)
    let inventoryRow = this.warPanel.querySelector('.war-inventory') as HTMLDivElement | null;
    if (!inventoryRow) {
      inventoryRow = document.createElement('div');
      inventoryRow.className = 'war-inventory';
      this.warPanel.insertBefore(inventoryRow, this.warPanel.children[1] ?? null);
    }
    inventoryRow.textContent = `💣 ${localPlayer.nukes} nukes  ⚔ ${localPlayer.warriors} warriors`;

    // Show war craft jobs status
    let jobsRow = this.warPanel.querySelector('.war-jobs') as HTMLDivElement | null;
    if (!jobsRow) {
      jobsRow = document.createElement('div');
      jobsRow.className = 'war-jobs';
      this.warPanel.insertBefore(jobsRow, this.warTimerEl);
    }

    if (pendingWarCraftJobs.length > 0) {
      const jobText = pendingWarCraftJobs.map((j) => {
        const remaining = Math.max(0, j.completesAtMs - nowMs);
        const min = Math.floor(remaining / 60000);
        const sec = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
        const label = j.status === 'COMPLETE' ? `✓ ${j.kind} READY` : `${j.kind} crafting ${min}:${sec}`;
        return label;
      }).join('\n');
      jobsRow.textContent = jobText;
      jobsRow.style.display = 'block';
    } else {
      jobsRow.style.display = 'none';
    }
  }

  destroy(): void {
    for (const toast of this.toasts) {
      window.clearTimeout(toast.timeout);
    }
    this.overlay.remove();
  }
}
