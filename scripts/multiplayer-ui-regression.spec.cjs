/* eslint-disable no-promise-executor-return */
const { test, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

const TEST_PORT = Number(process.env.ICEKING_TEST_PORT || '5179');
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let devServer = null;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function spawnDevServer() {
  const child = spawn(
    npmCommand,
    ['run', 'dev', '-w', '@ice-king/client', '--', '--host', '127.0.0.1', '--port', String(TEST_PORT)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
      },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.unref();

  child.stdout?.on('data', () => {});
  child.stderr?.on('data', () => {});
  return child;
}

function stopDevServer() {
  return new Promise((resolve) => {
    if (!devServer || devServer.exitCode !== null) {
      resolve();
      return;
    }

    let done = false;
    const finalize = () => {
      if (done) {
        return;
      }
      done = true;
      try {
        devServer.unref?.();
      } catch {
        // Ignore unref errors during shutdown.
      }
      resolve();
    };

    devServer.once('exit', finalize);
    devServer.once('error', finalize);
    devServer.kill('SIGTERM');
    if (process.platform !== 'win32' && devServer.pid) {
      try {
        process.kill(-devServer.pid, 'SIGTERM');
      } catch {
        // Ignore process group shutdown failures.
      }
    }
    setTimeout(() => {
      if (!done) {
        try {
          if (process.platform !== 'win32' && devServer.pid) {
            process.kill(-devServer.pid, 'SIGKILL');
          } else {
            devServer.kill('SIGKILL');
          }
        } catch {
          // Ignore kill errors while forcing process teardown.
        }
        finalize();
      }
    }, 1000);
  });
}

async function waitForServerReady() {
  const timeoutMs = 20000;
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE_URL);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastErr = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for dev server at ${BASE_URL}: ${String(lastErr ?? 'unknown')}`);
}

async function readLobbyRoomCode(page) {
  const roomCodeText = await page.locator('p').filter({ hasText: /^Room Code:/ }).first().textContent();
  if (!roomCodeText) {
    throw new Error('Room code not found in lobby UI.');
  }
  const match = roomCodeText.match(/Room Code:\s*([A-Z0-9]{6})/);
  if (!match?.[1]) {
    throw new Error(`Could not parse room code from: ${roomCodeText}`);
  }
  return match[1];
}

async function readRenderState(page) {
  const raw = await page.evaluate(() => {
    if (typeof window.render_game_to_text !== 'function') {
      return null;
    }
    return window.render_game_to_text();
  });
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  return JSON.parse(raw);
}

async function joinRoom(page, roomCode) {
  const joinDialogHandled = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Timed out while waiting for Join Game prompt.'));
    }, 5000);
    page.once('dialog', (dialog) => {
      clearTimeout(timeout);
      if (dialog.type() !== 'prompt') {
        reject(new Error(`Unexpected dialog type: ${dialog.type()}`));
        return;
      }
      void dialog.accept(roomCode).then(resolve).catch(reject);
    });
  });
  await page.getByRole('button', { name: 'Join Game' }).click();
  await joinDialogHandled;
}

async function createAccount(page, username, password) {
  await page.locator('input[placeholder="Username"]').fill(username);
  await page.locator('input[placeholder="Password (min 4 chars)"]').fill(password);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('p').filter({ hasText: `Signed in as ${username}.` })).toBeVisible();
}

test.beforeAll(async () => {
  devServer = spawnDevServer();
  await waitForServerReady();
});

test.afterAll(async () => {
  if (devServer) {
    await stopDevServer();
    try {
      await Promise.race([
        once(devServer, 'exit'),
        new Promise((resolve) => {
          setTimeout(resolve, 1500);
        }),
      ]);
    } catch {
      // Ignore shutdown race conditions.
    }
  }
});

test('multiplayer flow: create, join, ready, start, action', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.addInitScript(() => localStorage.clear());
  await guest.addInitScript(() => localStorage.clear());

  try {
    await host.goto(BASE_URL);
    await guest.goto(BASE_URL);

    await createAccount(host, 'Host CI', 'pass1');
    await host.getByRole('button', { name: 'Create Game' }).click();
    await host.getByRole('button', { name: '2: Play Online' }).click();

    await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    const roomCode = await readLobbyRoomCode(host);

    await createAccount(guest, 'Guest CI', 'pass2');

    const joinDialogHandled = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out waiting for Join Game prompt.'));
      }, 5000);
      guest.once('dialog', (dialog) => {
        clearTimeout(timeout);
        if (dialog.type() !== 'prompt') {
          reject(new Error(`Unexpected dialog type: ${dialog.type()}`));
          return;
        }
        void dialog.accept(roomCode).then(resolve).catch(reject);
      });
    });
    await guest.getByRole('button', { name: 'Join Game' }).click();
    await joinDialogHandled;

    await expect(guest.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    const guestCode = await readLobbyRoomCode(guest);
    expect(guestCode).toBe(roomCode);

    await host.getByRole('button', { name: 'Set Ready' }).click();
    await guest.getByRole('button', { name: 'Set Ready' }).click();

    const hostStart = host.getByRole('button', { name: 'Start Match' });
    await expect(hostStart).toBeEnabled();
    await hostStart.click();

    await expect(host.locator('#game-canvas')).toBeVisible();
    await expect(guest.locator('#game-canvas')).toBeVisible();

    const beforeHost = await readRenderState(host);
    if (!beforeHost) {
      throw new Error('render_game_to_text unavailable in host runtime.');
    }

    await host.click('#game-canvas');
    await host.keyboard.down('ArrowRight');
    await host.waitForTimeout(800);
    await host.keyboard.up('ArrowRight');

    await guest.waitForTimeout(600);

    const afterHost = await readRenderState(host);
    if (!afterHost) {
      throw new Error('render_game_to_text unavailable after host action.');
    }
    expect(afterHost.mode).toBe('PLAYING');

    const moved = Math.abs(afterHost.camera.x - beforeHost.camera.x) > 0.005 || Math.abs(afterHost.camera.y - beforeHost.camera.y) > 0.005;
    expect(moved).toBeTruthy();
  } finally {
    await host.close();
    await guest.close();
    await hostContext.close();
    await guestContext.close();
  }
});

test('solo flow: create, ready, start, action', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  await page.addInitScript(() => localStorage.clear());

  try {
    await page.goto(BASE_URL);
    await createAccount(page, 'Solo CI', 'pass1');

    await page.getByRole('button', { name: 'Create Game' }).click();
    await page.getByRole('button', { name: '3: Solo' }).click();

    await expect(page.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    await expect(page.getByText('Mode: Solo')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Match' })).toBeEnabled();

    const startButton = page.getByRole('button', { name: 'Start Match' });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await expect(page.locator('#game-canvas')).toBeVisible();

    const before = await readRenderState(page);
    if (!before) {
      throw new Error('render_game_to_text unavailable in solo runtime.');
    }

    await page.click('#game-canvas');
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(700);
    await page.keyboard.up('ArrowRight');

    const after = await readRenderState(page);
    if (!after) {
      throw new Error('render_game_to_text unavailable after solo input.');
    }

    expect(after.mode).toBe('PLAYING');
    const moved = Math.abs(after.camera.x - before.camera.x) > 0.005;
    expect(moved).toBeTruthy();
  } finally {
    await page.close();
    await context.close();
  }
});

test('friendly flow: create, join, ready, start, action', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.addInitScript(() => localStorage.clear());
  await guest.addInitScript(() => localStorage.clear());

  try {
    await host.goto(BASE_URL);
    await guest.goto(BASE_URL);

    await createAccount(host, 'Friendly Host CI', 'pass1');
    await host.getByRole('button', { name: 'Create Game' }).click();
    await host.getByRole('button', { name: /4: Friendly/ }).click();

    await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    const roomCode = await readLobbyRoomCode(host);

    await createAccount(guest, 'Friendly Guest CI', 'pass2');

    const joinDialogHandled = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out while waiting for Join Game prompt.'));
      }, 5000);
      guest.once('dialog', (dialog) => {
        clearTimeout(timeout);
        if (dialog.type() !== 'prompt') {
          reject(new Error(`Unexpected dialog type: ${dialog.type()}`));
          return;
        }
        void dialog.accept(roomCode).then(resolve).catch(reject);
      });
    });
    await guest.getByRole('button', { name: 'Join Game' }).click();
    await joinDialogHandled;

    await expect(guest.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    const guestCode = await readLobbyRoomCode(guest);
    expect(guestCode).toBe(roomCode);

    await host.getByRole('button', { name: 'Set Ready' }).click();
    await guest.getByRole('button', { name: 'Set Ready' }).click();

    const startButton = host.getByRole('button', { name: 'Start Match' });
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await expect(host.locator('#game-canvas')).toBeVisible();
    await expect(guest.locator('#game-canvas')).toBeVisible();

    const beforeHost = await readRenderState(host);
    if (!beforeHost) {
      throw new Error('render_game_to_text unavailable in friendly host runtime.');
    }

    await host.click('#game-canvas');
    await host.keyboard.down('ArrowRight');
    await host.waitForTimeout(800);
    await host.keyboard.up('ArrowRight');

    await guest.waitForTimeout(600);

    const afterHost = await readRenderState(host);
    if (!afterHost) {
      throw new Error('render_game_to_text unavailable after friendly action.');
    }
    expect(afterHost.mode).toBe('PLAYING');

    const moved = Math.abs(afterHost.camera.x - beforeHost.camera.x) > 0.005 || Math.abs(afterHost.camera.y - beforeHost.camera.y) > 0.005;
    expect(moved).toBeTruthy();
  } finally {
    await host.close();
    await guest.close();
    await hostContext.close();
    await guestContext.close();
  }
});

test('team flow: create, join 3 players, ready, start, action', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestContext1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestContext2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const guestContext3 = await browser.newContext({ viewport: { width: 1280, height: 720 } });

  const host = await hostContext.newPage();
  const guest1 = await guestContext1.newPage();
  const guest2 = await guestContext2.newPage();
  const guest3 = await guestContext3.newPage();

  await host.addInitScript(() => localStorage.clear());
  await guest1.addInitScript(() => localStorage.clear());
  await guest2.addInitScript(() => localStorage.clear());
  await guest3.addInitScript(() => localStorage.clear());

  try {
    await host.goto(BASE_URL);
    await guest1.goto(BASE_URL);
    await guest2.goto(BASE_URL);
    await guest3.goto(BASE_URL);

    await createAccount(host, 'Team Host CI', 'pass1');
    await host.getByRole('button', { name: 'Create Game' }).click();
    await host.getByRole('button', { name: /5: Team/ }).click();

    await expect(host.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    const roomCode = await readLobbyRoomCode(host);

    await createAccount(guest1, 'Team Guest 1', 'pass2');
    await createAccount(guest2, 'Team Guest 2', 'pass3');
    await createAccount(guest3, 'Team Guest 3', 'pass4');

    await joinRoom(guest1, roomCode);
    await expect(guest1.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    const guestCode1 = await readLobbyRoomCode(guest1);
    expect(guestCode1).toBe(roomCode);

    await joinRoom(guest2, roomCode);
    await expect(guest2.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    const guestCode2 = await readLobbyRoomCode(guest2);
    expect(guestCode2).toBe(roomCode);

    await joinRoom(guest3, roomCode);
    await expect(guest3.getByRole('heading', { name: 'Lobby' })).toBeVisible();
    const guestCode3 = await readLobbyRoomCode(guest3);
    expect(guestCode3).toBe(roomCode);

    const hostStart = host.getByRole('button', { name: 'Start Match' });
    await expect(hostStart).toBeDisabled();

    await host.getByRole('button', { name: 'Join Blue' }).click();
    await guest1.getByRole('button', { name: 'Join Blue' }).click();
    await guest2.getByRole('button', { name: 'Join Red' }).click();
    await guest3.getByRole('button', { name: 'Join Red' }).click();

    await host.getByRole('button', { name: 'Set Ready' }).click();
    await guest1.getByRole('button', { name: 'Set Ready' }).click();
    await guest2.getByRole('button', { name: 'Set Ready' }).click();
    await guest3.getByRole('button', { name: 'Set Ready' }).click();

    await expect(hostStart).toBeEnabled();
    await hostStart.click();

    await expect(host.locator('#game-canvas')).toBeVisible();
    await expect(guest1.locator('#game-canvas')).toBeVisible();
    await expect(guest2.locator('#game-canvas')).toBeVisible();
    await expect(guest3.locator('#game-canvas')).toBeVisible();

    const beforeHost = await readRenderState(host);
    if (!beforeHost) {
      throw new Error('render_game_to_text unavailable in team host runtime.');
    }

    expect(beforeHost.mapSize.width).toBe(22);
    expect(beforeHost.mapSize.height).toBe(22);

    await host.click('#game-canvas');
    await host.keyboard.down('ArrowRight');
    await host.waitForTimeout(800);
    await host.keyboard.up('ArrowRight');

    await guest1.waitForTimeout(600);

    const afterHost = await readRenderState(host);
    if (!afterHost) {
      throw new Error('render_game_to_text unavailable after team action.');
    }
    expect(afterHost.mode).toBe('PLAYING');
    const moved = Math.abs(afterHost.camera.x - beforeHost.camera.x) > 0.005 || Math.abs(afterHost.camera.y - beforeHost.camera.y) > 0.005;
    expect(moved).toBeTruthy();
  } finally {
    await host.close();
    await guest1.close();
    await guest2.close();
    await guest3.close();
    await hostContext.close();
    await guestContext1.close();
    await guestContext2.close();
    await guestContext3.close();
  }
});
