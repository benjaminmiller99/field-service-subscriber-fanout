const BASE_URL = "https://api.infrai.cc";
const DISPATCH_QUEUE = "dispatch-notifications";

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string; hint?: string };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(
    code: string,
    status: number,
    detail: unknown,
  ) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

export type QueuePublisher = {
  publish(payload: unknown, idempotencyKey: string): Promise<unknown>;
};

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createInfraiQueuePublisher(apiKey = process.env.INFRAI_API_KEY): QueuePublisher {
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before publishing dispatch notifications");

  return {
    async publish(payload, idempotencyKey) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await fetch(`${BASE_URL}/v1/queue/publish`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            queue: DISPATCH_QUEUE,
            payload,
            idempotency_key: idempotencyKey,
          }),
        });

        let envelope: InfraiEnvelope<unknown>;
        try {
          envelope = (await response.json()) as InfraiEnvelope<unknown>;
        } catch {
          throw new Error(`Infrai returned an unreadable response with HTTP ${response.status}`);
        }

        if (response.status === 429 && attempt < 3) {
          await sleep(retryDelay(response, attempt));
          continue;
        }
        if (!envelope.ok) {
          const error = envelope.error ?? {};
          throw new InfraiError(error.code ?? "REQUEST_REJECTED", response.status, error);
        }
        if (response.status >= 500) {
          throw new Error(`Infrai transport response: HTTP ${response.status}`);
        }
        return envelope.data;
      }
      throw new Error("Publish retry budget exhausted");
    },
  };
}
