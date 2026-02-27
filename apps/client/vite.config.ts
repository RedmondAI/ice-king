import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { GameEngine } from '@ice-king/game-core';
import { GameActionSchema, type ActionResult, type GameAction, type GameState } from '@ice-king/shared';

function readBody(req: NodeJS.ReadableStream, maxBytes = 512 * 1024): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let done = false;

    const onError = (error: unknown) => {
      if (done) {
        return;
      }
      done = true;
      rejectBody(error);
    };

    const onData = (chunk: Uint8Array | string) => {
      if (done) {
        return;
      }

      const bytes = typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.length;
      totalBytes += bytes;
      if (totalBytes > maxBytes) {
        done = true;
        try {
          // Stop accepting additional body data to avoid unbounded memory.
          (req as { destroy?: () => void }).destroy?.();
        } catch {
          // Ignore destroy errors.
        }
        rejectBody(new Error('REQUEST_BODY_TOO_LARGE'));
        return;
      }

      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    };

    const onEnd = () => {
      if (done) {
        return;
      }
      done = true;
      resolveBody(Buffer.concat(chunks).toString('utf8'));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

interface BotDecisionPayload {
  botPlayerId: string;
  stateSummary: Record<string, unknown>;
  allowedActions: unknown[];
  preferredActionIndex?: number | null;
}

interface ResponsesApiResult {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

type EnvMap = Record<string, string | undefined>;

interface OpenAiErrorPayload {
  error?: {
    message?: string;
    type?: string;
    param?: string;
    code?: string;
  };
}

interface BotUsageResponse {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

type MultiplayerPlayerId = 'P1' | 'P2';

interface MultiplayerRoomPlayer {
  id: MultiplayerPlayerId;
  name: string;
  token: string;
  ready: boolean;
  connected: boolean;
  joinedAtMs: number;
  lastSeenMs: number;
}

interface MultiplayerChatMessage {
  id: string;
  playerId: MultiplayerPlayerId;
  playerName: string;
  text: string;
  sentAtMs: number;
}

interface MultiplayerLobbySnapshot {
  roomCode: string;
  started: boolean;
  hostPlayerId: MultiplayerPlayerId;
  mode: 'PLAY_ONLINE' | 'FRIENDLY';
  disconnectedPlayerId: string | null;
  pausedAtMs: number | null;
  timeoutAtMs: number | null;
  players: {
    P1: Pick<MultiplayerRoomPlayer, 'id' | 'name' | 'ready' | 'connected'> | null;
    P2: Pick<MultiplayerRoomPlayer, 'id' | 'name' | 'ready' | 'connected'> | null;
  };
}

interface MultiplayerRoom {
  roomCode: string;
  configMode: 'PROD' | 'DEV_FAST';
  engine: GameEngine;
  mode: 'PLAY_ONLINE' | 'FRIENDLY';
  createdAtMs: number;
  updatedAtMs: number;
  lastTickAtMs: number;
  started: boolean;
  reconnectPauseMs: number;
  disconnectedPlayerId: string | null;
  pausedAtMs: number | null;
  timeoutAtMs: number | null;
  players: {
    P1: MultiplayerRoomPlayer;
    P2: MultiplayerRoomPlayer | null;
  };
  chat: MultiplayerChatMessage[];
}

function extractOutputText(result: ResponsesApiResult): string {
  return (
    result.output_text ??
    result.output
      ?.flatMap((item) => item.content ?? [])
      .find((item) => item.type === 'output_text' || typeof item.text === 'string')?.text ??
    ''
  );
}

function extractJsonCandidate(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    const withoutStart = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/, '');
    const withoutEnd = withoutStart.replace(/```$/, '');
    return withoutEnd.trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function parseActionIndex(text: string): number | null {
  const trimmed = text.trim();
  if (/^-?\d+$/.test(trimmed)) {
    const parsedNumber = Number.parseInt(trimmed, 10);
    return Number.isInteger(parsedNumber) ? parsedNumber : null;
  }

  const candidate = extractJsonCandidate(text);
  try {
    const parsed = JSON.parse(candidate) as
      | { actionIndex?: unknown; action_index?: unknown; index?: unknown }
      | number;
    if (typeof parsed === 'number' && Number.isInteger(parsed)) {
      return parsed;
    }
    const parsedObject = parsed as { actionIndex?: unknown; action_index?: unknown; index?: unknown };
    const raw = parsedObject.actionIndex ?? parsedObject.action_index ?? null;
    if (typeof raw === 'number' && Number.isInteger(raw)) {
      return raw;
    }
    const indexRaw = parsedObject.index ?? null;
    if (typeof indexRaw === 'number' && Number.isInteger(indexRaw)) {
      return indexRaw;
    }
    return null;
  } catch {
    const explicitMatch = text.match(/"action(?:_)?index"\s*:\s*(-?\d+)/i);
    if (explicitMatch && explicitMatch[1]) {
      const fromExplicit = Number.parseInt(explicitMatch[1], 10);
      if (Number.isInteger(fromExplicit)) {
        return fromExplicit;
      }
    }

    const firstInt = text.match(/-?\d+/);
    if (firstInt && firstInt[0]) {
      const fromInt = Number.parseInt(firstInt[0], 10);
      return Number.isInteger(fromInt) ? fromInt : null;
    }

    return null;
  }
}

function parseModelFallbacks(raw: string | undefined): string[] {
  if (!raw) {
    return ['gpt-5-mini', 'gpt-4.1-mini'];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseAllowedHosts(raw: string | undefined): string[] | true {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === 'true' || normalized === '*') {
    return true;
  }

  const defaults = ['.up.railway.app', 'localhost', '127.0.0.1'];
  const parsed = (raw ?? defaults.join(','))
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return parsed.length > 0 ? parsed : defaults;
}

function extractUsage(result: ResponsesApiResult): BotUsageResponse {
  const rawInput = result.usage?.input_tokens ?? result.usage?.prompt_tokens ?? 0;
  const rawOutput = result.usage?.output_tokens ?? result.usage?.completion_tokens ?? 0;
  const rawTotal = result.usage?.total_tokens ?? 0;
  const inputTokens = Number.isFinite(Number(rawInput)) ? Math.max(0, Number(rawInput)) : 0;
  const outputTokens = Number.isFinite(Number(rawOutput)) ? Math.max(0, Number(rawOutput)) : 0;
  const totalTokens = Number.isFinite(Number(rawTotal))
    ? Math.max(0, Number(rawTotal))
    : inputTokens + outputTokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function uniqueList(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
}

function actionIntent(action: unknown): string {
  const record = action as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';

  if (type.startsWith('pond.harvest.claim')) {
    return 'claim_ice';
  }
  if (type.startsWith('pond.harvest.start')) {
    return 'start_harvest';
  }
  if (type.startsWith('tile.buy') || type.startsWith('tile.buyFromPlayer')) {
    return 'expand_territory';
  }
  if (type.startsWith('tile.buildFactory')) {
    return 'build_factory';
  }
  if (type.startsWith('tile.buildManMadePond')) {
    return 'build_pond';
  }
  if (type.startsWith('structure.factory.craftRefrigerator')) {
    return 'craft_refrigerator';
  }
  if (type.startsWith('structure.factory.craftBlueIce')) {
    return 'craft_blue_ice';
  }
  if (type.startsWith('structure.house.sellIce')) {
    return 'sell_ice';
  }
  if (type.startsWith('structure.house.sellBlueIce')) {
    return 'sell_blue_ice';
  }
  if (type.startsWith('structure.train.sellAnnualShipment')) {
    return 'train_shipment';
  }
  return 'other';
}

function requestIp(req: { headers?: Record<string, unknown>; socket?: { remoteAddress?: string | null } }): string {
  const raw = req.headers?.['x-forwarded-for'];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.split(',')[0]?.trim() ?? 'unknown';
  }
  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim().length > 0) {
    return raw[0].split(',')[0]?.trim() ?? 'unknown';
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function randomRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    const index = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    code += ROOM_CODE_CHARS[index] ?? 'A';
  }
  return code;
}

function createUniqueRoomCode(rooms: Map<string, MultiplayerRoom>): string | null {
  for (let i = 0; i < 40; i += 1) {
    const code = randomRoomCode();
    if (!rooms.has(code)) {
      return code;
    }
  }
  return null;
}

function playerToken(): string {
  return randomBytes(24).toString('base64url');
}

function sanitizePlayerName(raw: unknown, fallback: string): string {
  const value = typeof raw === 'string' ? raw.trim().slice(0, 24) : '';
  return value.length > 0 ? value : fallback;
}

function sanitizeChatText(raw: unknown): string {
  if (typeof raw !== 'string') {
    return '';
  }
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
    .slice(0, 280);
}

function syncRoomPresence(room: MultiplayerRoom): void {
  const state = room.engine.getState();
  const p1 = room.players.P1;
  const p2 = room.players.P2;

  const stateP1 = state.players.P1;
  if (stateP1) {
    stateP1.name = p1.name;
    stateP1.connected = p1.connected;
    stateP1.ready = p1.ready;
    stateP1.controller = 'HUMAN';
  }

  const stateP2 = state.players.P2;
  if (stateP2) {
    if (p2) {
      stateP2.name = p2.name;
      stateP2.connected = p2.connected;
      stateP2.ready = p2.ready;
    } else {
      stateP2.name = 'Waiting for player...';
      stateP2.connected = false;
      stateP2.ready = false;
    }
    stateP2.controller = 'HUMAN';
  }
}

function toLobbySnapshot(room: MultiplayerRoom): MultiplayerLobbySnapshot {
  const p1 = room.players.P1;
  const p2 = room.players.P2;
  return {
    roomCode: room.roomCode,
    started: room.started,
    hostPlayerId: 'P1',
    mode: room.mode,
    players: {
      P1: {
        id: p1.id,
        name: p1.name,
        ready: p1.ready,
        connected: p1.connected,
      },
      P2: p2
        ? {
            id: p2.id,
            name: p2.name,
            ready: p2.ready,
            connected: p2.connected,
          }
        : null,
    },
    disconnectedPlayerId: room.disconnectedPlayerId,
    pausedAtMs: room.pausedAtMs,
    timeoutAtMs: room.timeoutAtMs,
  };
}

function tickRoom(room: MultiplayerRoom, nowMs: number): void {
  if (!room.started) {
    room.lastTickAtMs = nowMs;
    return;
  }
  const deltaMs = Math.max(0, nowMs - room.lastTickAtMs);
  if (deltaMs > 0) {
    room.engine.tick(deltaMs);
    room.lastTickAtMs = nowMs;
  }
}

function pruneStaleRooms(rooms: Map<string, MultiplayerRoom>, nowMs: number, ttlMs: number): void {
  for (const [roomCode, room] of rooms) {
    if (nowMs - room.updatedAtMs > ttlMs) {
      rooms.delete(roomCode);
    }
  }
}

function findPlayerByToken(room: MultiplayerRoom, token: string): MultiplayerRoomPlayer | null {
  if (room.players.P1.token === token) {
    return room.players.P1;
  }
  if (room.players.P2?.token === token) {
    return room.players.P2;
  }
  return null;
}

function jsonResponse(res: any, statusCode: number, payload: Record<string, unknown>): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function isRoomExpired(room: MultiplayerRoom, nowMs: number, ttlMs: number): boolean {
  return nowMs - room.updatedAtMs > ttlMs;
}

function buildMatchPausedPayload(
  room: MultiplayerRoom,
  nowMs: number,
): {
  error: 'MATCH_PAUSED';
  disconnectedPlayerId: string | null;
  timeoutAtMs: number | null;
  details: string;
} {
  const remainingMs = room.timeoutAtMs !== null ? Math.max(0, room.timeoutAtMs - nowMs) : null;
  const remainingSeconds = remainingMs !== null ? Math.ceil(remainingMs / 1000) : null;
  const playerLabel = room.disconnectedPlayerId ?? 'an opponent';
  const details =
    remainingSeconds !== null
      ? `${playerLabel} is disconnected. Match paused; resume in ${remainingSeconds}s.`
      : `${playerLabel} is disconnected. Match paused; awaiting reconnect.`;

  return {
    error: 'MATCH_PAUSED',
    disconnectedPlayerId: room.disconnectedPlayerId,
    timeoutAtMs: room.timeoutAtMs,
    details,
  };
}

function markPlayerHeartbeat(room: MultiplayerRoom, player: MultiplayerRoomPlayer, nowMs: number): void {
  player.connected = true;
  player.lastSeenMs = nowMs;
}

function getRoomIfFresh(
  rooms: Map<string, MultiplayerRoom>,
  roomCode: string,
  nowMs: number,
  ttlMs: number,
): {
  room: MultiplayerRoom | null;
  expired: boolean;
  details?: string;
} {
  const room = rooms.get(roomCode);
  if (!room) {
    return { room: null, expired: false };
  }

  if (isRoomExpired(room, nowMs, ttlMs)) {
    const expiryMinutes = Math.max(1, Math.ceil(ttlMs / 60_000));
    rooms.delete(roomCode);
    return {
      room: null,
      expired: true,
      details: `This room expired after ${expiryMinutes} minute${expiryMinutes === 1 ? '' : 's'} of inactivity.`,
    };
  }

  return { room, expired: false };
}

function refreshDisconnectedState(room: MultiplayerRoom, nowMs: number): void {
  const state = room.engine.getState();

  if (state.match.ended) {
    room.disconnectedPlayerId = null;
    room.pausedAtMs = null;
    room.timeoutAtMs = null;
    state.match.paused = false;
    return;
  }

  const players = [room.players.P1, room.players.P2].filter((p): p is MultiplayerRoomPlayer => Boolean(p));
  for (const player of players) {
    if (player.connected && nowMs - player.lastSeenMs > room.reconnectPauseMs) {
      player.connected = false;
    }
  }

  const disconnectedPlayers = players.filter((player) => !player.connected);
  if (disconnectedPlayers.length === 0) {
    room.disconnectedPlayerId = null;
    room.pausedAtMs = null;
    room.timeoutAtMs = null;
    if (room.started) {
      state.match.paused = false;
    }
    return;
  }

  if (!room.disconnectedPlayerId || room.disconnectedPlayerId === disconnectedPlayers[0]?.id || !room.started) {
    room.disconnectedPlayerId = disconnectedPlayers[0]?.id ?? null;
    if (!room.pausedAtMs) {
      room.pausedAtMs = nowMs;
      room.timeoutAtMs = nowMs + room.reconnectPauseMs;
    } else {
      room.pausedAtMs = room.pausedAtMs ?? nowMs;
      room.timeoutAtMs = room.timeoutAtMs ?? nowMs + room.reconnectPauseMs;
    }
  } else {
    room.disconnectedPlayerId = disconnectedPlayers[0]?.id ?? null;
    room.pausedAtMs = nowMs;
    room.timeoutAtMs = nowMs + room.reconnectPauseMs;
  }

  if (room.started && disconnectedPlayers.length > 0) {
    state.match.paused = true;
  }

  if (room.started && room.timeoutAtMs !== null && nowMs >= room.timeoutAtMs && room.disconnectedPlayerId) {
    room.engine.applyAction(
      {
        type: 'player.forfeit',
        playerId: room.disconnectedPlayerId,
      },
      'PLAYER',
    );
    room.disconnectedPlayerId = null;
    room.pausedAtMs = null;
    room.timeoutAtMs = null;
    state.match.paused = false;
  }
}

function multiplayerRoomPayload(room: MultiplayerRoom, nowMs: number): {
  serverNowMs: number;
  lobby: MultiplayerLobbySnapshot;
  state: GameState | null;
  chat: MultiplayerChatMessage[];
} {
  tickRoom(room, nowMs);
  return {
    serverNowMs: nowMs,
    lobby: toLobbySnapshot(room),
    state: room.started ? room.engine.getState() : null,
    chat: room.chat,
  };
}

function multiplayerMiddleware(env: EnvMap): Plugin {
  const rooms = new Map<string, MultiplayerRoom>();
  const roomTtlMs = Math.max(
    60_000,
    Number.isFinite(Number(env.ICEKING_MULTIPLAYER_ROOM_TTL_MS))
      ? Number(env.ICEKING_MULTIPLAYER_ROOM_TTL_MS)
      : 6 * 60 * 60 * 1000,
  );
  const maxRooms = Math.max(
    10,
    Number.isFinite(Number(env.ICEKING_MULTIPLAYER_MAX_ROOMS))
      ? Number(env.ICEKING_MULTIPLAYER_MAX_ROOMS)
      : 500,
  );
  const maxBodyBytes = Math.max(
    1024,
    Number.isFinite(Number(env.ICEKING_MULTIPLAYER_MAX_BODY_BYTES))
      ? Number(env.ICEKING_MULTIPLAYER_MAX_BODY_BYTES)
      : 256 * 1024,
  );
  const reconnectPauseMs = Math.max(
    5_000,
    Number.isFinite(Number(env.ICEKING_MULTIPLAYER_RECONNECT_PAUSE_MS))
      ? Number(env.ICEKING_MULTIPLAYER_RECONNECT_PAUSE_MS)
      : 90_000,
  );

  const handler = async (req: any, res: any): Promise<void> => {
    try {
      const nowMs = Date.now();

      const method = String(req.method ?? 'GET').toUpperCase();
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = url.pathname;

      if (path === '/create' && method === 'POST') {
        const body = JSON.parse(await readBody(req, maxBodyBytes)) as Record<string, unknown>;
        const playerName = sanitizePlayerName(body.playerName, 'Player 1');
        const configMode = body.configMode === 'DEV_FAST' ? 'DEV_FAST' : 'PROD';
        const preferredRoomCode = normalizeRoomCode(String(body.preferredRoomCode ?? ''));
        const mode = body.mode === 'FRIENDLY' ? 'FRIENDLY' : 'PLAY_ONLINE';

        const roomCode = preferredRoomCode || createUniqueRoomCode(rooms);
        if (!roomCode) {
          jsonResponse(res, 503, { error: 'ROOM_CODE_UNAVAILABLE' });
          return;
        }

        if (rooms.has(roomCode)) {
          jsonResponse(res, 409, { error: 'ROOM_CODE_IN_USE' });
          return;
        }

        if (rooms.size >= maxRooms) {
          jsonResponse(res, 503, { error: 'ROOM_CAPACITY_REACHED' });
          return;
        }

        const hostPlayer: MultiplayerRoomPlayer = {
          id: 'P1',
          name: playerName,
          token: playerToken(),
          ready: false,
          connected: true,
          joinedAtMs: nowMs,
          lastSeenMs: nowMs,
        };

        const engine = new GameEngine({
          configMode,
          botControlMode: 'INTERNAL_HEURISTIC',
          seed: `room-${roomCode}-${nowMs.toString(36)}`,
          players: [
            {
              id: 'P1',
              name: hostPlayer.name,
              color: 'BLUE',
              controller: 'HUMAN',
            },
            {
              id: 'P2',
              name: 'Waiting for player...',
              color: 'RED',
              controller: 'HUMAN',
            },
          ],
          teamByPlayerId: mode === 'FRIENDLY'
            ? {
                P1: 'FRIENDLY',
                P2: 'FRIENDLY',
              }
            : undefined,
        });

        const room: MultiplayerRoom = {
          roomCode,
          configMode,
          mode,
          engine,
          createdAtMs: nowMs,
          updatedAtMs: nowMs,
          lastTickAtMs: nowMs,
          started: false,
          reconnectPauseMs,
          disconnectedPlayerId: null,
          pausedAtMs: null,
          timeoutAtMs: null,
          players: {
            P1: hostPlayer,
            P2: null,
          },
          chat: [],
        };
        syncRoomPresence(room);
        rooms.set(roomCode, room);

        jsonResponse(res, 200, {
          session: {
            roomCode,
            playerId: hostPlayer.id,
            token: hostPlayer.token,
          },
          ...multiplayerRoomPayload(room, nowMs),
        });
        return;
      }

      if (path === '/join' && method === 'POST') {
        const body = JSON.parse(await readBody(req, maxBodyBytes)) as Record<string, unknown>;
        const roomCode = normalizeRoomCode(String(body.roomCode ?? ''));
        const { room, expired, details } = getRoomIfFresh(rooms, roomCode, nowMs, roomTtlMs);
        if (!room) {
          jsonResponse(res, 404, {
            error: expired ? 'ROOM_EXPIRED' : 'ROOM_NOT_FOUND',
            ...(details ? { details } : {}),
          });
          return;
        }

        if (room.players.P2 && room.players.P2.connected) {
          jsonResponse(res, 409, { error: 'ROOM_FULL' });
          return;
        }

        refreshDisconnectedState(room, nowMs);
        const joiner: MultiplayerRoomPlayer = {
          id: 'P2',
          name: sanitizePlayerName(body.playerName, 'Player 2'),
          token: playerToken(),
          ready: false,
          connected: true,
          joinedAtMs: nowMs,
          lastSeenMs: nowMs,
        };

        room.players.P2 = joiner;
        room.disconnectedPlayerId = null;
        room.pausedAtMs = null;
        room.timeoutAtMs = null;
        room.engine.getState().match.paused = false;
        room.updatedAtMs = nowMs;
        syncRoomPresence(room);

        jsonResponse(res, 200, {
          session: {
            roomCode: room.roomCode,
            playerId: joiner.id,
            token: joiner.token,
          },
          ...multiplayerRoomPayload(room, nowMs),
        });
        return;
      }

      if (path === '/ready' && method === 'POST') {
        const body = JSON.parse(await readBody(req, maxBodyBytes)) as Record<string, unknown>;
        const roomCode = normalizeRoomCode(String(body.roomCode ?? ''));
        const { room, expired, details } = getRoomIfFresh(rooms, roomCode, nowMs, roomTtlMs);
        if (!room) {
          jsonResponse(res, 404, {
            error: expired ? 'ROOM_EXPIRED' : 'ROOM_NOT_FOUND',
            ...(details ? { details } : {}),
          });
          return;
        }
        const player = findPlayerByToken(room, String(body.token ?? ''));
        if (!player) {
          jsonResponse(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }

        markPlayerHeartbeat(room, player, nowMs);
        refreshDisconnectedState(room, nowMs);
        if (room.disconnectedPlayerId) {
          jsonResponse(res, 409, buildMatchPausedPayload(room, nowMs));
          return;
        }

        player.ready = Boolean(body.ready);
        room.updatedAtMs = nowMs;
        syncRoomPresence(room);
        jsonResponse(res, 200, multiplayerRoomPayload(room, nowMs));
        return;
      }

      if (path === '/chat' && method === 'POST') {
        const body = JSON.parse(await readBody(req, maxBodyBytes)) as Record<string, unknown>;
        const roomCode = normalizeRoomCode(String(body.roomCode ?? ''));
        const { room, expired, details } = getRoomIfFresh(rooms, roomCode, nowMs, roomTtlMs);
        if (!room) {
          jsonResponse(res, 404, {
            error: expired ? 'ROOM_EXPIRED' : 'ROOM_NOT_FOUND',
            ...(details ? { details } : {}),
          });
          return;
        }

        const player = findPlayerByToken(room, String(body.token ?? ''));
        if (!player) {
          jsonResponse(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }

        const text = sanitizeChatText(body.text);
        if (!text) {
          jsonResponse(res, 400, { error: 'INVALID_CHAT_MESSAGE', details: 'Chat message cannot be empty.' });
          return;
        }

        markPlayerHeartbeat(room, player, nowMs);
        refreshDisconnectedState(room, nowMs);

        const message: MultiplayerChatMessage = {
          id: `${nowMs.toString(36)}_${randomBytes(6).toString('hex')}`,
          playerId: player.id,
          playerName: player.name,
          text,
          sentAtMs: nowMs,
        };
        room.chat.push(message);
        if (room.chat.length > 100) {
          room.chat.splice(0, room.chat.length - 100);
        }
        room.updatedAtMs = nowMs;
        syncRoomPresence(room);
        jsonResponse(res, 200, {
          ...multiplayerRoomPayload(room, nowMs),
          message,
        });
        return;
      }

      if (path === '/start' && method === 'POST') {
        const body = JSON.parse(await readBody(req, maxBodyBytes)) as Record<string, unknown>;
        const roomCode = normalizeRoomCode(String(body.roomCode ?? ''));
        const { room, expired, details } = getRoomIfFresh(rooms, roomCode, nowMs, roomTtlMs);
        if (!room) {
          jsonResponse(res, 404, {
            error: expired ? 'ROOM_EXPIRED' : 'ROOM_NOT_FOUND',
            ...(details ? { details } : {}),
          });
          return;
        }
        const player = findPlayerByToken(room, String(body.token ?? ''));
        if (!player) {
          jsonResponse(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }

        markPlayerHeartbeat(room, player, nowMs);
        refreshDisconnectedState(room, nowMs);
        if (room.disconnectedPlayerId) {
          jsonResponse(res, 409, buildMatchPausedPayload(room, nowMs));
          return;
        }
        if (player.id !== 'P1') {
          jsonResponse(res, 403, { error: 'ONLY_HOST_CAN_START' });
          return;
        }
        if (!room.players.P2) {
          jsonResponse(res, 409, { error: 'PLAYER_TWO_NOT_JOINED' });
          return;
        }
        if (!room.players.P1.ready || !room.players.P2.ready) {
          jsonResponse(res, 409, { error: 'BOTH_PLAYERS_MUST_BE_READY' });
          return;
        }

        room.started = true;
        room.lastTickAtMs = nowMs;
        room.updatedAtMs = nowMs;
        syncRoomPresence(room);
        jsonResponse(res, 200, multiplayerRoomPayload(room, nowMs));
        return;
      }

      if (path === '/state' && method === 'GET') {
        const roomCode = normalizeRoomCode(url.searchParams.get('roomCode') ?? '');
        const token = String(url.searchParams.get('token') ?? '');
        const { room, expired, details } = getRoomIfFresh(rooms, roomCode, nowMs, roomTtlMs);
        if (!room) {
          jsonResponse(res, 404, {
            error: expired ? 'ROOM_EXPIRED' : 'ROOM_NOT_FOUND',
            ...(details ? { details } : {}),
          });
          return;
        }
        const player = findPlayerByToken(room, token);
        if (!player) {
          jsonResponse(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }

        markPlayerHeartbeat(room, player, nowMs);
        refreshDisconnectedState(room, nowMs);
        room.updatedAtMs = nowMs;
        syncRoomPresence(room);
        jsonResponse(res, 200, multiplayerRoomPayload(room, nowMs));
        return;
      }

      if (path === '/action' && method === 'POST') {
        const body = JSON.parse(await readBody(req, maxBodyBytes)) as Record<string, unknown>;
        const roomCode = normalizeRoomCode(String(body.roomCode ?? ''));
        const { room, expired, details } = getRoomIfFresh(rooms, roomCode, nowMs, roomTtlMs);
        if (!room) {
          jsonResponse(res, 404, {
            error: expired ? 'ROOM_EXPIRED' : 'ROOM_NOT_FOUND',
            ...(details ? { details } : {}),
          });
          return;
        }
        const player = findPlayerByToken(room, String(body.token ?? ''));
        if (!player) {
          jsonResponse(res, 401, { error: 'UNAUTHORIZED' });
          return;
        }

        markPlayerHeartbeat(room, player, nowMs);
        refreshDisconnectedState(room, nowMs);
        if (room.disconnectedPlayerId) {
          jsonResponse(res, 409, buildMatchPausedPayload(room, nowMs));
          return;
        }

        if (!room.started) {
          jsonResponse(res, 409, { error: 'MATCH_NOT_STARTED' });
          return;
        }

        tickRoom(room, nowMs);

        const baseAction =
          body.action && typeof body.action === 'object'
            ? (body.action as Record<string, unknown>)
            : {};
        const normalizedAction = {
          ...baseAction,
          playerId: player.id,
        };

        const parsed = GameActionSchema.safeParse(normalizedAction);
        let result: ActionResult;
        if (!parsed.success) {
          result = {
            ok: false,
            code: 'INVALID_ACTION',
            message: 'Action payload failed schema validation.',
          };
        } else {
          result = room.engine.applyAction(parsed.data as GameAction, 'PLAYER');
        }

        room.updatedAtMs = nowMs;
        syncRoomPresence(room);
        jsonResponse(res, 200, {
          ...multiplayerRoomPayload(room, nowMs),
          result,
        });
        return;
      }

      if (['/create', '/join', '/ready', '/start', '/state', '/action', '/chat'].includes(path)) {
        jsonResponse(res, 405, { error: 'METHOD_NOT_ALLOWED' });
        return;
      }

      jsonResponse(res, 404, { error: 'NOT_FOUND' });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      jsonResponse(res, 400, {
        error: 'MULTIPLAYER_HANDLER_ERROR',
        details,
      });
    }
  };

  return {
    name: 'ice-king-multiplayer',
    configureServer(server) {
      server.middlewares.use('/api/multiplayer', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/multiplayer', handler);
    },
  };
}

function openAiBotMiddleware(env: EnvMap): Plugin {
  const requestsByIp = new Map<string, { windowStartMs: number; count: number }>();
  const rateLimitWindowMs = 60_000;
  const maxRequestsPerWindow = Math.max(
    1,
    Number.isFinite(Number(env.ICEKING_BOT_RATE_LIMIT_PER_MIN))
      ? Number(env.ICEKING_BOT_RATE_LIMIT_PER_MIN)
      : 30,
  );
  const maxBodyBytes = Math.max(
    1024,
    Number.isFinite(Number(env.ICEKING_BOT_MAX_BODY_BYTES))
      ? Number(env.ICEKING_BOT_MAX_BODY_BYTES)
      : 512 * 1024,
  );

  function isRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = requestsByIp.get(ip);
    if (!entry || now - entry.windowStartMs >= rateLimitWindowMs) {
      requestsByIp.set(ip, { windowStartMs: now, count: 1 });
      return false;
    }

    entry.count += 1;
    if (entry.count > maxRequestsPerWindow) {
      return true;
    }

    if (requestsByIp.size > 5000) {
      // Bound memory if this endpoint gets scanned.
      requestsByIp.clear();
    }
    return false;
  }

  const handler = async (req: any, res: any): Promise<void> => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    const ip = requestIp(req);
    if (isRateLimited(ip)) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          action: null,
          source: 'unavailable',
          unavailableReason: 'RATE_LIMITED',
          details: `Too many requests (limit ${maxRequestsPerWindow}/min).`,
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
        }),
      );
      return;
    }

    const apiKey = env.OPENAI_API_KEY;
    if (!apiKey) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          action: null,
          source: 'disabled',
          unavailableReason: 'OPENAI_API_KEY_MISSING',
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
        }),
      );
      return;
    }

    try {
      const rawBody = await readBody(req, maxBodyBytes);
      const payload = JSON.parse(rawBody) as BotDecisionPayload;
      if (!Array.isArray(payload.allowedActions)) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'allowedActions must be an array' }));
        return;
      }

      if (payload.allowedActions.length === 0) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            action: null,
            source: 'none',
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
            },
          }),
        );
        return;
      }

      const model = env.ICEKING_BOT_MODEL ?? 'gpt-5-nano';
      const fallbackModels = parseModelFallbacks(env.ICEKING_BOT_MODEL_FALLBACKS);
      const candidateModels = uniqueList([model, ...fallbackModels]);
      const preferredActionIndex =
        typeof payload.preferredActionIndex === 'number' && Number.isInteger(payload.preferredActionIndex)
          ? payload.preferredActionIndex
          : null;
      const indexedActions = payload.allowedActions.map((action, index) => ({
        index,
        intent: actionIntent(action),
        action,
      }));
      const defaultActionIndex =
        preferredActionIndex !== null &&
        preferredActionIndex >= 0 &&
        preferredActionIndex < payload.allowedActions.length
          ? preferredActionIndex
          : 0;
      const prompt = [
        'You are a fair, non-cheating RTS bot for Ice King.',
        'Choose exactly one aggressive legal action index from allowedActions.',
        'Return JSON only, no markdown: {"actionIndex": number|null}.',
        'Never invent actions or fields.',
        'Avoid null: if any action exists, choose an index.',
        'Use null only when allowedActions is empty.',
        'Aggressive priorities:',
        '1) Claim ready pond jobs.',
        '2) Start winter pond harvests.',
        '3) Expand territory, especially train/house/pond access.',
        '4) Build ponds/factories to increase production.',
        '5) Craft refrigerators when unrefrigerated ice is at risk; otherwise craft blue ice.',
        '6) Sell resources only when it improves liquidity or avoids melt risk.',
        `If uncertain, choose index ${defaultActionIndex}.`,
        '',
        `botPlayerId: ${payload.botPlayerId}`,
        `stateSummary: ${JSON.stringify(payload.stateSummary)}`,
        `allowedActions: ${JSON.stringify(indexedActions)}`,
      ].join('\n');

      const timeoutMs = Number(env.ICEKING_BOT_TIMEOUT_MS ?? 6500);
      const maxOutputTokens = Number(env.ICEKING_BOT_MAX_OUTPUT_TOKENS ?? 360);
      let result: ResponsesApiResult | null = null;
      let lastErrorText = '';

      for (const modelCandidate of candidateModels) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const aiResponse = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelCandidate,
            max_output_tokens: maxOutputTokens,
            reasoning: {
              effort: 'minimal',
            },
            text: {
              verbosity: 'low',
              format: {
                type: 'json_schema',
                name: 'ice_king_bot_action_index',
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    actionIndex: {
                      anyOf: [
                        {
                          type: 'integer',
                          minimum: 0,
                          maximum: Math.max(0, payload.allowedActions.length - 1),
                        },
                        {
                          type: 'null',
                        },
                      ],
                    },
                  },
                  required: ['actionIndex'],
                },
              },
            },
            input: [
              {
                role: 'user',
                content: [{ type: 'input_text', text: prompt }],
              },
            ],
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (aiResponse.ok) {
          result = (await aiResponse.json()) as ResponsesApiResult;
          break;
        }

        const errText = await aiResponse.text();
        lastErrorText = errText.slice(0, 500);
        let parsedError: OpenAiErrorPayload | null = null;
        try {
          parsedError = JSON.parse(errText) as OpenAiErrorPayload;
        } catch {
          parsedError = null;
        }

        const code = parsedError?.error?.code ?? '';
        const message = parsedError?.error?.message ?? '';
        const modelMissing =
          code === 'model_not_found' ||
          code === 'invalid_model' ||
          message.toLowerCase().includes('does not exist');

        if (!modelMissing) {
          break;
        }
      }

      if (!result) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            action: null,
            source: 'unavailable',
            unavailableReason: 'OPENAI_REQUEST_FAILED',
            details: lastErrorText,
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
            },
          }),
        );
        return;
      }

      const outputText = extractOutputText(result);
      const usage = extractUsage(result);
      const parsedActionIndex = parseActionIndex(outputText);
      const actionIndex =
        parsedActionIndex !== null &&
        parsedActionIndex >= 0 &&
        parsedActionIndex < payload.allowedActions.length &&
        Number.isInteger(parsedActionIndex)
          ? parsedActionIndex
          : defaultActionIndex;
      const action =
        payload.allowedActions.length > 0
          ? payload.allowedActions[actionIndex]
          : null;
      const source =
        parsedActionIndex !== null &&
        parsedActionIndex >= 0 &&
        parsedActionIndex < payload.allowedActions.length
          ? 'llm'
          : 'llm_defaulted';

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          action,
          source,
          selectedIndex: action ? actionIndex : null,
          usage,
        }),
      );
    } catch (error) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          action: null,
          source: 'unavailable',
          unavailableReason:
            error instanceof Error && error.message === 'REQUEST_BODY_TOO_LARGE'
              ? 'REQUEST_BODY_TOO_LARGE'
              : 'BOT_MIDDLEWARE_ERROR',
          details: error instanceof Error ? error.message : String(error),
          usage: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
          },
        }),
      );
    }
  };

  return {
    name: 'ice-king-openai-bot',
    configureServer(server) {
      server.middlewares.use('/api/bot/decide', handler);
    },
    configurePreviewServer(server) {
      // `vite preview` is what we run on Railway so we need the bot endpoint there too.
      server.middlewares.use('/api/bot/decide', handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  const repoRoot = resolve(__dirname, '../..');
  const env = {
    ...loadEnv(mode, repoRoot, ''),
    ...loadEnv(mode, __dirname, ''),
    ...process.env,
  } as EnvMap;
  const allowedHosts = parseAllowedHosts(env.ICEKING_ALLOWED_HOSTS);

  return {
    plugins: [openAiBotMiddleware(env), multiplayerMiddleware(env)],
    resolve: {
      alias: {
        '@ice-king/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
        '@ice-king/config': resolve(__dirname, '../../packages/config/src/index.ts'),
        '@ice-king/game-core': resolve(__dirname, '../../packages/game-core/src/index.ts'),
        '@ice-king/theme-default': resolve(__dirname, '../../packages/theme-default/src/index.ts'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts,
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts,
    },
  };
});
