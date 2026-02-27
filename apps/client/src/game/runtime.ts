import { GameEngine } from '@ice-king/game-core';
import type { ActionResult, GameAction, GameState } from '@ice-king/shared';
import { themePalette } from '@ice-king/theme-default';
import { BotDirector } from './bot/botDirector';
import { HeuristicBotPolicy } from './bot/heuristicPolicy';
import { OpenAiBotPolicy } from './bot/llmPolicy';
import type { BotDecisionReport } from './bot/types';
import { MinimapController } from './render/minimap';
import {
  computeJobOverlayActionRect,
  computeJobOverlayPanelPosition,
  pointInRect,
} from './render/jobOverlayLayout';
import { PixelRenderer } from './render/pixelRenderer';
import type { RuntimeInit, RuntimeOutcome } from './types';
import { HudLayer } from './ui/hud';
import { getViewportInfo, screenToTile, tileAt, tileToScreen, TILE_SIZE } from './view';
import {
  fetchMultiplayerRoomState,
  getMultiplayerErrorCode,
  submitMultiplayerAction,
  submitMultiplayerChat,
  type MultiplayerChatMessage,
  type MultiplayerSession,
} from '../multiplayer/client';
import iceKingLogoUrl from '../assets/ui/ice-king-logo.png';

interface FlyingIce {
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  elapsed: number;
  duration: number;
  node: HTMLDivElement;
}

interface CameraDragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCameraX: number;
  startCameraY: number;
  moved: boolean;
}

interface BotTokenStats {
  inputTokensSent: number;
  outputTokensReceived: number;
  totalTokens: number;
  responseCount: number;
  lastSource: string;
  lastInputTokens: number;
  lastOutputTokens: number;
}

