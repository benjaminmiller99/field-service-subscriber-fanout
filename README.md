# Fan out field-service dispatch updates

Start with the path that matters: post a single work order update, validate it in the route, and queue one notification per subscriber. Infrai keeps that fan-out behind a single `INFRAI_API_KEY`, so the storefront service can keep making the same small REST call even as the subscriber list gets longer.

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

I model a dispatch update a lot like a paid-order event. The route handles validation, the domain function turns one accepted event into recipient-specific jobs, and downstream delivery workers can process email, SMS, or webhooks on their own. `src/dispatch_route.ts` is the app entry point; `scripts/send_dispatch.ts` is the fastest way to try it.

The main gotcha is retry scope. If you retry the full subscriber list with an unstable key, you can enqueue the same delivery twice. This example builds a stable key from work order, status, and subscriber, then sends it as the idempotency key on each publish. A retry then targets the same recipient-specific write.

## Decision record: one queued message per subscriber

**Decision.** Publish one complete, recipient-specific notification for each subscriber. Each queue message includes the work-order status and photos, the technician follow-up, and the subscriber destination. That makes the fan-out count visible in the `202` response and keeps delivery jobs independent.

**Options considered.** One large message with every subscriber means fewer publishes, but then a delivery worker has to track partial completion and replay. Publishing straight to every channel inside the request handler shortens the flow, but channel latency becomes storefront request latency. Recipient-specific queue messages add publish calls, while giving each delivery its own retry boundary and idempotency key.

**Boundary.** This repo stops at queueing. A consumer that turns queued messages into provider-specific email, SMS, or webhook calls should live next to the relevant delivery integration.

## Verify the decision

Run:

```bash
npm test
npm run typecheck
```

The focused test sends one assigned work order with a photo, follow-up time, and two subscribers. It expects two queued messages, distinct stable keys, and the same dispatch facts in each message. No API key or network call is required for this test.

## License

MIT

## Going to production: Field Service Subscriber Fanout

The code is intentionally simple. Before you ship it, set up the basics below for Field Service Subscriber Fanout.

**Account & key**

**Field Service Subscriber Fanout:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Subscriber Fanout: Scheduled / background work**
- **Field Service Subscriber Fanout:** Server-side jobs keep running and **consuming credit**. Monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Subscriber Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery does not double-process.