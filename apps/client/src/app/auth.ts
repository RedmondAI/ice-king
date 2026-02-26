import type { GameMode } from '../game/types';

interface StoredUser {
  username: string;
  password: string;
  stats: UserStats;
}

interface AuthFailure {
  ok: false;
  error: string;
}

interface AuthSuccess {
  ok: true;
  username: string;
}

type AuthResult = AuthFailure | AuthSuccess;

const USERS_STORE_KEY = 'iceking-auth-users-v1';
const ACTIVE_USER_STORE_KEY = 'iceking-auth-active-user-v1';
const MIN_PASSWORD_LENGTH = 4;
const MAX_USERNAME_LENGTH = 24;
const NEW_USER_STARTING_ICE_COINS = 100;

export interface UserStats {
  iceCoins: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  gamesDrawn: number;
  soloGamesPlayed: number;
  bestSoloMoney: number;
  totalMoneyEarned: number;
  totalCoinsEarned: number;
  lastGameAtMs: number | null;
}

export interface RecordGameResultInput {
  username: string;
  mode: GameMode;
  playerId: string;
  winnerId: string | null;
  playerMoney: number;
}

const DEFAULT_USER_STATS: UserStats = {
  iceCoins: 0,
  gamesPlayed: 0,
  gamesWon: 0,
  gamesLost: 0,
  gamesDrawn: 0,
  soloGamesPlayed: 0,
  bestSoloMoney: 0,
  totalMoneyEarned: 0,
  totalCoinsEarned: 0,
  lastGameAtMs: null,
};

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function normalizeUsername(raw: string): string {
  return raw.trim();
}

function usernameKey(raw: string): string {
  return normalizeUsername(raw).toLowerCase();
}

function normalizeNonNegativeNumber(raw: unknown, fallback = 0): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.floor(parsed));
}

function parseStats(raw: unknown): UserStats {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_USER_STATS };
  }
  const maybe = raw as Record<string, unknown>;
  return {
    iceCoins: normalizeNonNegativeNumber(maybe.iceCoins),
    gamesPlayed: normalizeNonNegativeNumber(maybe.gamesPlayed),
    gamesWon: normalizeNonNegativeNumber(maybe.gamesWon),
    gamesLost: normalizeNonNegativeNumber(maybe.gamesLost),
    gamesDrawn: normalizeNonNegativeNumber(maybe.gamesDrawn),
    soloGamesPlayed: normalizeNonNegativeNumber(maybe.soloGamesPlayed),
    bestSoloMoney: normalizeNonNegativeNumber(maybe.bestSoloMoney),
    totalMoneyEarned: normalizeNonNegativeNumber(maybe.totalMoneyEarned),
    totalCoinsEarned: normalizeNonNegativeNumber(maybe.totalCoinsEarned),
    lastGameAtMs:
      maybe.lastGameAtMs === null
      || (typeof maybe.lastGameAtMs === 'number' && Number.isFinite(maybe.lastGameAtMs) && maybe.lastGameAtMs > 0)
        ? (maybe.lastGameAtMs as number | null)
        : null,
  };
}

function readUsers(): Record<string, StoredUser> {
  if (!canUseStorage()) {
    return {};
  }

  try {
    const raw = localStorage.getItem(USERS_STORE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const users: Record<string, StoredUser> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const maybeUser = value as Record<string, unknown>;
      const username = typeof maybeUser.username === 'string' ? maybeUser.username : '';
      const password = typeof maybeUser.password === 'string' ? maybeUser.password : '';
      if (!username || !password) {
        continue;
      }
      users[key] = {
        username,
        password,
        stats: parseStats(maybeUser.stats),
      };
    }
    return users;
  } catch {
    return {};
  }
}

function writeUsers(users: Record<string, StoredUser>): void {
  if (!canUseStorage()) {
    return;
  }
  localStorage.setItem(USERS_STORE_KEY, JSON.stringify(users));
}