const CHAT_PICKER_EMOJIS = [
  '😀',
  '😂',
  '😍',
  '🤔',
  '😎',
  '🥶',
  '🔥',
  '💰',
  '🧊',
  '👑',
  '👍',
  '🎉',
  '😢',
  '😡',
  '🙌',
  '🚂',
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sameTile(
  a: { x: number; y: number } | null,
  b: { x: number; y: number } | null,
): boolean {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function formatMmSs(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const rem = (seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${rem}`;
}

function formatOutcome(state: GameState, playerId: string): RuntimeOutcome {
  const winnerId = state.match.winnerId;
  const winner = winnerId ? state.players[winnerId] : null;
  const winnerTeamId = winnerId ? state.teamByPlayerId?.[winnerId] ?? winnerId : null;
  const playerTeamId = state.teamByPlayerId?.[playerId] ?? playerId;
  const playerWon = winnerId === null ? false : winnerTeamId === playerTeamId;
  return {
    winnerName: winner ? winner.name : null,
    winnerId: winnerId ?? null,
    reason: winnerId ? 'Match ended' : 'Draw by tie',
    playerMoney: state.players[playerId]?.money ?? 0,
    playerWon,
    playerTeamId,
    winnerTeamId,
  };
}

export class GameRuntime {
  private readonly mount: HTMLElement;
  private readonly opts: RuntimeInit;
  private readonly gameMode: RuntimeInit['gameMode'];
  private readonly gameLayer: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly chatRail: HTMLDivElement | null;
  private readonly chatLog: HTMLDivElement | null;
  private readonly chatInput: HTMLTextAreaElement | null;
  private readonly chatSendButton: HTMLButtonElement | null;
  private readonly chatEmojiButton: HTMLButtonElement | null;
  private readonly chatEmojiPopup: HTMLDivElement | null;
  private readonly sideRail: HTMLDivElement;
  private readonly minimapFrame: HTMLDivElement;
  private readonly minimapCanvas: HTMLCanvasElement;
  private readonly renderer: PixelRenderer;
  private readonly minimap: MinimapController;
  private readonly hud: HudLayer;
  private readonly engine: GameEngine;
  private readonly multiplayerSession: MultiplayerSession | null;
  private readonly playerId: string;
  private readonly botId: string | null;
  private readonly useExternalBot: boolean;
  private readonly pressedKeys = new Set<string>();
  private readonly floatingIce: FlyingIce[] = [];
  private readonly botTokenStats: BotTokenStats = {
    inputTokensSent: 0,
    outputTokensReceived: 0,
    totalTokens: 0,
    responseCount: 0,
    lastSource: 'none',
    lastInputTokens: 0,
    lastOutputTokens: 0,
  };

  private isTileOwnedByPlayerOrTeammate(ownerId: string | null): boolean {
    if (!ownerId) {
      return false;
    }
    if (ownerId === this.playerId) {
      return true;
    }
    const state = this.engine.getState();
    const teamByPlayerId = state.teamByPlayerId;
    if (!teamByPlayerId) {
      return false;
    }
    return teamByPlayerId[ownerId] === teamByPlayerId[this.playerId];
  }

  private botDirector: BotDirector | null = null;
  private hoveredTile: { x: number; y: number } | null = null;
  private selectedTile: { x: number; y: number } | null = null;
  private actionPanelTile: { x: number; y: number } | null = null;
  private cameraDrag: CameraDragState | null = null;
  private ignoreNextClick = false;
  private debugOverlay = false;
  private running = false;
  private rafId: number | null = null;
  private multiplayerPollId: number | null = null;
  private syncInFlight = false;
  private lastMultiplayerError: string | null = null;
  private lastObservedDisconnect: string | null = null;
  private isMatchPausedByReconnect = false;
  private lastFrameAt = 0;
  private loopAccumulator = 0;
  private chatSending = false;
  private chatEmojiOpen = false;
  private chatMessages: MultiplayerChatMessage[] = [];

  private getStatePlayerColor(playerId: string): 'BLUE' | 'RED' | null {
    const state = this.engine.getState();
    const player = state.players[playerId];
    return player?.color ?? null;
  }

  private getOpponentPlayerId(): string | null {
    const state = this.engine.getState();
    if (this.opts.opponentType === 'NONE') {
      return null;
    }

    if (state.teamByPlayerId && Object.keys(state.teamByPlayerId).length > 0) {
      const myTeam = state.teamByPlayerId[this.playerId];
      if (!myTeam) {
        const fallback = state.playerOrder.find((id) => id !== this.playerId) ?? null;
        return fallback;
      }

      const opponentTeam = state.playerOrder.find(
        (playerId) => (state.teamByPlayerId?.[playerId] ?? playerId) !== myTeam,
      );
      if (opponentTeam) {
        return opponentTeam;
      }
    }

    return state.playerOrder.find((id) => id !== this.playerId) ?? null;
  }

  private getChatTextColor(playerId: string): string {
    const color = this.getStatePlayerColor(playerId);
    if (color === 'BLUE') {
      return themePalette.ownershipBlue;
    }
    if (color === 'RED') {
      return themePalette.ownershipRed;
    }
    return themePalette.muted;
  }

  constructor(options: RuntimeInit) {
    this.opts = options;
    this.gameMode = options.gameMode;
    this.mount = options.mount;

    this.gameLayer = document.createElement('div');
    this.gameLayer.className = 'game-stage';

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'game-canvas';
    this.canvas.tabIndex = 0;
    this.canvas.style.cursor = 'grab';

    this.multiplayerSession = options.multiplayerSession ?? null;
    this.playerId = this.multiplayerSession?.playerId ?? 'P1';
    this.botId = this.playerId === 'P1' ? 'P2' : 'P1';

    const llmEnabled =
      !this.multiplayerSession &&
      options.opponentType === 'BOT' &&
      import.meta.env.VITE_DISABLE_LLM_BOT !== '1' &&
      import.meta.env.VITE_ENABLE_LLM_BOT !== '0';

    this.useExternalBot = llmEnabled;

    if (this.multiplayerSession || options.opponentType === 'HUMAN') {
      if (options.initialState && options.initialState.playerOrder.length > 0) {
        const fallbackName = options.humanPlayerName;
        const initialPlayers = options.initialState.playerOrder.map((playerId, index) => {
          const statePlayer = options.initialState?.players[playerId];
          const color = statePlayer?.color ?? (index % 2 === 0 ? 'BLUE' : 'RED');
          return {
            id: playerId,
            name: statePlayer?.name ?? `${fallbackName} ${index + 1}`,
            color,
            controller: 'HUMAN' as const,
          };
        });
        this.engine = new GameEngine({
          seed: `seed-${Date.now().toString(36)}`,
          configMode: options.configMode,
          botControlMode: 'INTERNAL_HEURISTIC',
          players: initialPlayers,
          teamByPlayerId: options.initialState.teamByPlayerId,
        });
      } else {
        this.engine = new GameEngine({
          seed: `seed-${Date.now().toString(36)}`,
          configMode: options.configMode,
          botControlMode: 'INTERNAL_HEURISTIC',
          players: [
            {
              id: 'P1',
              name: options.humanPlayerName,
              color: 'BLUE',
              controller: 'HUMAN',
            },
            {
              id: 'P2',
              name: 'Player 2',
              color: 'RED',
              controller: 'HUMAN',
            },
          ],
        });
      }
    } else if (options.opponentType === 'NONE') {
      this.engine = new GameEngine({
        seed: `seed-${Date.now().toString(36)}`,
        configMode: options.configMode,
        botControlMode: 'EXTERNAL',
        players: [
          {
            id: 'P1',
            name: options.humanPlayerName,
            color: 'BLUE',
            controller: 'HUMAN',
          },
          {
            id: 'P2',
            name: 'No Rival',
            color: 'RED',
            controller: 'BOT',
          },
        ],
      });
    } else {
      this.engine = GameEngine.createPlayVsComputer(
        `seed-${Date.now().toString(36)}`,
        options.humanPlayerName,
        options.configMode,
        llmEnabled ? 'EXTERNAL' : 'INTERNAL_HEURISTIC',
      );
    }

    if (options.initialState) {
      this.engine.replaceState(options.initialState);
    }

    const state = this.engine.getState();
    const viewport = getViewportInfo(state, this.playerId);

    this.renderer = new PixelRenderer(this.canvas);
    this.renderer.resize(viewport.canvasWidth, viewport.canvasHeight);

    if (this.multiplayerSession) {
      this.chatRail = document.createElement('div');
      this.chatRail.className = 'game-chat-rail pixel-panel';

      const chatHeader = document.createElement('div');
      chatHeader.className = 'chat-header';
      chatHeader.textContent = 'Match Chat';

      this.chatLog = document.createElement('div');
      this.chatLog.className = 'chat-log';

      const composer = document.createElement('div');
      composer.className = 'chat-composer';

      this.chatEmojiPopup = document.createElement('div');
      this.chatEmojiPopup.className = 'chat-emoji-popover pixel-panel';
      this.chatEmojiPopup.style.display = 'none';

      for (const emoji of CHAT_PICKER_EMOJIS) {
        const emojiButton = document.createElement('button');
        emojiButton.className = 'chat-emoji-option';
        emojiButton.type = 'button';
        emojiButton.textContent = emoji;
        emojiButton.title = emoji;
        emojiButton.addEventListener('click', () => {
          this.insertChatEmoji(emoji);
        });
        this.chatEmojiPopup.append(emojiButton);
      }

      this.chatInput = document.createElement('textarea');
      this.chatInput.className = 'chat-input';
      this.chatInput.maxLength = 280;
      this.chatInput.placeholder = 'Type message or emoji...';
      this.chatInput.rows = 2;
      this.chatInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          void this.sendChatMessage();
        }
      });

      this.chatSendButton = document.createElement('button');
      this.chatSendButton.className = 'pixel-button chat-send-button';
      this.chatSendButton.type = 'button';
      this.chatSendButton.textContent = 'Send';
      this.chatSendButton.addEventListener('click', () => {
        void this.sendChatMessage();
      });

      this.chatEmojiButton = document.createElement('button');
      this.chatEmojiButton.className = 'pixel-button chat-emoji-button';
      this.chatEmojiButton.type = 'button';
      this.chatEmojiButton.textContent = 'Emoji';
      this.chatEmojiButton.addEventListener('click', () => {
        this.toggleChatEmojiPicker();
      });

      const composerActions = document.createElement('div');
      composerActions.className = 'chat-composer-actions';
      composerActions.append(this.chatEmojiButton, this.chatSendButton);

      composer.append(this.chatEmojiPopup, this.chatInput, composerActions);
      this.chatRail.append(chatHeader, this.chatLog, composer);
    } else {
      this.chatRail = null;
      this.chatLog = null;
      this.chatInput = null;
      this.chatSendButton = null;
      this.chatEmojiButton = null;
      this.chatEmojiPopup = null;
    }

    this.sideRail = document.createElement('div');
    this.sideRail.className = 'game-side-rail';

    this.minimapFrame = document.createElement('div');
    this.minimapFrame.className = 'minimap-frame pixel-panel';
    this.minimapCanvas = document.createElement('canvas');
    this.minimapCanvas.id = 'minimap-canvas';
    this.minimapFrame.append(this.minimapCanvas);
    this.sideRail.append(this.minimapFrame);

    const logoBadge = document.createElement('img');
    logoBadge.className = 'game-logo-badge';
    logoBadge.src = iceKingLogoUrl;
    logoBadge.alt = 'Ice King logo';

    this.hud = new HudLayer(
      this.gameLayer,
      this.handlePopupAction,
      this.sideRail,
      this.handleSkipSummerVote,
    );
    this.hud.setOpponentStatsVisible(options.opponentType !== 'NONE');

    this.minimap = new MinimapController(this.minimapCanvas, (x, y) => {
      this.dispatchAction({
        type: 'camera.move',
        playerId: this.playerId,
        x,
        y,
      });
    });

    if (this.chatRail) {
      this.gameLayer.append(this.canvas, this.chatRail, this.sideRail, logoBadge);
    } else {
      this.gameLayer.append(this.canvas, this.sideRail, logoBadge);
    }

    if (this.useExternalBot) {
      this.botDirector = new BotDirector({
        botPlayerId: this.botId,
        cadenceMs: this.engine.config.timing.botDecisionCadenceMs,
        buildAllowedActions: (s, botPlayerId) => this.enumerateBotActions(s, botPlayerId),
        dispatch: (action) => this.engine.applyExternalBotAction(action),
        primaryPolicy: new OpenAiBotPolicy({
          onDecisionReport: (report) => this.recordBotDecisionReport(report),
        }),
        fallbackPolicy: new HeuristicBotPolicy(this.engine),
        onDecisionInfo: (info) => this.hud.showToast(info),
      });
    }

    this.mount.append(this.gameLayer);

    this.bindInput();
    this.syncRenderHooks();
    this.updateHud();
    this.updateActionPanel();
    this.render();
  }

  start(): void {
    this.running = true;
    this.lastFrameAt = performance.now();
    if (this.multiplayerSession) {
      void this.syncFromServer();
      this.multiplayerPollId = window.setInterval(() => {
        void this.syncFromServer();
      }, 250);
    }
    this.tickFrame();
  }

  destroy(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.multiplayerPollId !== null) {
      window.clearInterval(this.multiplayerPollId);
      this.multiplayerPollId = null;
    }

    this.minimap.destroy();
    this.hud.destroy();

    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('pointerup', this.handleGlobalPointerUp);
    window.removeEventListener('pointercancel', this.handleGlobalPointerUp);
    this.canvas.removeEventListener('pointerdown', this.handleCanvasPointerDown);
    this.canvas.removeEventListener('pointermove', this.handleCanvasPointerMove);
    this.canvas.removeEventListener('pointerleave', this.handleCanvasPointerLeave);
    this.canvas.removeEventListener('click', this.handleCanvasClick);

    if (this.cameraDrag) {
      try {
        this.canvas.releasePointerCapture(this.cameraDrag.pointerId);
      } catch {
        // Ignore release errors when canvas is already detached.
      }
      this.cameraDrag = null;
    }
  }

  private bindInput(): void {
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);

    window.addEventListener('pointerup', this.handleGlobalPointerUp);
    window.addEventListener('pointercancel', this.handleGlobalPointerUp);
    this.canvas.addEventListener('pointerdown', this.handleCanvasPointerDown);
    this.canvas.addEventListener('pointermove', this.handleCanvasPointerMove);
    this.canvas.addEventListener('pointerleave', this.handleCanvasPointerLeave);
    this.canvas.addEventListener('click', this.handleCanvasClick);
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target;
    const isTypingTarget =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    if (isTypingTarget) {
      return;
    }

    const key = event.key.toLowerCase();
    this.pressedKeys.add(key);

    if (key === 'f') {
      event.preventDefault();
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void this.gameLayer.requestFullscreen();
      }
      return;
    }

    if (event.key === 'Escape' && document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }

    if (event.key === 'F3') {
      event.preventDefault();
      this.debugOverlay = !this.debugOverlay;
      this.hud.setDebugVisible(this.debugOverlay);
      return;
    }

    if (key === 'q') {
      this.dispatchAction({ type: 'player.forfeit', playerId: this.playerId });
      return;
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.pressedKeys.delete(event.key.toLowerCase());
  };

  private handleCanvasPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }

    const state = this.engine.getState();
    const camera = state.cameraByPlayer[this.playerId];
    if (!camera) {
      return;
    }

    this.cameraDrag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCameraX: camera.x,
      startCameraY: camera.y,
      moved: false,
    };

    this.canvas.style.cursor = 'grabbing';
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may fail in unsupported environments.
    }
  };

  private handleCanvasPointerMove = (event: PointerEvent): void => {
    if (this.cameraDrag && event.pointerId === this.cameraDrag.pointerId) {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      const state = this.engine.getState();
      const camera = state.cameraByPlayer[this.playerId];
      if (!camera) {
        return;
      }

      const dx = event.clientX - this.cameraDrag.startClientX;
      const dy = event.clientY - this.cameraDrag.startClientY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.cameraDrag.moved = true;
      }

      const tilesPerPixelX = camera.viewportTiles / rect.width;
      const tilesPerPixelY = camera.viewportTiles / rect.height;

      const nextX = clamp(
        this.cameraDrag.startCameraX - dx * tilesPerPixelX,
        0,
        state.width - camera.viewportTiles,
      );
      const nextY = clamp(
        this.cameraDrag.startCameraY - dy * tilesPerPixelY,
        0,
        state.height - camera.viewportTiles,
      );

      if (Math.abs(nextX - camera.x) > 0.01 || Math.abs(nextY - camera.y) > 0.01) {
        this.dispatchAction({
          type: 'camera.move',
          playerId: this.playerId,
          x: nextX,
          y: nextY,
        });
      }

      this.hoveredTile = null;
      return;
    }

    const state = this.engine.getState();
    const canvasPoint = this.clientToCanvasPoint(event.clientX, event.clientY);
    if (!canvasPoint) {
      this.hoveredTile = null;
      return;
    }

    const tile = screenToTile(state, this.playerId, canvasPoint.x, canvasPoint.y);
    if (!tile) {
      this.hoveredTile = null;
      return;
    }
    const tileState = tileAt(state, tile.x, tile.y);
    this.hoveredTile = tileState?.type === 'VOID' ? null : tile;
  };

  private handleCanvasPointerLeave = (): void => {
    if (this.cameraDrag) {
      return;
    }
    this.hoveredTile = null;
  };

  private handleGlobalPointerUp = (event: PointerEvent): void => {
    if (!this.cameraDrag || event.pointerId !== this.cameraDrag.pointerId) {
      return;
    }

    if (this.cameraDrag.moved) {
      this.ignoreNextClick = true;
    }

    try {
      this.canvas.releasePointerCapture(this.cameraDrag.pointerId);
    } catch {
      // Ignore release errors when no capture exists.
    }

    this.canvas.style.cursor = 'grab';
    this.cameraDrag = null;
  };

  private handleCanvasClick = (event: MouseEvent): void => {
    if (this.ignoreNextClick) {
      this.ignoreNextClick = false;
      return;
    }

    const state = this.engine.getState();
    const canvasPoint = this.clientToCanvasPoint(event.clientX, event.clientY);
    if (!canvasPoint) {
      return;
    }

    if (this.tryHandlePondCollectButtonClick(canvasPoint.x, canvasPoint.y)) {
      return;
    }

    const tileCoord = screenToTile(state, this.playerId, canvasPoint.x, canvasPoint.y);
    if (!tileCoord) {
      return;
    }

    const clickedTile = tileAt(state, tileCoord.x, tileCoord.y);
    if (!clickedTile || clickedTile.type === 'VOID') {
      this.selectedTile = null;
      this.actionPanelTile = null;
      this.hud.setPondPopup(null);
      this.updateActionPanel();
      return;
    }

    const wasSameTile = sameTile(this.selectedTile, tileCoord);
    this.selectedTile = tileCoord;
    this.dispatchAction({
      type: 'tile.select',
      playerId: this.playerId,
      x: tileCoord.x,
      y: tileCoord.y,
    });

    if (!wasSameTile) {
      this.actionPanelTile = null;
      this.hud.setPondPopup(null);
      this.updateActionPanel();
      return;
    }

    this.actionPanelTile = tileCoord;

    this.updateActionPanel();
  };

  private tryHandlePondCollectButtonClick(canvasX: number, canvasY: number): boolean {
    const state = this.engine.getState();
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const viewport = getViewportInfo(state, this.playerId);
    const cameraTileX = Math.floor(viewport.cameraX);
    const cameraTileY = Math.floor(viewport.cameraY);
    const cameraOffsetX = Math.round((viewport.cameraX - cameraTileX) * TILE_SIZE);
    const cameraOffsetY = Math.round((viewport.cameraY - cameraTileY) * TILE_SIZE);

    for (const pondJob of state.ponds) {
      if (!this.isTileOwnedByPlayerOrTeammate(pondJob.ownerId) || pondJob.status !== 'CLAIMABLE') {
        continue;
      }

      // Match PixelRenderer's tile positioning math (floor tile origin + rounded sub-tile offset)
      // so click hit-testing stays aligned while the camera scrolls smoothly.
      const screen = {
        x: (pondJob.pondX - cameraTileX) * TILE_SIZE - cameraOffsetX,
        y: (pondJob.pondY - cameraTileY) * TILE_SIZE - cameraOffsetY,
      };
      // Match the renderer's "near viewport" check so we only accept clicks for overlays that are drawn.
      if (
        screen.x < -TILE_SIZE ||
        screen.y < -TILE_SIZE ||
        screen.x > canvasWidth ||
        screen.y > canvasHeight
      ) {
        continue;
      }

      const panel = computeJobOverlayPanelPosition(screen.x, screen.y, canvasWidth, canvasHeight);
      const actionRect = computeJobOverlayActionRect(panel.x, panel.y);

      if (!pointInRect(canvasX, canvasY, actionRect)) {
        continue;
      }

      const result = this.dispatchAction({
        type: 'pond.harvest.claim',
        playerId: this.playerId,
        pondJobId: pondJob.id,
      });

      if (result.ok) {
        const job = this.engine
          .getState()
          .ponds.find(
            (entry) => entry.id === pondJob.id && this.isTileOwnedByPlayerOrTeammate(entry.ownerId),
          );
        if (job) {
          const point = this.tileCenterToOverlayPoint(job.pondX, job.pondY);
          this.spawnFlyingIce(point.x, point.y);
        }
      }

      this.updateActionPanel();
      return true;
    }

    return false;
  }

  private handleActionButton = (actionId: string): void => {
    const tile = this.actionPanelTile;
    if (!tile) {
      return;
    }

    const action = this.mapActionIdToAction(actionId, tile.x, tile.y);
    if (!action) {
      this.hud.showToast('Action unavailable.');
      return;
    }

    const result = this.dispatchAction(action);
    if (result.ok && action.type === 'pond.harvest.claim') {
      const job = this.engine
        .getState()
        .ponds.find(
          (entry) => entry.id === action.pondJobId && this.isTileOwnedByPlayerOrTeammate(entry.ownerId),
        );
      if (job) {
        const point = this.tileCenterToOverlayPoint(job.pondX, job.pondY);
        this.spawnFlyingIce(point.x, point.y);
      }
    }

    this.updateActionPanel();
  };

  private handlePopupAction = (actionId: string): void => {
    if (actionId === 'pond-cancel') {
      this.hud.setPondPopup(null);
      this.actionPanelTile = null;
      return;
    }

    if (actionId === 'pond-confirm' && this.actionPanelTile) {
      const result = this.dispatchAction({
        type: 'pond.harvest.start',
        playerId: this.playerId,
        x: this.actionPanelTile.x,
        y: this.actionPanelTile.y,
      });

      if (result.ok) {
        const point = this.tileCenterToOverlayPoint(
          this.actionPanelTile.x,
          this.actionPanelTile.y,
        );
        this.spawnFlyingIce(point.x, point.y);
      }

      this.hud.setPondPopup(null);
      this.updateActionPanel();
      return;
    }

    if (this.actionPanelTile) {
      this.handleActionButton(actionId);
      return;
    }

    this.hud.showToast('Action unavailable.');
    return;
  };

  private enumerateBotActions(state: GameState, botPlayerId: string): GameAction[] {
    void state;
    return this.engine.listBotCandidateActions(botPlayerId, 12);
  }

  private mapActionIdToAction(actionId: string, x: number, y: number): GameAction | null {
    const state = this.engine.getState();
    const ownClaim = state.ponds.find(
      (entry) =>
        this.isTileOwnedByPlayerOrTeammate(entry.ownerId) &&
        entry.pondX === x &&
        entry.pondY === y &&
        entry.status === 'CLAIMABLE',
    );

    switch (actionId) {
      case 'tile-buy':
        return { type: 'tile.buy', playerId: this.playerId, x, y };
      case 'tile-buyout':
        return { type: 'tile.buyFromPlayer', playerId: this.playerId, x, y };
      case 'build-factory':
        return { type: 'tile.buildFactory', playerId: this.playerId, x, y };
      case 'build-pond':
        return { type: 'tile.buildManMadePond', playerId: this.playerId, x, y };
      case 'pond-start':
        return { type: 'pond.harvest.start', playerId: this.playerId, x, y };
      case 'pond-claim':
        return ownClaim
          ? { type: 'pond.harvest.claim', playerId: this.playerId, pondJobId: ownClaim.id }
          : null;
      case 'sell-ice-1':
        return { type: 'structure.house.sellIce', playerId: this.playerId, x, y, quantity: 1 };
      case 'sell-ice-all': {
        const player = state.players[this.playerId];
        return { type: 'structure.house.sellIce', playerId: this.playerId, x, y, quantity: Math.max(1, player.ice) };
      }
      case 'sell-blue-1':
        return { type: 'structure.house.sellBlueIce', playerId: this.playerId, x, y, quantity: 1 };
      case 'craft-fridge':
        return { type: 'structure.factory.craftRefrigerator', playerId: this.playerId, x, y };
      case 'craft-blue':
        return { type: 'structure.factory.craftBlueIce', playerId: this.playerId, x, y };
      case 'train-sale':
        return { type: 'structure.train.sellAnnualShipment', playerId: this.playerId, x, y };
      default:
        return null;
    }
  }

  private applyRemoteState(nextState: GameState): void {
    const previous = this.engine.getState();
    const localCamera = previous.cameraByPlayer[this.playerId];
    const localSelection = previous.selectedTileByPlayer[this.playerId];
    this.engine.replaceState(nextState);
    const synced = this.engine.getState();
    const camera = synced.cameraByPlayer[this.playerId];
    if (camera && localCamera) {
      camera.x = localCamera.x;
      camera.y = localCamera.y;
    }
    if (localSelection) {
      synced.selectedTileByPlayer[this.playerId] = localSelection;
    }
  }

  private async syncFromServer(): Promise<void> {
    if (!this.multiplayerSession || this.syncInFlight) {
      return;
    }
    this.syncInFlight = true;
    try {
      const payload = await fetchMultiplayerRoomState(this.multiplayerSession);
      const wasPaused = this.isMatchPausedByReconnect;
      this.isMatchPausedByReconnect = Boolean(payload.lobby.disconnectedPlayerId);
      this.lastObservedDisconnect = wasPaused ? this.lastObservedDisconnect : payload.lobby.disconnectedPlayerId;
      if (!wasPaused && payload.lobby.disconnectedPlayerId) {
        this.lastObservedDisconnect = payload.lobby.disconnectedPlayerId;
        const resumeInMs = (payload.lobby.timeoutAtMs ?? payload.serverNowMs) - payload.serverNowMs;
        this.hud.showToast(
          `Match paused. ${payload.lobby.disconnectedPlayerId} disconnected. Resume in ${Math.max(0, Math.ceil(resumeInMs / 1000))}s.`,
        );
      }
      if (wasPaused && !payload.lobby.disconnectedPlayerId && this.lastObservedDisconnect) {
        this.hud.showToast('Match resumed.');
      }
      if (payload.state) {
        this.applyRemoteState(payload.state);
      }
      this.chatMessages = payload.chat;
      this.renderChatMessages();
      this.lastMultiplayerError = null;
      this.updateHud();
      this.updateActionPanel();
    } catch (error) {
      const code = getMultiplayerErrorCode(error);
      if (code === 'ROOM_EXPIRED' || code === 'ROOM_NOT_FOUND' || code === 'UNAUTHORIZED') {
        const details =
          error instanceof Error && error.message.length > 0 ? ` ${error.message}` : ' session was removed.';
        const reason = code === 'ROOM_EXPIRED' ? `Room expired.${details}` : `Multiplayer session ended.${details}`;
        this.hud.showToast(reason);
        this.onMultiplayerSessionTerminated(reason);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (message !== this.lastMultiplayerError) {
        this.hud.showToast(`Multiplayer sync failed: ${message}`);
      }
      this.lastMultiplayerError = message;
    } finally {
      this.syncInFlight = false;
    }
  }

  private async sendMultiplayerAction(action: GameAction): Promise<void> {
    if (!this.multiplayerSession) {
      return;
    }
    if (this.isMatchPausedByReconnect) {
      this.hud.showToast('Match paused while opponent reconnects.');
      return;
    }
    try {
      const payload = await submitMultiplayerAction(this.multiplayerSession, action);
      this.isMatchPausedByReconnect = Boolean(payload.lobby.disconnectedPlayerId);
      if (payload.state) {
        this.applyRemoteState(payload.state);
      }
      this.chatMessages = payload.chat;
      this.renderChatMessages();
      if (!payload.result.ok) {
        this.hud.showToast(payload.result.message);
      }
      this.lastMultiplayerError = null;
      this.updateHud();
      this.updateActionPanel();
    } catch (error) {
      const code = getMultiplayerErrorCode(error);
      if (code === 'ROOM_EXPIRED' || code === 'ROOM_NOT_FOUND' || code === 'UNAUTHORIZED') {
        const details =
          error instanceof Error && error.message.length > 0 ? ` ${error.message}` : ' session was removed.';
        const reason = code === 'ROOM_EXPIRED' ? `Room expired.${details}` : `Multiplayer session ended.${details}`;
        this.hud.showToast(reason);
        this.onMultiplayerSessionTerminated(reason);
        return;
      }
      if (code === 'MATCH_PAUSED') {
        this.isMatchPausedByReconnect = true;
        this.hud.showToast(`Match paused: ${error instanceof Error ? error.message : 'Match paused.'}`);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.hud.showToast(`Multiplayer action failed: ${message}`);
      this.lastMultiplayerError = message;
    }
  }

  private onMultiplayerSessionTerminated(reason = 'Multiplayer session ended.'): void {
    this.destroy();
    if (this.running) {
      this.running = false;
    }
    this.opts.onExit({
      winnerName: null,
      winnerId: null,
      reason,
      playerMoney: this.engine.getState().players[this.playerId]?.money ?? 0,
    });
  }

  private renderChatMessages(): void {
    if (!this.chatLog) {
      return;
    }
    this.chatLog.innerHTML = '';
    for (const message of this.chatMessages) {
      const row = document.createElement('div');
      row.className = `chat-message ${message.playerId === this.playerId ? 'chat-message-self' : 'chat-message-other'}`;

      const meta = document.createElement('div');
      meta.className = 'chat-meta';
      const time = new Date(message.sentAtMs);
      const hh = time.getHours().toString().padStart(2, '0');
      const mm = time.getMinutes().toString().padStart(2, '0');
      meta.textContent = `${message.playerName} • ${hh}:${mm}`;
      meta.style.color = this.getChatTextColor(message.playerId);

      const text = document.createElement('div');
      text.className = 'chat-text';
      text.textContent = message.text;

      row.append(meta, text);
      this.chatLog.append(row);
    }
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
  }

  private toggleChatEmojiPicker(): void {
    if (!this.chatEmojiPopup || !this.chatEmojiButton) {
      return;
    }
    this.chatEmojiOpen = !this.chatEmojiOpen;
    this.chatEmojiPopup.style.display = this.chatEmojiOpen ? 'grid' : 'none';
    this.chatEmojiButton.textContent = this.chatEmojiOpen ? 'Close' : 'Emoji';
  }

  private closeChatEmojiPicker(): void {
    if (!this.chatEmojiPopup || !this.chatEmojiButton) {
      return;
    }
    this.chatEmojiOpen = false;
    this.chatEmojiPopup.style.display = 'none';
    this.chatEmojiButton.textContent = 'Emoji';
  }

  private insertChatEmoji(emoji: string): void {
    if (!this.chatInput) {
      return;
    }

    const start = this.chatInput.selectionStart ?? this.chatInput.value.length;
    const end = this.chatInput.selectionEnd ?? start;
    const current = this.chatInput.value;
    this.chatInput.value = `${current.slice(0, start)}${emoji}${current.slice(end)}`;
    const cursor = start + emoji.length;
    this.chatInput.focus();
    this.chatInput.setSelectionRange(cursor, cursor);
    this.closeChatEmojiPicker();
  }

  private async sendChatMessage(): Promise<void> {
    if (!this.multiplayerSession || !this.chatInput || !this.chatSendButton || this.chatSending) {
      return;
    }
    const text = this.chatInput.value.trim();
    if (!text) {
      return;
    }

    this.chatSending = true;
    this.chatInput.disabled = true;
    this.chatSendButton.disabled = true;
    try {
      const payload = await submitMultiplayerChat(this.multiplayerSession, text);
      if (payload.state) {
        this.applyRemoteState(payload.state);
      }
      this.chatMessages = payload.chat;
      this.renderChatMessages();
      this.chatInput.value = '';
      this.closeChatEmojiPicker();
      this.lastMultiplayerError = null;
    } catch (error) {
      const code = getMultiplayerErrorCode(error);
      if (code === 'ROOM_EXPIRED' || code === 'ROOM_NOT_FOUND' || code === 'UNAUTHORIZED') {
        const details =
          error instanceof Error && error.message.length > 0 ? ` ${error.message}` : ' session was removed.';
        const reason = code === 'ROOM_EXPIRED' ? `Room expired.${details}` : `Multiplayer session ended.${details}`;
        this.hud.showToast(reason);
        this.onMultiplayerSessionTerminated(reason);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.hud.showToast(`Chat send failed: ${message}`);
      this.lastMultiplayerError = message;
    } finally {
      this.chatSending = false;
      if (this.chatInput && this.chatSendButton) {
        this.chatInput.disabled = false;
        this.chatSendButton.disabled = false;
        this.chatInput.focus();
      }
    }
  }

  private dispatchAction(action: GameAction): ActionResult {
    if (
      this.multiplayerSession &&
      this.isMatchPausedByReconnect &&
      action.type !== 'camera.move' &&
      action.type !== 'tile.select'
    ) {
      this.hud.showToast('Match paused while opponent reconnects.');
      return {
        ok: false,
        code: 'MATCH_PAUSED',
        message: 'Match is paused waiting for reconnect.',
      };
    }
    const result = this.engine.applyAction(action, 'PLAYER');
    if (!result.ok) {
      this.hud.showToast(result.message);
    }
    if (result.ok && this.multiplayerSession && action.type !== 'camera.move' && action.type !== 'tile.select') {
      void this.sendMultiplayerAction(action);
    }

    this.updateHud();
    return result;
  }

  private processCameraInput(stepMs: number): void {
    const state = this.engine.getState();
    const camera = state.cameraByPlayer[this.playerId];
    if (!camera) {
      return;
    }

    const speedTilesPerSec = 9;
    const delta = (speedTilesPerSec * stepMs) / 1000;

    let nextX = camera.x;
    let nextY = camera.y;

    if (this.pressedKeys.has('arrowleft') || this.pressedKeys.has('a')) {
      nextX -= delta;
    }
    if (this.pressedKeys.has('arrowright') || this.pressedKeys.has('d')) {
      nextX += delta;
    }
    if (this.pressedKeys.has('arrowup') || this.pressedKeys.has('w')) {
      nextY -= delta;
    }
    if (this.pressedKeys.has('arrowdown') || this.pressedKeys.has('s')) {
      nextY += delta;
    }

    const clampedX = clamp(nextX, 0, state.width - camera.viewportTiles);
    const clampedY = clamp(nextY, 0, state.height - camera.viewportTiles);

    if (Math.abs(clampedX - camera.x) > 0.01 || Math.abs(clampedY - camera.y) > 0.01) {
      this.dispatchAction({
        type: 'camera.move',
        playerId: this.playerId,
        x: clampedX,
        y: clampedY,
      });
    }
  }

  private spawnFlyingIce(fromX: number, fromY: number): void {
    const node = document.createElement('div');
    node.className = 'flying-ice';
    this.gameLayer.append(node);

    const targetX = this.gameLayer.clientWidth - 110;
    const targetY = 56;

    this.floatingIce.push({
      x: fromX,
      y: fromY,
      startX: fromX,
      startY: fromY,
      targetX,
      targetY,
      elapsed: 0,
      duration: 620,
      node,
    });
  }

  private updateFlyingIce(deltaMs: number): void {
    for (const particle of this.floatingIce) {
      particle.elapsed += deltaMs;
      const t = clamp(particle.elapsed / particle.duration, 0, 1);
      const ease = 1 - (1 - t) * (1 - t);
      particle.x = particle.startX + (particle.targetX - particle.startX) * ease;
      particle.y = particle.startY + (particle.targetY - particle.startY) * ease;
      particle.node.style.left = `${particle.x}px`;
      particle.node.style.top = `${particle.y}px`;
    }

    for (let i = this.floatingIce.length - 1; i >= 0; i -= 1) {
      const particle = this.floatingIce[i] as FlyingIce;
      if (particle.elapsed >= particle.duration) {
        particle.node.remove();
        this.floatingIce.splice(i, 1);
      }
    }
  }

  private updateActionPanel(): void {
    const state = this.engine.getState();
    if (!this.actionPanelTile) {
      this.hud.setPondPopup(null);
      return;
    }

    const tile = tileAt(state, this.actionPanelTile.x, this.actionPanelTile.y);
    if (!tile || tile.type === 'VOID') {
      this.actionPanelTile = null;
      this.hud.setPondPopup(null);
      return;
    }

    const tileCenter = tileToScreen(state, this.playerId, tile.x, tile.y);
    const popupPoint = this.canvasToOverlayPoint(tileCenter.x + TILE_SIZE / 2, tileCenter.y + 8);

    const actions: Array<{ id: string; label: string; disabled?: boolean }> = [];
    const isSummer = state.season.logicSeason === 'SUMMER';
    let warningText: string | undefined;

    const hasPendingPondJob = tile.type === 'POND' && state.ponds.some(
      (entry) =>
        this.isTileOwnedByPlayerOrTeammate(entry.ownerId) &&
        entry.pondX === tile.x &&
        entry.pondY === tile.y &&
        entry.status !== 'CLAIMED',
    );

    if (this.isTileOwnedByPlayerOrTeammate(tile.ownerId) && tile.type === 'POND' && !hasPendingPondJob) {
      if (!isSummer) {
        this.hud.setPondPopup({
          text: `Spend $1c to start a ${formatMmSs(
            this.engine.config.timing.pondHarvestDurationMs,
          )} harvest job?`,
          screenX: popupPoint.x,
          screenY: popupPoint.y,
          actions: [
            { id: 'pond-confirm', label: 'Yes' },
            { id: 'pond-cancel', label: 'No' },
          ],
        });
        return;
      }
      warningText = 'Pond harvest can only start in winter.';
    }

    if (tile.ownerId === null) {
      actions.push({ id: 'tile-buy', label: 'Buy Tile ($1c)' });
    }

    if (tile.ownerId && !this.isTileOwnedByPlayerOrTeammate(tile.ownerId)) {
      actions.push({ id: 'tile-buyout', label: `Buyout Tile ($${tile.currentPrice + 1}c)` });
    }

    if (this.isTileOwnedByPlayerOrTeammate(tile.ownerId) && (tile.type === 'GRASS' || tile.type === 'FOREST')) {
      actions.push({ id: 'build-factory', label: 'Build Factory (2 ice + $2c)' });
      actions.push({ id: 'build-pond', label: 'Build Man-Made Pond (1 ice + $2c)' });
    }

    if (this.isTileOwnedByPlayerOrTeammate(tile.ownerId) && tile.type === 'POND') {
      const pondJob = state.ponds.find(
        (entry) =>
          this.isTileOwnedByPlayerOrTeammate(entry.ownerId) && entry.pondX === tile.x && entry.pondY === tile.y,
      );

      if (pondJob?.status === 'ACTIVE') {
        actions.push({ id: 'pond-start', label: 'Harvest In Progress', disabled: true });
      }
      const claimable = state.ponds.some(
        (entry) =>
          this.isTileOwnedByPlayerOrTeammate(entry.ownerId) &&
          entry.pondX === tile.x &&
          entry.pondY === tile.y &&
          entry.status === 'CLAIMABLE',
      );
      if (claimable) {
        actions.push({ id: 'pond-claim', label: 'Claim Your ICE' });
      }
    }

    if (this.isTileOwnedByPlayerOrTeammate(tile.ownerId) && tile.type === 'HOUSE') {
      if (!isSummer) {
        warningText = 'you have to waint until summer to sell the ice';
      }
      actions.push({ id: 'sell-ice-1', label: 'Sell 1 Ice ($2c)', disabled: !isSummer });
      actions.push({ id: 'sell-ice-all', label: 'Sell All Ice', disabled: !isSummer });
      actions.push({ id: 'sell-blue-1', label: 'Sell 1 Blue Ice ($8c)', disabled: !isSummer });
    }

    if (this.isTileOwnedByPlayerOrTeammate(tile.ownerId) && tile.type === 'FACTORY') {
      actions.push({ id: 'craft-fridge', label: 'Craft Refrigerator (2 ice + $2c / 2m)' });
      actions.push({ id: 'craft-blue', label: 'Craft Blue Ice (2 ice + $2c / 2m)' });
    }

    if (this.isTileOwnedByPlayerOrTeammate(tile.ownerId) && tile.type === 'TRAIN') {
      actions.push({ id: 'train-sale', label: 'Sell Annual Shipment (3 ice -> $9c)' });
    }

    if (actions.length === 0) {
      this.hud.setPondPopup({
        text: `Tile ${tile.x},${tile.y} | ${tile.type} | ${tile.ownerId ?? 'UNOWNED'}\nNo actions available for this tile.`,
        screenX: popupPoint.x,
        screenY: popupPoint.y,
        warningText,
        actions: [],
      });
      return;
    }

    this.hud.setPondPopup({
      text: `Tile ${tile.x},${tile.y} | ${tile.type} | ${tile.ownerId ?? 'UNOWNED'}`,
      screenX: popupPoint.x,
      screenY: popupPoint.y,
      warningText,
      actions,
    });
  }

  private clientToCanvasPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    return {
      x: (relX / rect.width) * this.canvas.width,
      y: (relY / rect.height) * this.canvas.height,
    };
  }

  private canvasToOverlayPoint(canvasX: number, canvasY: number): { x: number; y: number } {
    const canvasRect = this.canvas.getBoundingClientRect();
    const layerRect = this.gameLayer.getBoundingClientRect();

    return {
      x: (canvasX / Math.max(1, this.canvas.width)) * canvasRect.width + (canvasRect.left - layerRect.left),
      y: (canvasY / Math.max(1, this.canvas.height)) * canvasRect.height + (canvasRect.top - layerRect.top),
    };
  }

  private tileCenterToOverlayPoint(tileX: number, tileY: number): { x: number; y: number } {
    const tilePoint = tileToScreen(this.engine.getState(), this.playerId, tileX, tileY);
    return this.canvasToOverlayPoint(tilePoint.x + TILE_SIZE / 2, tilePoint.y + TILE_SIZE / 2);
  }

  private handleSkipSummerVote = (): void => {
    const beforeSeason = this.engine.getState().season.logicSeason;
    const result = this.dispatchAction({
      type: 'season.skipSummerVote',
      playerId: this.playerId,
    });
    if (!result.ok) {
      return;
    }

    const afterSeason = this.engine.getState().season.logicSeason;
    if (beforeSeason === 'SUMMER' && afterSeason === 'WINTER') {
      this.hud.showToast('All players voted. Summer skipped.');
      return;
    }

    this.hud.showToast('Vote recorded. Waiting for other players.');
  };

  private updateHud(): void {
    const split = this.engine.getPlayerStorage(this.playerId);
    const state = this.engine.getState();
    const opponentId = this.getOpponentPlayerId();
    const opponentSplit = opponentId ? this.engine.getPlayerStorage(opponentId) : null;
    const runtimeMode = this.multiplayerSession
      ? 'MULTIPLAYER'
      : this.gameMode === 'SOLO'
        ? 'SOLO'
      : this.useExternalBot
        ? 'LLM_EXTERNAL'
        : 'INTERNAL_HEURISTIC';
    this.hud.updateStats(state, this.playerId, {
      refrigerated: split.refrigeratedIce,
      unrefrigerated: split.unrefrigeratedIce,
      capacity: split.refrigeratedCapacity,
    }, opponentId, opponentSplit ? { refrigerated: opponentSplit.refrigeratedIce, unrefrigerated: opponentSplit.unrefrigeratedIce, capacity: opponentSplit.refrigeratedCapacity } : { refrigerated: 0, unrefrigerated: 0, capacity: 0 });

    const netWorth = this.engine
      .getNetWorth()
      .map(
        (entry) =>
          `${state.players[entry.playerId]?.name ?? entry.playerId}: ${entry.value} (cash ${entry.money}, tile ${entry.ownedTileValue}, ice ${entry.iceValue}, blue ${entry.blueIceValue}, fridge ${entry.refrigeratorValue})`,
      )
      .join(' | ');

    this.hud.setDebugText(
      [
        `tickMs: ${state.nowMs}`,
        `season: ${state.season.logicSeason}`,
        `transition: ${(state.season.transitionProgress * 100).toFixed(1)}%`,
        `keyframe: ${state.season.transitionKeyframeIndex}/8`,
        `room: ${this.opts.roomCode}`,
        `botMode: ${runtimeMode}`,
        `latency(ms): ${this.multiplayerSession ? 'remote-poll' : 'local-0'}`,
        `botTokensIn: ${this.botTokenStats.inputTokensSent}`,
        `botTokensOut: ${this.botTokenStats.outputTokensReceived}`,
        `botTokensTotal: ${this.botTokenStats.totalTokens}`,
        `botLlmResponses: ${this.botTokenStats.responseCount}`,
        `botTokenLast: in ${this.botTokenStats.lastInputTokens}, out ${this.botTokenStats.lastOutputTokens}, source ${this.botTokenStats.lastSource}`,
        `netWorth: ${netWorth}`,
      ].join('\n'),
    );
  }

  private recordBotDecisionReport(report: BotDecisionReport): void {
    this.botTokenStats.inputTokensSent += report.usage.inputTokens;
    this.botTokenStats.outputTokensReceived += report.usage.outputTokens;
    this.botTokenStats.totalTokens += report.usage.totalTokens;
    this.botTokenStats.responseCount += 1;
    this.botTokenStats.lastSource = report.source;
    this.botTokenStats.lastInputTokens = report.usage.inputTokens;
    this.botTokenStats.lastOutputTokens = report.usage.outputTokens;
  }

  private render(): void {
    const state = this.engine.getState();
    this.renderer.draw({
      state,
      activePlayerId: this.playerId,
      hoveredTile: this.hoveredTile,
      nowMs: state.nowMs,
    });

    this.minimap.draw(state, this.playerId);
  }

  private tickFixed(stepMs: number): void {
    this.processCameraInput(stepMs);
    if (!this.multiplayerSession) {
      this.engine.tick(stepMs);
      if (this.botDirector) {
        this.botDirector.update(this.engine.getState());
      }
    }

    this.updateHud();
    this.updateActionPanel();

    if (this.engine.getState().match.ended) {
      this.running = false;
      const outcome = formatOutcome(this.engine.getState(), this.playerId);
      this.opts.onExit(outcome);
    }
  }

  private tickFrame = (): void => {
    if (!this.running) {
      return;
    }

    const now = performance.now();
    let delta = now - this.lastFrameAt;
    this.lastFrameAt = now;

    if (delta > 250) {
      delta = 250;
    }

    this.loopAccumulator += delta;

    const stepMs = 1000 / 30;
    while (this.loopAccumulator >= stepMs) {
      this.tickFixed(stepMs);
      this.loopAccumulator -= stepMs;
    }

    this.updateFlyingIce(delta);
    this.render();

    this.rafId = requestAnimationFrame(this.tickFrame);
  };

  private syncRenderHooks(): void {
    const api = {
      render_game_to_text: () => {
        const state = this.engine.getState();
        const player = state.players[this.playerId];
        const split = this.engine.getPlayerStorage(this.playerId);
        const camera = state.cameraByPlayer[this.playerId];

        const visibleTiles = [] as Array<{
          x: number;
          y: number;
          type: string;
          owner: string | null;
        }>;

        const viewport = getViewportInfo(state, this.playerId);
        const originX = Math.floor(viewport.cameraX);
        const originY = Math.floor(viewport.cameraY);
        for (let y = 0; y < viewport.viewportTiles; y += 1) {
          for (let x = 0; x < viewport.viewportTiles; x += 1) {
            const worldX = originX + x;
            const worldY = originY + y;
            const tile = tileAt(state, worldX, worldY);
            if (!tile) {
              continue;
            }
            visibleTiles.push({
              x: worldX,
              y: worldY,
              type: tile.type,
              owner: tile.ownerId,
            });
          }
        }

        return JSON.stringify({
          mapSize: {
            width: state.width,
            height: state.height,
          },
          coordinateSystem: {
            origin: 'top-left',
            axisX: 'increases right',
            axisY: 'increases down',
            tileUnit: '1 tile',
          },
          mode: state.match.ended ? 'ENDED' : 'PLAYING',
          roomCode: this.opts.roomCode,
          nowMs: state.nowMs,
          season: {
            logic: state.season.logicSeason,
            transitionProgress: Number(state.season.transitionProgress.toFixed(3)),
            keyframeIndex: state.season.transitionKeyframeIndex,
            nextFlipMs: state.season.cycleStartMs + state.season.cycleDurationMs,
          },
          player: {
            id: player.id,
            money: player.money,
            ice: player.ice,
            blueIce: player.blueIce,
            refrigerators: player.refrigerators,
            refrigeratedIce: split.refrigeratedIce,
            unrefrigeratedIce: split.unrefrigeratedIce,
          },
          camera: {
            x: camera.x,
            y: camera.y,
            viewportTiles: camera.viewportTiles,
          },
          selectedTile: this.selectedTile,
          hoveredTile: this.hoveredTile,
          visibleTiles,
          activePondJobs: state.ponds
            .filter((job) => job.status !== 'CLAIMED')
            .map((job) => ({
              id: job.id,
              ownerId: job.ownerId,
              pondX: job.pondX,
              pondY: job.pondY,
              status: job.status,
              claimAtMs: job.claimAtMs,
            })),
          activeFactoryJobs: state.factoryJobs
            .filter((job) => job.status === 'ACTIVE')
            .map((job) => ({
              id: job.id,
              ownerId: job.ownerId,
              kind: job.kind,
              x: job.x,
              y: job.y,
              completesAtMs: job.completesAtMs,
            })),
          ownership: {
            tileCountByPlayer: Object.fromEntries(
              state.playerOrder.map((id) => [
                id,
                state.tiles.filter((tile) => tile.ownerId === id).length,
              ]),
            ),
          },
          recentEvents: state.actionLog.slice(-25).map((entry) => ({
            atMs: entry.atMs,
            type: entry.type,
            payload: entry.payload,
          })),
          bot: {
            mode: this.multiplayerSession
              ? 'MULTIPLAYER'
              : this.gameMode === 'SOLO'
                ? 'SOLO'
              : this.useExternalBot
                ? 'LLM_EXTERNAL'
                : 'INTERNAL_HEURISTIC',
          },
        });
      },
      advanceTime: (ms: number) => {
        const clamped = clamp(ms, 0, 60000);
        const stepMs = 1000 / 30;
        let remaining = clamped;
        while (remaining > 0) {
          const step = Math.min(stepMs, remaining);
          this.tickFixed(step);
          remaining -= step;
        }
        this.render();
        return this.engine.getState().nowMs;
      },
    };

    Object.assign(window as unknown as Record<string, unknown>, api);
  }
}
