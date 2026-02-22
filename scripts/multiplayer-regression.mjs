#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { strict as assert } from 'node:assert';
import process from 'node:process';

const PORT = Number(process.env.ICEKING_TEST_PORT || '5179');
const ROOM_TTL_MS = Number(process.env.ICEKING_TEST_ROOM_TTL_MS || '61000');
const RECONNECT_PAUSE_MS = Number(process.env.ICEKING_TEST_RECONNECT_PAUSE_MS || '5000');
const START_TIMEOUT_MS = 20000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

class MultiplayerApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'MultiplayerApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function spawnServer() {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(
    npmCommand,
    ['run', 'dev', '-w', '@ice-king/client', '--', '--host', '127.0.0.1', '--port', String(PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(PORT),
        ICEKING_MULTIPLAYER_ROOM_TTL_MS: String(ROOM_TTL_MS),
        ICEKING_MULTIPLAYER_RECONNECT_PAUSE_MS: String(RECONNECT_PAUSE_MS),
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  child.unref();

  return child;
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }

    const processGroupId = child.pid;
    let done = false;
    const finalize = () => {
      if (done) {
        return;
      }
      done = true;
      try {
        child.unref?.();
      } catch {
        // Ignore unref errors while shutting down.
      }
      resolve();
    };

    child.once('exit', finalize);
    child.once('error', finalize);

    child.kill('SIGTERM');
    if (processGroupId && process.platform !== 'win32') {
      try {
        process.kill(-processGroupId, 'SIGTERM');
      } catch {
        // Ignore process group teardown failures.
      }
    }
    setTimeout(() => {
      if (!done) {
        try {
          if (processGroupId && process.platform !== 'win32') {
            process.kill(-processGroupId, 'SIGKILL');
          } else {
            child.kill('SIGKILL');
          }
        } catch {
          // Ignore kill errors while forcing process teardown.
        }
        finalize();
      }
    }, 1000);
  });
}

async function waitForServer() {
  const deadline = Date.now() + START_TIMEOUT_MS;
  let lastErr;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL, { method: 'GET' });
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastErr = error;
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for test server: ${String(lastErr ?? 'unknown')}`);
}

function assertMultiplayerError(expectedCode, status, fn) {
  return fn()
    .then(() => {
      throw new Error(`Expected failure code ${expectedCode}`);
    })
    .catch((error) => {
      if (!(error instanceof MultiplayerApiError)) {
        throw error;
      }
      assert.equal(error.code, expectedCode);
      if (status !== null) {
        assert.equal(error.status, status);
      }
    });
}

async function readJsonResponse(response) {
  const raw = await response.text();
  let payload = {};
  if (raw.length > 0) {
    try {
      payload = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Unexpected response payload: ${raw.slice(0, 200)}${raw.length > 200 ? '...' : ''}`);
    }
  }
  return {
    status: response.status,
    payload,
  };
}

async function post(path, body) {
  const response = await fetch(`${BASE_URL}/api/multiplayer${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const { status, payload } = await readJsonResponse(response);
  if (!response.ok) {
    throw new MultiplayerApiError(
      payload.message || `Request failed: ${status}`,
      status,
      payload.error || 'REQUEST_FAILED',
      payload.details,
    );
  }
  return payload;
}

async function get(path, query = {}) {
  const url = new URL(`${BASE_URL}/api/multiplayer${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
  });

  const { status, payload } = await readJsonResponse(response);
  if (!response.ok) {
    throw new MultiplayerApiError(
      payload.message || `Request failed: ${status}`,
      status,
      payload.error || 'REQUEST_FAILED',
      payload.details,
    );
  }
  return payload;
}

function buildAction(playerToken, roomCode, action) {
  return {
    roomCode,
    token: playerToken,
    action,
  };
}

async function main() {
  let child;
  try {
    child = spawnServer();
    await waitForServer();

    const hostResponse = await post('/create', {
      playerName: 'Host CI',
      configMode: 'DEV_FAST',
    });
    const hostSession = hostResponse.session;

    const joinResponse = await post('/join', {
      roomCode: hostSession.roomCode,
      playerName: 'Guest CI',
    });
    const guestSession = joinResponse.session;
    assert.equal(hostSession.playerId, 'P1');
    assert.equal(guestSession.playerId, 'P2');
    assert.equal(joinResponse.lobby.started, false);

    // Guard start gating: action is rejected until host starts the match.
    await assertMultiplayerError('MATCH_NOT_STARTED', 409, () =>
      post('/action', buildAction(hostSession.token, hostSession.roomCode, { type: 'camera.move', x: 1, y: 1 })),
    );

    // Both players must ready up before host can start.
    const hostReady = await post('/ready', {
      roomCode: hostSession.roomCode,
      token: hostSession.token,
      ready: true,
    });
    const guestReady = await post('/ready', {
      roomCode: guestSession.roomCode,
      token: guestSession.token,
      ready: true,
    });
    assert.equal(hostReady.lobby.players.P1.ready, true);
    assert.equal(guestReady.lobby.players.P2.ready, true);

    await assertMultiplayerError('ONLY_HOST_CAN_START', 403, () =>
      post('/start', {
        roomCode: guestSession.roomCode,
        token: guestSession.token,
      }),
    );

    const started = await post('/start', {
      roomCode: hostSession.roomCode,
      token: hostSession.token,
    });
    assert.equal(started.lobby.started, true);
    assert.equal(Boolean(started.state), true);

    const hostAction = await post('/action', buildAction(hostSession.token, hostSession.roomCode, {
      type: 'camera.move',
      x: 2.5,
      y: 3.5,
    }));
    assert.equal(hostAction.result.ok, true);

    const guestAction = await post('/action', buildAction(guestSession.token, guestSession.roomCode, {
      type: 'camera.move',
      x: 1.25,
      y: 1.75,
    }));
    assert.equal(guestAction.result.ok, true);

    await sleep(RECONNECT_PAUSE_MS + 100);
    await assertMultiplayerError('MATCH_PAUSED', 409, () =>
      post('/ready', {
        roomCode: hostSession.roomCode,
        token: hostSession.token,
        ready: true,
      }),
    );

    await get('/state', {
      roomCode: guestSession.roomCode,
      token: guestSession.token,
      playerId: guestSession.playerId,
    });

    const hostReadyAfterReconnect = await post('/ready', {
      roomCode: hostSession.roomCode,
      token: hostSession.token,
      ready: true,
    });
    assert.equal(hostReadyAfterReconnect.lobby.disconnectedPlayerId, null);

    const hostState = await get('/state', {
      roomCode: hostSession.roomCode,
      token: hostSession.token,
      playerId: hostSession.playerId,
    });
    const guestState = await get('/state', {
      roomCode: guestSession.roomCode,
      token: guestSession.token,
      playerId: guestSession.playerId,
    });
    assert.equal(hostState.lobby.started, true);
    assert.equal(guestState.lobby.started, true);

    await sleep(Math.max(ROOM_TTL_MS, 1200) + 300);
    await assertMultiplayerError('ROOM_EXPIRED', 404, () =>
      get('/state', {
        roomCode: hostSession.roomCode,
        token: hostSession.token,
        playerId: hostSession.playerId,
      }),
    );

    console.log('Multiplayer regression flow passed.');
  } finally {
    if (child) {
      await stopServer(child);
    }
  }
}

main().catch((error) => {
  if (error instanceof MultiplayerApiError) {
    console.error(`[multiplayer-regression] ${error.code} (${error.status}) - ${error.message}`);
  } else {
    console.error('[multiplayer-regression]', error);
  }
  process.exit(1);
});
