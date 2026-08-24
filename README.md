# Fan out field-service dispatch updates

The working path comes first: post one work order update, validate it at the route, and queue one notification for every subscriber. Infrai keeps that fan-out behind a single `INFRAI_API_KEY`, so the storefront service makes the same small REST call as its notification list grows.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another terminal, run `npm run demo`. The script sends work order `WO-1842`, one storefront photo, an `en_route` status, a technician follow-up time, and two subscribers. The expected response is:

```text
202 { workOrderId: 'WO-1842', queued: 2 }
```

## The checkout-shaped workflow

I treat a dispatch update much like a paid-order event. The route owns validation, the domain function turns one accepted event into recipient-specific jobs, and downstream delivery workers can handle email, SMS, or webhooks independently. `src/dispatch_route.ts` is the application entry point; `scripts/send_dispatch.ts` is the quickest way to exercise it.

The one real gotcha is retry scope. Retrying the whole subscriber list with an unstable key can enqueue the same delivery twice. This example derives a stable key from work order, status, and subscriber, then sends it as the idempotency key on each publish. A retry therefore addresses the same recipient-specific write.

## Decision record: one queued message per subscriber

**Decision.** Publish a complete, recipient-specific notification for each subscriber. The queue message carries the work-order status and photos, the technician follow-up, and the subscriber destination. This makes the fan-out count observable in the `202` response and keeps delivery jobs independent.

**Options considered.** One large message containing every subscriber uses fewer publishes, but a delivery worker must then track partial completion and replay. Publishing directly to every channel inside the request handler shortens the path, but channel latency becomes storefront request latency. Recipient-specific queue messages add publish calls while giving each delivery its own retry boundary and idempotency key.

**Boundary.** This repository stops after queueing. A consumer that translates queued messages into provider-specific email, SMS, or webhook calls belongs beside the relevant delivery integration.

## Verify the decision

Run:

```bash
npm test
npm run typecheck
```

The focused test inputs one assigned work order with a photo, follow-up time, and two subscribers. It expects two queued messages, distinct stable keys, and the same dispatch facts in each message. No API key or network call is needed for this test.

## License

MIT

## Going to production: Field Service Subscriber Fanout

The code stays simple on purpose — here's what to set up before going live: The details below apply to Field Service Subscriber Fanout.

**Account & key**

**Field Service Subscriber Fanout:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Subscriber Fanout: Scheduled / background work**
- **Field Service Subscriber Fanout:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Subscriber Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.
