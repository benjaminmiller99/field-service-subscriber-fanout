import assert from "node:assert/strict";
import test from "node:test";
import { fanOutDispatch, type DispatchRequest } from "../src/dispatch_fanout.js";

test("queues one independently retryable notification per subscriber", async () => {
  const published: Array<{ payload: any; key: string }> = [];
  const input: DispatchRequest = {
    workOrderId: "WO-1842",
    status: "assigned",
    photoUrls: ["https://images.example.com/work-orders/WO-1842/door.jpg"],
    technician: { id: "tech-27", name: "Maya Chen", followUpBy: "2026-08-22T10:30:00.000Z" },
    subscribers: [
      { id: "store-ops", channel: "email", destination: "ops@example.com" },
      { id: "customer-care", channel: "sms", destination: "+1555010199" },
    ],
  };

  const result = await fanOutDispatch(input, {
    async publish(payload, key) { published.push({ payload, key }); },
  });

  assert.deepEqual(result, { workOrderId: "WO-1842", queued: 2 });
  assert.deepEqual(published.map((item) => item.payload.subscriber.id), ["store-ops", "customer-care"]);
  assert.equal(new Set(published.map((item) => item.key)).size, 2);
  assert.equal(published[0].payload.workOrder.status, "assigned");
  assert.deepEqual(published[0].payload.workOrder.photos, input.photoUrls);
  assert.equal(published[0].payload.technician.followUpBy, input.technician.followUpBy);
});
