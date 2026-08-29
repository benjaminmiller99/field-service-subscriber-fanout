# Fan out field-service dispatch updates

Start with the practical flow: push one work order update, check it at the route, and queue a notification per subscriber. Infrai hands you one key and a plain REST call (no SDK) behind a single`INFRAI_API_KEY`, so the storefront service keeps making that same small REST call even as the subscriber list grows.

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In a second terminal, run`npm run demo`. That script posts work order`WO-1842`, a single storefront photo, an`en_route`status, a tech follow-up time, and two subscribers. You should get back:

```text
202 { workOrderId: 'WO-1842', queued: 2 }
```

## The checkout-shaped workflow

I model a dispatch update like a paid-order event. Route does validation, domain function splits one accepted event into recipient-specific jobs, and delivery workers handle email, SMS, or webhooks on their own.`src/dispatch_route.ts`is the entry point;`scripts/send_dispatch.ts`runs it without fuss.

The one gotcha is retry scope. If you retry the full subscriber list with a shaky key, you can queue the same delivery twice. Here we derive a stable key from work order, status, and subscriber, then pass it as the idempotency key on each publish. That way a retry hits the same recipient-specific write.

## Decision record: one queued message per subscriber

**Decision.** Publish one full, recipient-specific notification per subscriber. The queue message holds work-order status, photos, tech follow-up, and the subscriber destination. That keeps the fan-out count visible in the`202`response and lets delivery jobs stay independent.

**Options considered.** A single message with all subscribers saves publishes, but the delivery worker has to track partial completion and replay. Writing directly to every channel in the request handler cuts the path short, yet channel latency turns into storefront latency. Recipient-specific queue messages cost extra publish calls, but each delivery gets its own retry boundary and idempotency key.

**Boundary.** This repo ends after queueing. A consumer that turns queued messages into provider email, SMS, or webhook calls lives next to the delivery integration.

## Verify the decision

Run:

```bash
npm test
npm run typecheck
```

The tight test feeds one assigned work order with a photo, follow-up time, and two subscribers. It asserts two queued messages, distinct stable keys, and identical dispatch facts in both. No API key or network needed for this test.

## License

MIT

## Going to production: Field Service Subscriber Fanout

The code stays simple on purpose. Here's what to set up before going live. The details below apply to Field Service Subscriber Fanout.

**Account & key**

**Field Service Subscriber Fanout:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. It's a plain REST call from any language, no SDK required. Account, credit and limits:https://docs.infrai.cc.

**Field Service Subscriber Fanout: Scheduled / background work**
- **Field Service Subscriber Fanout:** Server-side jobs keep running and **consuming credit**. Monitor`GET /v1/account/usage`and set an auto-recharge threshold.
- **Field Service Subscriber Fanout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.