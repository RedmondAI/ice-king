import type { ActionResult, GameAction, GameState } from '@ice-king/shared';

export type MultiplayerPlayerId = 'P1' | 'P2';

export interface MultiplayerSession {
  roomCode: string;
  playerId: MultiplayerPlayerId;
  token: string;
}

export interface MultiplayerChatMessage {
  id: string;
  playerId: MultiplayerPlayerId;
  playerName: string;
  text: string;
  sentAtMs: number;
}

export interface MultiplayerLobbyPlayerState {
  id: MultiplayerPlayerId;
  name: string;
  ready: boolean;
  connected: boolean;
}

export interface MultiplayerLobbyState {
  roomCode: string;
  started: boolean;
  hostPlayerId: MultiplayerPlayerId;
  players: {
    P1: MultiplayerLobbyPlayerState;
    P2: MultiplayerLobbyPlayerState | null;
  };
  disconnectedPlayerId: string | null;
  pausedAtMs: number | null;
  timeoutAtMs: number | null;
}

export interface MultiplayerRoomPayload {
  serverNowMs: number;
  lobby: MultiplayerLobbyState;
  state: GameState | null;
  chat: MultiplayerChatMessage[];
}

export interface MultiplayerCreateRequest {
  playerName: string;
  configMode: 'PROD' | 'DEV_FAST';
  preferredRoomCode?: string | null;
}

export interface MultiplayerJoinRequest {
  roomCode: string;
  playerName: string;
}

export interface MultiplayerReadyRequest {
  roomCode: string;
  token: string;
  ready: boolean;
}

export interface MultiplayerStateQuery {
  roomCode: string;
  token: string;
}

export interface MultiplayerActionRequest {
  roomCode: string;
  token: string;
  action: GameAction;
}

export interface MultiplayerChatRequest {
  roomCode: string;
  token: string;
  text: string;
}

export interface MultiplayerResponse<TData = unknown> {
  serverNowMs: number;
  lobby: MultiplayerLobbyState;
  state: GameState | null;
  chat: MultiplayerChatMessage[];
  result?: ActionResult;
  data?: TData;
}

export interface MultiplayerCreateResponse {
  session: MultiplayerSession;
  serverNowMs: number;
  lobby: MultiplayerLobbyState;
  state: GameState | null;
  chat: MultiplayerChatMessage[];
}

export interface MultiplayerJoinResponse {
  session: MultiplayerSession;
  serverNowMs: number;
  lobby: MultiplayerLobbyState;
  state: GameState | null;
  chat: MultiplayerChatMessage[];
}

export interface MultiplayerReadyResponse {
  serverNowMs: number;
  lobby: MultiplayerLobbyState;
  state: GameState | null;
  chat: MultiplayerChatMessage[];
}

export interface MultiplayerActionResponse {
  serverNowMs: number;
  lobby: MultiplayerLobbyState;
  state: GameState | null;
  chat: MultiplayerChatMessage[];
  result: ActionResult;
}

export interface MultiplayerChatResponse {
  serverNowMs: number;
  lobby: MultiplayerLobbyState;
  state: GameState | null;
  chat: MultiplayerChatMessage[];
  message: MultiplayerChatMessage;
}

interface ErrorPayload {
  error?: string;
  details?: string;
  serverNowMs?: number;
}

const MULTIPLAYER_BASE_URL = '/api/multiplayer';

export class MultiplayerRequestError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: string;

  constructor(code: string, status: number, details?: string) {
    super(`${code}: ${details ?? 'multiplayer request failed'}`);
    this.name = 'MultiplayerRequestError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function readJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let payload: unknown;

  if (raw.length > 0) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }
  } else {
    payload = {};
  }

  if (!response.ok) {
    const parsed = isObject(payload) ? (payload as ErrorPayload) : {};
    const code =
      typeof parsed.error === 'string' && parsed.error.length > 0 ? parsed.error : 'REQUEST_FAILED';
    const details =
      typeof parsed.details === 'string' && parsed.details.length > 0
        ? parsed.details
        : typeof raw === 'string' && raw.length > 0
          ? raw
          : response.statusText;
    throw new MultiplayerRequestError(code, response.status, details);
  }

  if (isObject(payload)) {
    return payload as T;
  }

  throw new MultiplayerRequestError('INVALID_RESPONSE', response.status, 'Non-JSON response from multiplayer API');
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${MULTIPLAYER_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<T>(response);
}

async function getJson<T>(path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(`${MULTIPLAYER_BASE_URL}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
  });
  return readJson<T>(response);
}

export function buildInviteLink(roomCode: string): string {
  const normalized = normalizeRoomCode(roomCode);
  const url = new URL(window.location.href);
  url.searchParams.set('room', normalized);
  return url.toString();
}

export function getMultiplayerErrorCode(error: unknown): string | null {
  if (error instanceof MultiplayerRequestError) {
    return error.code;
  }
  return null;
}

export async function createMultiplayerRoom(
  playerName: string,
  configMode: 'PROD' | 'DEV_FAST',
  preferredRoomCode: string | null = null,
): Promise<MultiplayerCreateResponse> {
  return postJson<MultiplayerCreateResponse>('/create', {
    playerName,
    configMode,
    preferredRoomCode: preferredRoomCode ? normalizeRoomCode(preferredRoomCode) : null,
  });
}

export async function joinMultiplayerRoom(
  roomCode: string,
  playerName: string,
): Promise<MultiplayerJoinResponse> {
  return postJson<MultiplayerJoinResponse>('/join', {
    roomCode: normalizeRoomCode(roomCode),
    playerName,
  });
}

export async function fetchMultiplayerRoomState(
  session: MultiplayerSession,
): Promise<MultiplayerRoomPayload> {
  return getJson<MultiplayerRoomPayload>('/state', {
    roomCode: normalizeRoomCode(session.roomCode),
    token: session.token,
    playerId: session.playerId,
  });
}

export async function setMultiplayerReady(
  session: MultiplayerSession,
  ready: boolean,
): Promise<MultiplayerReadyResponse> {
  return postJson<MultiplayerReadyResponse>('/ready', {
    roomCode: normalizeRoomCode(session.roomCode),
    token: session.token,
    ready,
  });
}

export async function startMultiplayerRoom(session: MultiplayerSession): Promise<MultiplayerReadyResponse> {
  return postJson<MultiplayerReadyResponse>('/start', {
    roomCode: normalizeRoomCode(session.roomCode),
    token: session.token,
  });
}

export async function submitMultiplayerAction(
  session: MultiplayerSession,
  action: GameAction,
): Promise<MultiplayerActionResponse> {
  return postJson<MultiplayerActionResponse>('/action', {
    roomCode: normalizeRoomCode(session.roomCode),
    token: session.token,
    action,
  });
}

export async function submitMultiplayerChat(
  session: MultiplayerSession,
  text: string,
): Promise<MultiplayerChatResponse> {
  return postJson<MultiplayerChatResponse>('/chat', {
    roomCode: normalizeRoomCode(session.roomCode),
    token: session.token,
    text,
  });
}
