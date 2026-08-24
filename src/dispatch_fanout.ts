import { createHash } from "node:crypto";
import { z } from "zod";
import type { QueuePublisher } from "./infrai_queue.js";

export const dispatchRequestSchema = z.object({
  workOrderId: z.string().min(1),
  status: z.enum(["assigned", "en_route", "on_site", "completed"]),
  photoUrls: z.array(z.string().url()).max(12),
  technician: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    followUpBy: z.string().datetime(),
  }),
  subscribers: z.array(z.object({
    id: z.string().min(1),
    channel: z.enum(["email", "sms", "webhook"]),
    destination: z.string().min(1),
  })).min(1).max(1000),
});

export type DispatchRequest = z.infer<typeof dispatchRequestSchema>;

export async function fanOutDispatch(
  input: DispatchRequest,
  publisher: QueuePublisher,
): Promise<{ workOrderId: string; queued: number }> {
  await Promise.all(input.subscribers.map(async (subscriber) => {
    const key = createHash("sha256")
      .update(`${input.workOrderId}:${input.status}:${subscriber.id}`)
      .digest("hex");
    await publisher.publish({
      event: "work_order.dispatch_updated",
      workOrder: {
        id: input.workOrderId,
        status: input.status,
        photos: input.photoUrls,
      },
      technician: input.technician,
      subscriber,
    }, key);
  }));

  return { workOrderId: input.workOrderId, queued: input.subscribers.length };
}
