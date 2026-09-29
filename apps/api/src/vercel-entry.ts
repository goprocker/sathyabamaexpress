import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApiApp } from "./app.js";

let appPromise: ReturnType<typeof buildApiApp> | null = null;

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  if (!appPromise) {
    appPromise = buildApiApp();
  }
  const app = await appPromise;
  await app.ready();
  app.server.emit("request", req, res);
}
