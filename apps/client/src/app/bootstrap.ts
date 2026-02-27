import { GameRuntime } from '../game/runtime';
import type { GameState } from '@ice-king/shared';
import type { GameMode, RuntimeOutcome } from '../game/types';
import splashIceKingWebp from '../assets/splash-ice-king.webp';
import iceKingLogoPng from '../assets/ui/ice-king-logo.png';
import {
  buildInviteLink,
  createMultiplayerRoom,
  fetchMultiplayerRoomState,
  getMultiplayerErrorCode,
  joinMultiplayerRoom,
  setMultiplayerReady,
  startMultiplayerRoom,
  type MultiplayerLobbyState,
  type MultiplayerSession,
} from '../multiplayer/client';
import {
  createAccount,
  getAuthenticatedUsername,
  getUserStats,
  spendUserIceCoins,
  isSameUser,
  login,
  logout,
  recordGameResult,
} from './auth';

interface AppContext {
  root: HTMLElement;
  runtime: GameRuntime | null;
  playerName: string;
  roomCode: string;
  multiplayerSession: MultiplayerSession | null;
}

type LobbyMode = 'HUMAN' | 'BOT' | 'NONE' | 'FRIENDLY';

const FRIENDLY_ENTRY_COST = 50;
const TEAM_ENTRY_COST = 80;

function gameModeFromLobbyMode(mode: LobbyMode): GameMode {
  if (mode === 'HUMAN') {
    return 'PLAY_ONLINE';
  }
  if (mode === 'FRIENDLY') {
    return 'FRIENDLY';
  }
  if (mode === 'NONE') {
    return 'SOLO';
  }
  return 'PLAY_VS_COMPUTER';
}

function lobbyModeFromServerMode(serverMode: MultiplayerLobbyState['mode']): LobbyMode {
  return serverMode === 'FRIENDLY' ? 'FRIENDLY' : 'HUMAN';
}

function runtimeOpponentFromLobbyMode(mode: LobbyMode): 'HUMAN' | 'BOT' | 'NONE' {
  return mode === 'HUMAN' || mode === 'FRIENDLY' ? 'HUMAN' : mode;
}

interface PersistedMultiplayerSession {
  session: MultiplayerSession;
  playerName: string;
}

const MULTIPLAYER_SESSION_STORE_KEY = 'iceking-multiplayer-sessions-v1';

function randomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function clearRoot(root: HTMLElement): void {
  root.innerHTML = '';
}

function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function currentConfigMode(): 'PROD' | 'DEV_FAST' {
  return window.location.search.includes('fast=1') ? 'DEV_FAST' : 'PROD';
}

function createButton(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'pixel-button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function getStoredSessions(): Record<string, PersistedMultiplayerSession> {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  try {
    const raw = localStorage.getItem(MULTIPLAYER_SESSION_STORE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const sessions: Record<string, PersistedMultiplayerSession> = {};
    for (const [roomCode, rawValue] of Object.entries(parsed)) {
      const value = rawValue as Record<string, unknown> | null;
      if (!value || typeof value !== 'object') {
        continue;
      }
      const session = value.session as Record<string, unknown> | null;
      const playerName = typeof value.playerName === 'string' ? value.playerName : '';
      if (
        !session ||
        typeof session.roomCode !== 'string' ||
        typeof session.playerId !== 'string' ||
        typeof session.token !== 'string' ||
        !playerName
      ) {
        continue;
      }
      sessions[roomCode] = {
        playerName,
        session: {
          roomCode: session.roomCode,
          playerId: session.playerId as MultiplayerSession['playerId'],
          token: session.token,
        },
      };
    }
    return sessions;
  } catch {
    return {};
  }
}

function setStoredSession(roomCode: string, session: MultiplayerSession, playerName: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const room = normalizeRoomCode(roomCode);
  if (!room) {
    return;
  }
  const sessions = getStoredSessions();
  sessions[room] = {
    session,
    playerName,
  };
  localStorage.setItem(MULTIPLAYER_SESSION_STORE_KEY, JSON.stringify(sessions));
}

function removeStoredSession(roomCode: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const room = normalizeRoomCode(roomCode);
  if (!room) {
    return;
  }
  const sessions = getStoredSessions();
  delete sessions[room];
  if (Object.keys(sessions).length === 0) {
    localStorage.removeItem(MULTIPLAYER_SESSION_STORE_KEY);
    return;
  }
  localStorage.setItem(MULTIPLAYER_SESSION_STORE_KEY, JSON.stringify(sessions));
}

function getStoredSession(roomCode: string): PersistedMultiplayerSession | null {
  const room = normalizeRoomCode(roomCode);
  if (!room) {
    return null;
  }
  return getStoredSessions()[room] ?? null;
}

