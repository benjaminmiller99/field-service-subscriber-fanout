import { createServer } from "node:http";
import { ZodError } from "zod";
import { dispatchRequestSchema, fanOutDispatch } from "./dispatch_fanout.js";
import { createInfraiQueuePublisher, InfraiError } from "./infrai_queue.js";

const publisher = createInfraiQueuePublisher();

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/dispatch") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Route not found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = dispatchRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const result = await fanOutDispatch(input, publisher);
    response.writeHead(202, { "content-type": "application/json" });
    response.end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "Invalid dispatch request" }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.code }));
      return;
    }
    response.writeHead(500, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Dispatch could not be queued" }));
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Dispatch route listening on http://localhost:${port}`));
