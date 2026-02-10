import { GameRuntime } from '../game/runtime';
import splashIceKingWebp from '../assets/splash-ice-king.webp';
import iceKingLogoPng from '../assets/ui/ice-king-logo.png';

interface AppContext {
  root: HTMLElement;
  runtime: GameRuntime | null;
  playerName: string;
  roomCode: string;
}

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

function createButton(label: string, onClick: () => void, disabled = false): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = 'pixel-button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function renderSplash(ctx: AppContext): void {
  clearRoot(ctx.root);

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

  const nameInput = document.createElement('input');
  nameInput.className = 'text-input';
  nameInput.placeholder = 'Display name';
  nameInput.maxLength = 24;
  nameInput.value = ctx.playerName;

  const menuGrid = document.createElement('div');
  menuGrid.className = 'menu-grid';

  const showSoonToast = (feature: string) => {
    alert(`${feature} is scaffolded for a later milestone. Use Play vs Computer for v1 testing.`);
  };

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
    detachKeyListener();
    ctx.roomCode = randomRoomCode();
    renderLobby(ctx, opponentType);
  };

  const createGameButton = createButton('Create Game', () => {
    beginLobby('HUMAN');
  }, !ctx.playerName);

  const joinGameButton = createButton('Join Game', () => {
    showSoonToast('Join Game');
  }, !ctx.playerName);

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
        '5) Highest net worth at match end wins.',
      ].join('\n'),
    );
  });

  const settingsButton = createButton('Settings', () => {
    showSoonToast('Settings');
  });

  nameInput.addEventListener('input', () => {
    ctx.playerName = nameInput.value.trim();
    const missingName = ctx.playerName.length === 0;
    createGameButton.disabled = missingName;
    joinGameButton.disabled = missingName;
    playVsComputerButton.disabled = missingName;
  });

  menuGrid.append(
    createGameButton,
    joinGameButton,
    playVsComputerButton,
    howToPlayButton,
    settingsButton,
  );

  const hint = document.createElement('p');
  hint.className = 'splash-hint';
  hint.textContent = 'Enter starts Play vs Computer when a display name is set.';

  const keyListener = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && ctx.playerName.length > 0) {
      event.preventDefault();
      beginLobby('BOT');
    }
  };

  window.addEventListener('keydown', keyListener);

  card.append(logo, subtitle, points, nameInput, menuGrid, hint);
  shell.append(artWrap, vignette, frost, card);
  ctx.root.append(shell);
}

function renderMenu(ctx: AppContext): void {
  renderSplash(ctx);
}

function renderLobby(ctx: AppContext, opponentType: 'HUMAN' | 'BOT'): void {
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
    const url = `${window.location.origin}${window.location.pathname}?room=${ctx.roomCode}`;
    void navigator.clipboard.writeText(url);
  });

  const slotPanel = document.createElement('div');
  slotPanel.className = 'pixel-panel';
  slotPanel.style.padding = '12px';
  slotPanel.style.display = 'grid';
  slotPanel.style.gap = '8px';

  const playerSlot = document.createElement('div');
  playerSlot.textContent = `Blue: ${ctx.playerName || 'Player'} (Not Ready)`;
  playerSlot.style.color = 'var(--blue)';

  const botSlot = document.createElement('div');
  if (opponentType === 'BOT') {
    botSlot.textContent = 'Red: Ice Bot (Ready)';
    botSlot.style.color = 'var(--red)';
  } else {
    botSlot.textContent = 'Red: Waiting for player...';
    botSlot.style.color = 'var(--red)';
  }

  slotPanel.append(playerSlot, botSlot);

  let isReady = false;

  const readyButton = createButton('Toggle Ready', () => {
    isReady = !isReady;
    playerSlot.textContent = `Blue: ${ctx.playerName || 'Player'} (${isReady ? 'Ready' : 'Not Ready'})`;
    startButton.disabled = !(isReady && opponentType === 'BOT');
  });

  const startButton = createButton('Start Match', () => {
    if (!(isReady && opponentType === 'BOT')) {
      return;
    }
    renderGame(ctx, opponentType);
  }, true);

  const backButton = createButton('Back', () => {
    renderMenu(ctx);
  });

  card.append(heading, roomInfo, inviteButton, slotPanel, readyButton, startButton, backButton);
  shell.append(card);
  ctx.root.append(shell);
}

function renderGame(ctx: AppContext, opponentType: 'HUMAN' | 'BOT'): void {
  clearRoot(ctx.root);

  const shell = document.createElement('div');
  shell.className = 'app-shell game-shell';

  const runtime = new GameRuntime({
    mount: shell,
    humanPlayerName: ctx.playerName,
    roomCode: ctx.roomCode,
    opponentType,
    configMode: window.location.search.includes('fast=1') ? 'DEV_FAST' : 'PROD',
    onExit: (outcome) => {
      runtime.destroy();
      ctx.runtime = null;
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
  const ctx: AppContext = {
    root,
    runtime: null,
    playerName: '',
    roomCode: randomRoomCode(),
  };

  renderSplash(ctx);
}