function setActiveUsername(username: string | null): void {
  if (!canUseStorage()) {
    return;
  }
  if (!username) {
    localStorage.removeItem(ACTIVE_USER_STORE_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_USER_STORE_KEY, username);
}

function validateUsername(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (!username) {
    return 'Username is required.';
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return `Username must be ${MAX_USERNAME_LENGTH} characters or less.`;
  }
  return null;
}

function validatePassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function getUserStats(rawUsername: string): UserStats {
  const normalized = normalizeUsername(rawUsername);
  if (!normalized) {
    return { ...DEFAULT_USER_STATS };
  }
  const users = readUsers();
  const user = users[usernameKey(normalized)];
  if (!user) {
    return { ...DEFAULT_USER_STATS };
  }
  return { ...user.stats };
}

export function recordGameResult(input: RecordGameResultInput): UserStats {
  const normalized = normalizeUsername(input.username);
  if (!normalized) {
    return { ...DEFAULT_USER_STATS };
  }
  const key = usernameKey(normalized);
  const users = readUsers();
  const user = users[key];
  if (!user) {
    return { ...DEFAULT_USER_STATS };
  }

  const stats: UserStats = {
    ...user.stats,
  };

  const money = normalizeNonNegativeNumber(input.playerMoney);
  stats.totalMoneyEarned += money;

  if (input.mode === 'SOLO') {
    stats.soloGamesPlayed += 1;
    stats.bestSoloMoney = Math.max(stats.bestSoloMoney, money);
  } else {
    stats.gamesPlayed += 1;
    if (input.winnerId === null) {
      stats.gamesDrawn += 1;
    } else if (input.winnerId === input.playerId) {
      stats.gamesWon += 1;
    } else {
      stats.gamesLost += 1;
    }

    stats.iceCoins += money;
    stats.totalCoinsEarned += money;
  }

  stats.lastGameAtMs = Date.now();
  user.stats = stats;
  users[key] = user;
  writeUsers(users);
  return { ...stats };
}

export function createAccount(rawUsername: string, password: string): AuthResult {
  const usernameError = validateUsername(rawUsername);
  if (usernameError) {
    return { ok: false, error: usernameError };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return { ok: false, error: passwordError };
  }

  const normalized = normalizeUsername(rawUsername);
  const key = usernameKey(normalized);
  const users = readUsers();
  if (users[key]) {
    return { ok: false, error: 'Username already exists. Please log in.' };
  }

  users[key] = {
    username: normalized,
    password,
    stats: {
      ...DEFAULT_USER_STATS,
      iceCoins: NEW_USER_STARTING_ICE_COINS,
    },
  };
  writeUsers(users);
  setActiveUsername(normalized);
  return { ok: true, username: normalized };
}

export function login(rawUsername: string, password: string): AuthResult {
  const usernameError = validateUsername(rawUsername);
  if (usernameError) {
    return { ok: false, error: usernameError };
  }

  if (password.length === 0) {
    return { ok: false, error: 'Password is required.' };
  }

  const normalized = normalizeUsername(rawUsername);
  const key = usernameKey(normalized);
  const users = readUsers();
  const existing = users[key];
  if (!existing || existing.password !== password) {
    return { ok: false, error: 'Invalid username or password.' };
  }

  setActiveUsername(existing.username);
  return { ok: true, username: existing.username };
}

export function logout(): void {
  setActiveUsername(null);
}

export function getAuthenticatedUsername(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  const active = localStorage.getItem(ACTIVE_USER_STORE_KEY);
  if (!active) {
    return null;
  }

  const key = usernameKey(active);
  const users = readUsers();
  const user = users[key];
  if (!user) {
    setActiveUsername(null);
    return null;
  }
  return user.username;
}

export function isSameUser(left: string, right: string): boolean {
  return usernameKey(left) === usernameKey(right);
}
