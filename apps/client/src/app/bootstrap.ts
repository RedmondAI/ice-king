import { GameRuntime } from '../game/runtime';
import type { GameState } from '@ice-king/shared';
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
import { createAccount, getAuthenticatedUsername, isSameUser, login, logout } from './auth';

interface AppContext {
  root: HTMLElement;
  runtime: GameRuntime | null;
  playerName: string;
  roomCode: string;
  multiplayerSession: MultiplayerSession | null;
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
    reconnectHint.textContent = 'Enter starts Play vs Computer.';
  } else {
    reconnectHint.textContent = 'Create an account or log in to play.';
  }

  const showSoonToast = (feature: string) => {
    alert(`${feature} is scaffolded for a later milestone. Use Play vs Computer for v1 testing.`);
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

  const beginLobby = (opponentType: 'HUMAN' | 'BOT') => {
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
    void fetchMultiplayerRoomState(resolvedSession)
      .then((response) => {
        if (ctx.playerName.length === 0) {
          ctx.playerName = storedSession.playerName;
          nameInput.value = storedSession.playerName;
        }
        ctx.roomCode = response.lobby.roomCode;
        ctx.multiplayerSession = resolvedSession;
        detachKeyListener();
        setStoredSession(response.lobby.roomCode, resolvedSession, ctx.playerName);
        renderLobby(ctx, 'HUMAN', response.lobby, response.state);
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

  const createGameButton = createButton('Create Game', () => {
    if (isBusy || !ctx.playerName) {
      return;
    }
    isBusy = true;
    updateMenuDisabled();
    void createMultiplayerRoom(ctx.playerName, currentConfigMode(), roomFromQuery || null)
      .then((response) => {
        ctx.roomCode = response.session.roomCode;
        ctx.multiplayerSession = response.session;
        setStoredSession(response.session.roomCode, response.session, ctx.playerName);
        detachKeyListener();
        renderLobby(ctx, 'HUMAN', response.lobby, response.state);
      })
      .catch((error) => {
        const { message } = friendlyMultiplayerError(error);
        alert(`Create Game failed: ${message}`);
      })
      .finally(() => {
        isBusy = false;
        updateMenuDisabled();
      });
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
        renderLobby(ctx, 'HUMAN', response.lobby, response.state);
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

  const playVsComputerButton = createButton('Play vs Computer', () => {
    beginLobby('BOT');
  }, !ctx.playerName);

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
    createGameButton.disabled = missingName || isBusy;
    joinGameButton.disabled = missingName || isBusy;
    reconnectButton.disabled = !canReconnectStoredSession || missingName || isBusy;
    playVsComputerButton.disabled = missingName || isBusy;
  };

  if (ctx.playerName) {
    authStatus.textContent = `Signed in as ${ctx.playerName}.`;
    const logoutButton = createButton('Log Out', () => {
      logout();
      ctx.playerName = '';
      rerenderSplash();
    });
    authPanel.append(authStatus, logoutButton);
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
    menuGrid.append(createGameButton, joinGameButton, reconnectButton, playVsComputerButton, howToPlayButton, settingsButton);
  } else {
    menuGrid.append(createGameButton, joinGameButton, playVsComputerButton, howToPlayButton, settingsButton);
  }

  const keyListener = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') {
      return;
    }
    if (ctx.playerName.length > 0) {
      event.preventDefault();
      beginLobby('BOT');
      return;
    }
    if (authUsernameInput && authPasswordInput) {
      event.preventDefault();
      attemptLogin();
    }
  };

  window.addEventListener('keydown', keyListener);
  updateMenuDisabled();

  card.append(logo, subtitle, points, authPanel, menuGrid, reconnectHint);
  shell.append(artWrap, vignette, frost, card);
  ctx.root.append(shell);
}

function renderMenu(ctx: AppContext): void {
  renderSplash(ctx);
}

function renderLobby(
  ctx: AppContext,
  opponentType: 'HUMAN' | 'BOT',
  initialLobby: MultiplayerLobbyState | null = null,
  initialState: GameState | null = null,
): void {
  clearRoot(ctx.root);

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
  roomInfo.textContent = `Room Code: ${ctx.roomCode}`;

  const inviteButton = createButton('Copy Invite Link', () => {
    void navigator.clipboard.writeText(buildInviteLink(ctx.roomCode));
  });

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
    : 'Red: Waiting for player...';
  opponentSlot.style.color = 'var(--red)';

  const lobbyStatus = document.createElement('p');
  lobbyStatus.className = 'subtle';
  lobbyStatus.textContent =
    opponentType === 'BOT'
      ? 'Toggle Ready then start the match.'
      : 'Waiting for both players to ready up.';

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
    renderGame(ctx, opponentType, opponentType === 'HUMAN' ? session : null, state);
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
    } else if (opponentType === 'HUMAN') {
      lobbyStatus.textContent =
        p2 === null
          ? 'Waiting for a second player to join.'
          : 'Both players must be ready before host can start.';
    }

    startButton.disabled = opponentType === 'BOT' ? !isReady : !canStartAsHost;
    if (opponentType === 'HUMAN') {
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
    if (opponentType === 'BOT') {
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
    if (opponentType === 'BOT') {
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
  }, opponentType === 'BOT');

  const backButton = createButton('Back', () => {
    disposed = true;
    clearPoll();
    ctx.multiplayerSession = null;
    renderMenu(ctx);
  });

  card.append(heading, roomInfo, inviteButton, slotPanel, lobbyStatus, readyButton, startButton, backButton);
  shell.append(card);
  ctx.root.append(shell);

  const reconnectHint = document.createElement('p');
  reconnectHint.className = 'subtle';
  if (disconnectBackoffMs > 0) {
    reconnectHint.textContent = `Disconnected players may reconnect for ${disconnectBackoffMs / 1000}s before forfeit.`;
  } else {
    reconnectHint.textContent = 'Reconnect handling enabled for active rooms.';
  }
  card.append(reconnectHint);

  if (opponentType === 'HUMAN') {
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
  opponentType: 'HUMAN' | 'BOT',
  multiplayerSession: MultiplayerSession | null = null,
  initialState: GameState | null = null,
): void {
  clearRoot(ctx.root);

  const shell = document.createElement('div');
  shell.className = 'app-shell game-shell';

  const runtime = new GameRuntime({
    mount: shell,
    humanPlayerName: ctx.playerName,
    roomCode: multiplayerSession?.roomCode ?? ctx.roomCode,
    opponentType,
    configMode: currentConfigMode(),
    multiplayerSession: multiplayerSession ?? undefined,
    initialState,
    onExit: (outcome) => {
      runtime.destroy();
      ctx.runtime = null;
      ctx.multiplayerSession = null;
      renderEnd(ctx, outcome.winnerName ?? null, outcome.reason);
    },
  });

  ctx.runtime = runtime;
  runtime.start();
  ctx.root.append(shell);
}

function renderEnd(ctx: AppContext, winnerName: string | null, reason: string): void {
  clearRoot(ctx.root);

  const shell = document.createElement('div');
  shell.className = 'app-shell end-screen';

  const card = document.createElement('div');
  card.className = 'end-card';

  const title = document.createElement('h2');
  title.className = 'title';
  title.style.fontSize = '34px';
  title.textContent = winnerName ? `${winnerName} Wins` : 'Draw';

  const details = document.createElement('p');
  details.className = 'subtle';
  details.textContent = `Reason: ${reason}`;

  const backButton = createButton('Return to Menu', () => {
    renderMenu(ctx);
  });

  card.append(title, details, backButton);
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