function friendlyMultiplayerError(error: unknown): { code: string | null; message: string } {
  const code = getMultiplayerErrorCode(error);
  const detail = error instanceof Error ? error.message : String(error);
  const detailMessage = detail.replace(/^[A-Z_]+:\s*/i, '').trim();
  if (code === 'ROOM_NOT_FOUND') {
    const suffix = detailMessage.length > 0 ? ` ${detailMessage}` : '';
    return { code, message: `Room not found (it may have expired). Please create or join again.${suffix}` };
  }
  if (code === 'ROOM_EXPIRED') {
    const suffix = detailMessage.length > 0 ? ` ${detailMessage}` : '';
    return { code, message: `This room has expired and was removed.${suffix}` };
  }
  if (code === 'MATCH_PAUSED') {
    return { code, message: 'Match paused while a player reconnects.' };
  }
  if (code === 'ROOM_FULL') {
    return { code, message: 'Room is full.' };
  }
  if (code === 'UNAUTHORIZED') {
    return { code, message: 'Session is invalid or expired. Reconnect with room code again.' };
  }
  if (code === 'ROOM_CAPACITY_REACHED') {
    return { code, message: 'Server room capacity reached.' };
  }
  if (code === 'BOTH_PLAYERS_MUST_BE_READY') {
    return { code, message: 'Both players must be ready before starting.' };
  }
  if (code === 'PLAYER_TWO_NOT_JOINED') {
    return { code, message: 'Second player has not joined yet.' };
  }
  return { code, message: detail };
}

function formatPauseCountdown(timeoutAtMs: number | null, disconnectedPlayerId: string | null): string {
  if (!disconnectedPlayerId || !timeoutAtMs) {
    return '';
  }
  const remainingMs = Math.max(0, timeoutAtMs - Date.now());
  const remainingSec = Math.ceil(remainingMs / 1000);
  return `Disconnected player (${disconnectedPlayerId}) can reconnect in ${remainingSec}s.`;
}

