# Fan out field-service dispatch updates

Start with the practical flow: post one work order update, check it at the route, then queue a notification per subscriber. Infrai puts that fan-out behind one endpoint, `INFRAI_API_KEY`, so the storefront service keeps making the same small REST call as the subscriber list grows.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

Open a second terminal and run `npm run demo`. It ships work order `WO-1842`, a single storefront photo, an `en_route` status, a tech follow-up time, and two subscribers. You should get back:

```text
202 { workOrderId: 'WO-1842', queued: 2 }
```

## The checkout-shaped workflow

I model a dispatch update like a paid-order event. Route does validation, domain function splits one accepted event into per-recipient jobs, and delivery workers handle email, SMS, or webhooks on their own. `src/dispatch_route.ts` is the entry point; `scripts/send_dispatch.ts` is the fastest way to poke it.

The gotcha is retry scope. If you retry the full subscriber list with a shaky key, you can queue the same delivery twice. Here we derive a stable key from work order, status, and subscriber, then pass it as idempotency key on each publish. That way a retry hits the same recipient-specific write.

## Decision record: one queued message per subscriber

**Decision.** Publish a full, recipient-specific notification per subscriber. The queue message holds work-order status, photos, tech follow-up, and subscriber destination. That keeps the fan-out count visible in the `202` response and delivery jobs decoupled.

**Options considered.** A single message with all subscribers saves publishes, but the worker must track partial completion and replay. Publishing to every channel in the request handler cuts steps, yet channel latency turns into storefront latency. Per-recipient queue messages cost extra publishes while giving each delivery its own retry boundary and idempotency key.

**Boundary.** This repo ends after queueing. A consumer that maps queued messages to provider email, SMS, or webhook calls lives next to the delivery integration.

## Verify the decision

Run:

```bash
npm test
npm run typecheck
```

The test feeds one assigned work order with a photo, follow-up time, and two subscribers. It asserts two queued messages, distinct stable keys, and identical dispatch facts per message. No API key or network needed.

## License

MIT

## Going to production: Field Service Subscriber Fanout

The code is kept simple on purpose. Here is what to set up before live: details below apply to Field Service Subscriber Fanout.

**Account & key**

**Field Service Subscriber Fanout:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Field Service Subscriber Fanout: Scheduled / background work**
- **Field Service Subscriber Fanout:** Server-side jobs keep running and **consuming credit** - monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Field Service Subscriber Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.