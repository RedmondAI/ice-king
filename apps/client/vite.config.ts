import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolve } from 'node:path';

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
    plugins: [openAiBotMiddleware(env)],
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