function renderSplash(ctx: AppContext): void {
  clearRoot(ctx.root);
  ctx.multiplayerSession = null;
  ctx.playerName = getAuthenticatedUsername() ?? '';

  const shell = document.createElement('div');
  shell.className = 'app-shell splash-screen';

  const artWrap = document.createElement('div');
  artWrap.className = 'splash-art-wrap';

  const splashArt = document.createElement('img');
  splashArt.className = 'splash-art';
  splashArt.src = splashIceKingWebp;
  splashArt.alt = 'Ice King splash art showing a frozen kingdom with ponds, factories, houses, and a train.';

  artWrap.append(splashArt);

  const vignette = document.createElement('div');
  vignette.className = 'splash-vignette';

  const frost = document.createElement('div');
  frost.className = 'splash-frost-overlay';

  const card = document.createElement('div');
  card.className = 'splash-card pixel-panel';

  const logo = document.createElement('img');
  logo.className = 'splash-logo';
  logo.src = iceKingLogoPng;
  logo.alt = 'Ice King logo';

  const subtitle = document.createElement('p');
  subtitle.className = 'subtle splash-subtitle';
  subtitle.textContent =
    'Rule a frozen economy. Expand territory, command ponds and factories, and outplay the rival king.';

  const points = document.createElement('p');
  points.className = 'splash-points';
  points.textContent = 'Buy Land   Freeze Ponds   Build Industry   Survive Summer Melt';

  const roomFromQuery = normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '');
  const storedSession = roomFromQuery ? getStoredSession(roomFromQuery) : null;
  const canReconnectStoredSession =
    Boolean(storedSession && ctx.playerName) && isSameUser(storedSession?.playerName ?? '', ctx.playerName);

  const authPanel = document.createElement('div');
  authPanel.className = 'auth-panel';

  const authStatus = document.createElement('p');
  authStatus.className = 'subtle';

  const authMessage = document.createElement('p');
  authMessage.className = 'subtle auth-message';
  const accountStatsPanel = document.createElement('div');
  accountStatsPanel.className = 'pixel-panel account-stats';

  let authUsernameInput: HTMLInputElement | null = null;
  let authPasswordInput: HTMLInputElement | null = null;

  const menuGrid = document.createElement('div');
  menuGrid.className = 'menu-grid';

  const reconnectHint = document.createElement('p');
  reconnectHint.className = 'subtle';
  reconnectHint.style.opacity = '0.9';
  reconnectHint.style.marginBottom = '0';
  if (roomFromQuery && storedSession && canReconnectStoredSession) {
    reconnectHint.textContent = `Stored session found for room ${roomFromQuery}.`;
  } else if (roomFromQuery && storedSession) {
    reconnectHint.textContent = `Invite detected: ${roomFromQuery}. Log in as ${storedSession.playerName} to reconnect.`;
  } else if (roomFromQuery) {
    reconnectHint.textContent = `Invite detected: ${roomFromQuery}.`;
  } else if (ctx.playerName) {
    reconnectHint.textContent = 'Press Enter to open Create Game mode options.';
  } else {
    reconnectHint.textContent = 'Create an account or log in to play.';
  }

  const showSoonToast = (feature: string) => {
    alert(`${feature} is scaffolded for a later milestone.`);
  };

  let isBusy = false;

  let keyListenerAttached = true;
  const detachKeyListener = () => {
    if (!keyListenerAttached) {
      return;
    }
    window.removeEventListener('keydown', keyListener);
    keyListenerAttached = false;
  };

  const beginLobby = (opponentType: LobbyMode) => {
    if (!ctx.playerName) {
      return;
    }
    ctx.multiplayerSession = null;
    detachKeyListener();
    ctx.roomCode = randomRoomCode();
    renderLobby(ctx, opponentType);
  };

  const attemptReconnect = () => {
    if (!storedSession || !canReconnectStoredSession || isBusy || !ctx.playerName) {
      return;
    }
    const resolvedSession = storedSession.session;
    const roomCode = normalizeRoomCode(resolvedSession.roomCode);
    if (!roomCode) {
      alert('No valid room code to reconnect to.');
      return;
    }
    isBusy = true;
    updateMenuDisabled();
    void fetchMultiplayerRoomState(resolvedSession).then((response) => {
      if (ctx.playerName.length === 0) {
        ctx.playerName = storedSession.playerName;
        if (authUsernameInput) {
          authUsernameInput.value = storedSession.playerName;
        }
      }
      ctx.roomCode = response.lobby.roomCode;
      ctx.multiplayerSession = resolvedSession;
      detachKeyListener();
      setStoredSession(response.lobby.roomCode, resolvedSession, ctx.playerName);
      renderLobby(ctx, lobbyModeFromServerMode(response.lobby.mode), response.lobby, response.state);
    })
      .catch((error) => {
        const { code, message } = friendlyMultiplayerError(error);
        if (code === 'ROOM_EXPIRED' || code === 'ROOM_NOT_FOUND' || code === 'UNAUTHORIZED') {
          removeStoredSession(roomCode);
        }
        alert(`Reconnect failed: ${message}`);
      })
      .finally(() => {
        isBusy = false;
        updateMenuDisabled();
      });
  };

  const setAuthMessage = (message: string): void => {
    authMessage.textContent = message;
  };

  const rerenderSplash = (): void => {
    detachKeyListener();
    renderSplash(ctx);
  };

  const attemptLogin = (): void => {
    if (isBusy || !authUsernameInput || !authPasswordInput) {
      return;
    }
    const result = login(authUsernameInput.value, authPasswordInput.value);
    if (!result.ok) {
      setAuthMessage(result.error);
      return;
    }
    ctx.playerName = result.username;
    rerenderSplash();
  };

  const attemptCreateAccount = (): void => {
    if (isBusy || !authUsernameInput || !authPasswordInput) {
      return;
    }
    const result = createAccount(authUsernameInput.value, authPasswordInput.value);
    if (!result.ok) {
      setAuthMessage(result.error);
      return;
    }
    ctx.playerName = result.username;
    rerenderSplash();
  };

  let createModeOpen = false;
  const createModeOverlay = document.createElement('div');
  createModeOverlay.className = 'mode-picker-overlay';
  createModeOverlay.style.display = 'none';

  const createModeCard = document.createElement('div');
  createModeCard.className = 'mode-picker-card pixel-panel';

  const createModeTitle = document.createElement('h3');
  createModeTitle.className = 'title';
  createModeTitle.style.fontSize = '24px';
  createModeTitle.textContent = 'Create Game';

  const createModeSubtitle = document.createElement('p');
  createModeSubtitle.className = 'subtle';
  createModeSubtitle.textContent = 'Choose a game type:';

  const createModeList = document.createElement('div');
  createModeList.className = 'mode-picker-list';

  const createModeClose = createButton('Close', () => {
    createModeOpen = false;
    createModeOverlay.style.display = 'none';
    updateMenuDisabled();
  });
  createModeClose.classList.add('mode-picker-close');

  const openCreateGamePicker = (): void => {
    if (isBusy || !ctx.playerName) {
      return;
    }
    createModeOpen = true;
    createModeOverlay.style.display = 'flex';
    updateMenuDisabled();
  };

  const startMultiplayerRoomWithMode = (mode: MultiplayerLobbyState['mode']): void => {
    if (isBusy || !ctx.playerName) {
      return;
    }
    const isFriendly = mode === 'FRIENDLY';
    if (isFriendly && getUserStats(ctx.playerName).iceCoins < FRIENDLY_ENTRY_COST) {
      alert(`Friendly mode requires ${FRIENDLY_ENTRY_COST} ice coins.`);
      return;
    }
    createModeOpen = false;
    createModeOverlay.style.display = 'none';
    isBusy = true;
    updateMenuDisabled();
    void createMultiplayerRoom(ctx.playerName, currentConfigMode(), roomFromQuery || null, mode)
      .then((response) => {
        if (isFriendly) {
          const spent = spendUserIceCoins(ctx.playerName, FRIENDLY_ENTRY_COST);
          if (!spent.ok) {
            alert(`Could not start Friendly mode: ${spent.error}`);
            return;
          }
        }
        ctx.roomCode = response.session.roomCode;
        ctx.multiplayerSession = response.session;
        setStoredSession(response.session.roomCode, response.session, ctx.playerName);
        detachKeyListener();
        renderLobby(ctx, lobbyModeFromServerMode(response.lobby.mode), response.lobby, response.state);
      })
      .catch((error) => {
        const { message } = friendlyMultiplayerError(error);
        alert(`Create Game failed: ${message}`);
      })
      .finally(() => {
        isBusy = false;
        updateMenuDisabled();
      });
  };

  const currentUserStats = getUserStats(ctx.playerName);
  const hasFriendlyFunds = currentUserStats.iceCoins >= FRIENDLY_ENTRY_COST;
  const friendlyLabel = hasFriendlyFunds
    ? `4: Friendly (${FRIENDLY_ENTRY_COST} Ice Coins)`
    : '4: Friendly (Locked, 50 Ice Coins)';

  const createModeOptions: Array<{
    label: string;
    description: string;
    isLocked: boolean;
    onSelect?: () => void;
  }> = [
    {
      label: '1: Play vs Computer',
      description: 'Local game versus the Ice Bot.',
      isLocked: false,
      onSelect: () => {
        createModeOpen = false;
        createModeOverlay.style.display = 'none';
        beginLobby('BOT');
      },
    },
    {
      label: '2: Play Online',
      description: 'Create an online room and invite another player.',
      isLocked: false,
      onSelect: () => {
        startMultiplayerRoomWithMode('PLAY_ONLINE');
      },
    },
    {
      label: '3: Solo',
      description: 'Single-player run. No computer opponent.',
      isLocked: false,
      onSelect: () => {
        createModeOpen = false;
        createModeOverlay.style.display = 'none';
        beginLobby('NONE');
      },
    },
    {
      label: friendlyLabel,
      description: 'Two teammates share land ownership, but keep separate money and ice.',
      isLocked: !hasFriendlyFunds,
      onSelect: hasFriendlyFunds
        ? () => {
          startMultiplayerRoomWithMode('FRIENDLY');
        }
        : undefined,
    },
    {
      label: `5: Team (Locked, ${TEAM_ENTRY_COST} Ice Coins)`,
      description: `Locked until release (cost ${TEAM_ENTRY_COST} Ice Coins).`,
      isLocked: true,
    },
    {
      label: `6: Ice Wars (Locked, ${TEAM_ENTRY_COST} Ice Coins)`,
      description: 'Locked placeholder for future team mode variant.',
      isLocked: true,
    },
  ];

  const createModeButtons: HTMLButtonElement[] = [];
  for (const option of createModeOptions) {
    const item = document.createElement('div');
    item.className = 'mode-picker-item';

    const button = createButton(option.label, () => {
      if (option.isLocked || !option.onSelect) {
        return;
      }
      option.onSelect();
    }, option.isLocked);
    button.classList.add('mode-picker-option');
    if (option.isLocked) {
      button.classList.add('mode-picker-option-locked');
    }

    const description = document.createElement('p');
    description.className = 'subtle mode-picker-description';
    description.textContent = option.description;

    item.append(button, description);
    createModeList.append(item);
    if (!option.isLocked) {
      createModeButtons.push(button);
    }
  }

  createModeCard.append(createModeTitle, createModeSubtitle, createModeList, createModeClose);
  createModeOverlay.append(createModeCard);
  createModeOverlay.addEventListener('click', (event) => {
    if (event.target === createModeOverlay) {
      createModeOpen = false;
      createModeOverlay.style.display = 'none';
      updateMenuDisabled();
    }
  });

  const createGameButton = createButton('Create Game', () => {
    openCreateGamePicker();
  }, !ctx.playerName);

  const joinGameButton = createButton('Join Game', () => {
    if (isBusy || !ctx.playerName) {
      return;
    }
    const defaultCode = roomFromQuery || ctx.roomCode;
    const entered = window.prompt('Enter room code', defaultCode);
    if (!entered) {
      return;
    }
    const roomCode = normalizeRoomCode(entered);
    if (!roomCode) {
      alert('Invalid room code.');
      return;
    }

    isBusy = true;
    updateMenuDisabled();
    void joinMultiplayerRoom(roomCode, ctx.playerName)
      .then((response) => {
        ctx.roomCode = response.session.roomCode;
        ctx.multiplayerSession = response.session;
        setStoredSession(response.session.roomCode, response.session, ctx.playerName);
        detachKeyListener();
        renderLobby(ctx, lobbyModeFromServerMode(response.lobby.mode), response.lobby, response.state);
      })
      .catch((error) => {
        const { code, message } = friendlyMultiplayerError(error);
        if (code === 'ROOM_EXPIRED' || code === 'ROOM_NOT_FOUND') {
          removeStoredSession(roomCode);
        }
        alert(`Join Game failed: ${message}`);
      })
      .finally(() => {
        isBusy = false;
        updateMenuDisabled();
      });
  }, !ctx.playerName);

  const reconnectButton = createButton('Reconnect Last Session', () => {
    attemptReconnect();
  }, !storedSession || !canReconnectStoredSession);

  const howToPlayButton = createButton('How to Play', () => {
    alert(
      [
        'How to Play (v1):',
        '1) Buy tiles to expand territory.',
        '2) Own ponds in winter to start harvest jobs.',
        '3) Harvest ice (default 1:00) and collect when ready. Refrigerators protect it from summer melt.',
        '4) Build factories/ponds and sell at houses/train.',
        '5) Highest money at match end wins.',
      ].join('\n'),
    );
  });

  const settingsButton = createButton('Settings', () => {
    showSoonToast('Settings');
  });

  const updateMenuDisabled = () => {
    const missingName = ctx.playerName.length === 0;
    createGameButton.disabled = missingName || isBusy || createModeOpen;
    joinGameButton.disabled = missingName || isBusy;
    reconnectButton.disabled = !canReconnectStoredSession || missingName || isBusy;
    createModeClose.disabled = isBusy;
    for (const button of createModeButtons) {
      button.disabled = isBusy || missingName;
    }
  };

  if (ctx.playerName) {
    authStatus.textContent = `Signed in as ${ctx.playerName}.`;
    const logoutButton = createButton('Log Out', () => {
      logout();
      ctx.playerName = '';
      rerenderSplash();
    });
    authPanel.append(authStatus, logoutButton);

    const stats = getUserStats(ctx.playerName);
    const statsTitle = document.createElement('h3');
    statsTitle.className = 'hud-title';
    statsTitle.textContent = 'Account Stats';

    const statsGrid = document.createElement('div');
    statsGrid.className = 'account-stats-grid';
    const statRows: Array<[string, string]> = [
      ['Ice Coins', `${stats.iceCoins}`],
      ['Games Played', `${stats.gamesPlayed}`],
      ['Wins', `${stats.gamesWon}`],
      ['Losses', `${stats.gamesLost}`],
      ['Draws', `${stats.gamesDrawn}`],
      ['Solo Runs', `${stats.soloGamesPlayed}`],
      ['Best Solo', `$${stats.bestSoloMoney}c`],
      ['Coins Earned (All Time)', `${stats.totalCoinsEarned}`],
      ['Money Earned (All Time)', `$${stats.totalMoneyEarned}c`],
    ];

    for (const [label, value] of statRows) {
      const row = document.createElement('div');
      row.className = 'account-stats-row';
      const key = document.createElement('span');
      key.textContent = label;
      const val = document.createElement('span');
      val.textContent = value;
      row.append(key, val);
      statsGrid.append(row);
    }

    accountStatsPanel.append(statsTitle, statsGrid);
  } else {
    authStatus.textContent = 'Use a username + password to create an account or log in.';

    authUsernameInput = document.createElement('input');
    authUsernameInput.className = 'text-input';
    authUsernameInput.placeholder = 'Username';
    authUsernameInput.maxLength = 24;

    authPasswordInput = document.createElement('input');
    authPasswordInput.className = 'text-input';
    authPasswordInput.placeholder = 'Password (min 4 chars)';
    authPasswordInput.type = 'password';

    const authActions = document.createElement('div');
    authActions.className = 'auth-actions';

    const loginButton = createButton('Log In', () => {
      attemptLogin();
    });
    const createAccountButton = createButton('Create Account', () => {
      attemptCreateAccount();
    });

    authActions.append(loginButton, createAccountButton);
    authPanel.append(authStatus, authUsernameInput, authPasswordInput, authActions, authMessage);
  }

  if (storedSession) {
    menuGrid.append(createGameButton, joinGameButton, reconnectButton, howToPlayButton, settingsButton);
  } else {
    menuGrid.append(createGameButton, joinGameButton, howToPlayButton, settingsButton);
  }

  const keyListener = (event: KeyboardEvent) => {
    if (ctx.playerName.length > 0) {
      if (event.key === 'Escape' && createModeOpen) {
        event.preventDefault();
        createModeOpen = false;
        createModeOverlay.style.display = 'none';
        updateMenuDisabled();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (!createModeOpen) {
          openCreateGamePicker();
        }
      }
      return;
    }

    if (event.key === 'Enter' && authUsernameInput && authPasswordInput) {
      event.preventDefault();
      attemptLogin();
    }
  };

  window.addEventListener('keydown', keyListener);
  updateMenuDisabled();

  if (ctx.playerName) {
    card.append(logo, subtitle, points, authPanel, accountStatsPanel, menuGrid, reconnectHint, createModeOverlay);
  } else {
    card.append(logo, subtitle, points, authPanel, menuGrid, reconnectHint, createModeOverlay);
  }
  shell.append(artWrap, vignette, frost, card);
  ctx.root.append(shell);
}

