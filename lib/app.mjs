// @ts-check

import { Hono } from "hono";
import { createHmac } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePreviewForUrl } from "./preview.mjs";

/**
 * @param {{ fetch: typeof globalThis.fetch, secretKey: string }} dependencies
 */
export function createApp({ fetch, secretKey }) {
  return new Hono().get("/proxy/preview/:sig/:url{.+}", async (c) => {
    const sig = c.req.param("sig");
    const encodedUrl = c.req.param("url").split("/")[0];
    const expected = createHmac("sha1", secretKey).update(encodedUrl).digest();

    if (!Buffer.from(sig, "base64url").equals(expected)) {
      return c.text("invalid signature", 404);
    }

    const url = Buffer.from(encodedUrl, "base64url").toString();
    const tmpDir = await mkdtemp(join(tmpdir(), "xxxpreview-"));

    try {
      const result = await makePreviewForUrl(url, tmpDir, fetch);
      const body =
        typeof result.body === "string"
          ? result.body
          : new Uint8Array(result.body);

      return new Response(body, {
        status: result.statusCode,
        headers: result.headers,
      });
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
}