function renderMenu(ctx: AppContext): void {
  renderSplash(ctx);
}

function renderLobby(
  ctx: AppContext,
  opponentType: LobbyMode,
  initialLobby: MultiplayerLobbyState | null = null,
  initialState: GameState | null = null,
): void {
  clearRoot(ctx.root);

  const isMultiplayer = opponentType === 'HUMAN' || opponentType === 'FRIENDLY';
  const shell = document.createElement('div');
  shell.className = 'app-shell lobby-screen';

  const card = document.createElement('div');
  card.className = 'lobby-card';

  const heading = document.createElement('h2');
  heading.className = 'title';
  heading.style.fontSize = '34px';
  heading.textContent = 'Lobby';

  const roomInfo = document.createElement('p');
  roomInfo.className = 'subtle';
  roomInfo.textContent = isMultiplayer
    ? `Room Code: ${ctx.roomCode}`
    : `Mode: ${opponentType === 'BOT' ? 'Play vs Computer' : 'Solo'}`;

  const inviteButton = createButton('Copy Invite Link', () => {
    void navigator.clipboard.writeText(buildInviteLink(ctx.roomCode));
  });
  inviteButton.style.display = isMultiplayer ? 'inline-flex' : 'none';

  const slotPanel = document.createElement('div');
  slotPanel.className = 'pixel-panel';
  slotPanel.style.padding = '12px';
  slotPanel.style.display = 'grid';
  slotPanel.style.gap = '8px';

  const playerSlot = document.createElement('div');
  playerSlot.textContent = `Blue: ${ctx.playerName || 'Player'} (Not Ready)`;
  playerSlot.style.color = 'var(--blue)';

  const opponentSlot = document.createElement('div');
  opponentSlot.textContent = opponentType === 'BOT'
    ? 'Red: Ice Bot (Ready)'
    : opponentType === 'NONE'
      ? 'Solo: No opponent'
      : 'Red: Waiting for player...';
  opponentSlot.style.color = opponentType === 'NONE' ? 'var(--ui-text)' : 'var(--red)';

  const lobbyStatus = document.createElement('p');
  lobbyStatus.className = 'subtle';
  lobbyStatus.textContent = isMultiplayer
    ? 'Waiting for both players to ready up.'
    : 'Toggle Ready then start the match.';

  slotPanel.append(playerSlot, opponentSlot);

  let isReady = false;
  let disposed = false;
  let pollId: number | null = null;
  let lobbyState = initialLobby;
  let syncedState = initialState;
  const session = ctx.multiplayerSession;

  const disconnectBackoffMs = 90_000;

  const clearPoll = () => {
    if (pollId !== null) {
      window.clearInterval(pollId);
      pollId = null;
    }
  };

  const clearSessionAndExit = (message: string, code: string | null = null): void => {
    if (code === 'ROOM_EXPIRED' || code === 'ROOM_NOT_FOUND') {
      if (ctx.roomCode) {
        removeStoredSession(ctx.roomCode);
      }
    }
    disposed = true;
    clearPoll();
    if (session) {
      removeStoredSession(session.roomCode);
    }
    ctx.multiplayerSession = null;
    alert(message);
    renderMenu(ctx);
  };

  const safeRenderGame = (state: GameState | null): void => {
    if (disposed) {
      return;
    }
    disposed = true;
    clearPoll();
    const runtimeOpponent = runtimeOpponentFromLobbyMode(opponentType);
    renderGame(
      ctx,
      opponentType,
      runtimeOpponent === 'NONE' ? null : session,
      state,
    );
  };

  const applyLobbyState = (nextLobby: MultiplayerLobbyState, nextState: GameState | null): void => {
    lobbyState = nextLobby;
    syncedState = nextState;

    const p1 = nextLobby.players.P1;
    const p2 = nextLobby.players.P2;

    const p1Tag = p1?.connected ? '' : ' [disconnected]';
    const p2Tag = p2?.connected ? '' : ' [disconnected]';

    playerSlot.textContent = p1
      ? `Blue: ${p1.name} (${p1.ready ? 'Ready' : 'Not Ready'})${p1Tag}`
      : 'Blue: Waiting for player...';

    opponentSlot.textContent = opponentType === 'BOT'
      ? 'Red: Ice Bot (Ready)'
      : p2
        ? `Red: ${p2.name} (${p2.ready ? 'Ready' : 'Not Ready'})${p2Tag}`
        : 'Red: Waiting for player...';

    const localPlayer = nextLobby.players[session?.playerId ?? 'P1'];
    if (localPlayer) {
      readyButton.textContent = localPlayer.ready ? 'Set Not Ready' : 'Set Ready';
      readyButton.disabled = !localPlayer.connected;
    } else {
      readyButton.textContent = 'Set Ready';
      readyButton.disabled = true;
    }

    const canStartAsHost = Boolean(
      session?.playerId === 'P1' &&
      p1?.ready &&
      p2?.ready &&
      !nextLobby.started &&
      !nextLobby.disconnectedPlayerId,
    );

    if (nextLobby.disconnectedPlayerId) {
      const reconnectMessage = formatPauseCountdown(
        nextLobby.timeoutAtMs,
        nextLobby.disconnectedPlayerId,
      );
      lobbyStatus.textContent = `Match paused: ${reconnectMessage}`;
    } else if (isMultiplayer) {
      lobbyStatus.textContent =
        p2 === null
          ? 'Waiting for a second player to join.'
          : 'Both players must be ready before host can start.';
    }

    startButton.disabled = isMultiplayer ? !canStartAsHost : !isReady;
    if (isMultiplayer) {
      startButton.textContent = session?.playerId === 'P1' ? 'Start Match' : 'Waiting for Host';
      if (nextLobby.disconnectedPlayerId) {
        startButton.disabled = true;
        startButton.textContent = 'Match Paused';
      }
    }

    if (nextLobby.started) {
      lobbyStatus.textContent = 'Match started. Launching game...';
      if (nextState) {
        safeRenderGame(nextState);
      }
      return;
    }

    if (nextLobby.disconnectedPlayerId) {
      // Keep the disconnect message stable until state is back to normal.
      return;
    }
  };

  const syncLobby = async (): Promise<void> => {
    if (!session || disposed) {
      return;
    }
    try {
      const response = await fetchMultiplayerRoomState(session);
      if (disposed) {
        return;
      }
      applyLobbyState(response.lobby, response.state);
    } catch (error) {
      const { code, message } = friendlyMultiplayerError(error);
      if (code === 'ROOM_NOT_FOUND' || code === 'ROOM_EXPIRED' || code === 'UNAUTHORIZED') {
        clearSessionAndExit(message, code);
        return;
      }
      lobbyStatus.textContent = `Sync failed: ${message}`;
    }
  };

  const readyButton = createButton('Toggle Ready', () => {
    if (!isMultiplayer) {
      isReady = !isReady;
      playerSlot.textContent = `Blue: ${ctx.playerName || 'Player'} (${isReady ? 'Ready' : 'Not Ready'})`;
      startButton.disabled = !isReady;
      return;
    }

    if (!session || !lobbyState || disposed) {
      return;
    }
    const me = lobbyState.players[session.playerId];
    if (!me || !me.connected) {
      return;
    }

    readyButton.disabled = true;
    void setMultiplayerReady(session, !me.ready)
      .then((response) => {
        if (disposed) {
          return;
        }
        applyLobbyState(response.lobby, response.state);
      })
      .catch((error) => {
        const { code, message } = friendlyMultiplayerError(error);
        if (code === 'UNAUTHORIZED') {
          clearSessionAndExit(message, code);
          return;
        }
        alert(`Ready update failed: ${message}`);
      })
      .finally(() => {
        if (!disposed) {
          readyButton.disabled = false;
        }
      });
  });

  const startButton = createButton('Start Match', () => {
    if (!isMultiplayer) {
      if (!isReady) {
        return;
      }
      safeRenderGame(null);
      return;
    }
    if (!session || disposed || session.playerId !== 'P1') {
      return;
    }
    startButton.disabled = true;
    void startMultiplayerRoom(session)
      .then((response) => {
        if (disposed) {
          return;
        }
        applyLobbyState(response.lobby, response.state);
        if (response.state) {
          safeRenderGame(response.state);
        }
      })
      .catch((error) => {
        const { code, message } = friendlyMultiplayerError(error);
        if (code === 'UNAUTHORIZED' || code === 'ROOM_EXPIRED' || code === 'ROOM_NOT_FOUND') {
          clearSessionAndExit(message, code);
          return;
        }
        alert(`Start Match failed: ${message}`);
      })
      .finally(() => {
        if (!disposed) {
          startButton.disabled = false;
        }
      });
  }, !isMultiplayer);

  const backButton = createButton('Back', () => {
    disposed = true;
    clearPoll();
    ctx.multiplayerSession = null;
    renderMenu(ctx);
  });

  card.append(heading, roomInfo, inviteButton, slotPanel, lobbyStatus, readyButton, startButton, backButton);
  shell.append(card);
  ctx.root.append(shell);

  if (isMultiplayer) {
    const reconnectHint = document.createElement('p');
    reconnectHint.className = 'subtle';
    if (disconnectBackoffMs > 0) {
      reconnectHint.textContent = `Disconnected players may reconnect for ${disconnectBackoffMs / 1000}s before forfeit.`;
    } else {
      reconnectHint.textContent = 'Reconnect handling enabled for active rooms.';
    }
    card.append(reconnectHint);

    if (!session) {
      alert('Multiplayer session missing. Returning to menu.');
      renderMenu(ctx);
      return;
    }
    if (lobbyState) {
      applyLobbyState(lobbyState, syncedState);
    } else {
      void syncLobby();
    }
    pollId = window.setInterval(() => {
      void syncLobby();
    }, 1000);
  }
}

function renderGame(
  ctx: AppContext,
  opponentType: LobbyMode,
  multiplayerSession: MultiplayerSession | null = null,
  initialState: GameState | null = null,
): void {
  clearRoot(ctx.root);
  const gameMode = gameModeFromLobbyMode(opponentType);
  const localPlayerId = multiplayerSession?.playerId ?? 'P1';

  const shell = document.createElement('div');
  shell.className = 'app-shell game-shell';

  const runtime = new GameRuntime({
    mount: shell,
    humanPlayerName: ctx.playerName,
    roomCode: multiplayerSession?.roomCode ?? ctx.roomCode,
    opponentType: runtimeOpponentFromLobbyMode(opponentType),
    gameMode,
    configMode: currentConfigMode(),
    multiplayerSession: multiplayerSession ?? undefined,
    initialState,
    onExit: (outcome) => {
      runtime.destroy();
      ctx.runtime = null;
      ctx.multiplayerSession = null;
      const shouldRecordProgress =
        outcome.reason === 'Match ended' ||
        outcome.reason === 'Draw by tie' ||
        gameMode === 'SOLO';

      if (ctx.playerName && shouldRecordProgress) {
        recordGameResult({
          username: ctx.playerName,
          mode: gameMode,
          playerId: localPlayerId,
          winnerId: outcome.winnerId,
          playerMoney: outcome.playerMoney,
        });
      }
      renderEnd(ctx, outcome, gameMode);
    },
  });

  ctx.runtime = runtime;
  runtime.start();
  ctx.root.append(shell);
}

function renderEnd(ctx: AppContext, outcome: RuntimeOutcome, gameMode: GameMode): void {
  clearRoot(ctx.root);

  const shell = document.createElement('div');
  shell.className = 'app-shell end-screen';

  const card = document.createElement('div');
  card.className = 'end-card';

  const title = document.createElement('h2');
  title.className = 'title';
  title.style.fontSize = '34px';
  if (gameMode === 'SOLO') {
    title.textContent = `Solo Score: $${outcome.playerMoney}c`;
  } else {
    title.textContent = outcome.winnerName ? `${outcome.winnerName} Wins` : 'Draw';
  }

  const details = document.createElement('p');
  details.className = 'subtle';
  details.textContent = `Reason: ${outcome.reason}`;

  const rewards = document.createElement('p');
  rewards.className = 'subtle';
  rewards.textContent = gameMode === 'SOLO'
    ? `Solo mode does not convert money into Ice Coins. Final money: $${outcome.playerMoney}c.`
    : `Converted $${outcome.playerMoney}c into Ice Coins for your account.`;

  const backButton = createButton('Return to Menu', () => {
    renderMenu(ctx);
  });

  card.append(title, details, rewards, backButton);
  shell.append(card);
  ctx.root.append(shell);
}

export function bootstrapApp(root: HTMLElement): void {
  const roomFromQuery = normalizeRoomCode(new URLSearchParams(window.location.search).get('room') ?? '');
  const initialName = getAuthenticatedUsername() ?? '';
  const ctx: AppContext = {
    root,
    runtime: null,
    playerName: initialName,
    roomCode: roomFromQuery || randomRoomCode(),
    multiplayerSession: null,
  };

  renderSplash(ctx);
}
