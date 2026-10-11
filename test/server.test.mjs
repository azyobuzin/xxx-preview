// @ts-check

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import sharp from "sharp";
import { createApp } from "../lib/app.mjs";
import { createFixtures } from "../test-support/fixtures.mjs";

const secretKey = "preview-test-key";

// テスト素材はメモリ上に一度生成し、各テストの取得用 fetch に渡す。
const { image, video } = await createFixtures();

/** @param {string} url */
function signedParams(url) {
  const encodedUrl = Buffer.from(url).toString("base64url");
  const sig = createHmac("sha1", secretKey)
    .update(encodedUrl)
    .digest("base64url");
  return { sig, url: encodedUrl };
}

test("画像の正常系: 元の PNG と Content-Type を返す", async () => {
  // 外部取得だけを置き換え、署名検証とプレビュー処理は実行する。
  const app = createApp({
    secretKey,
    fetch: async () =>
      new Response(new Uint8Array(image), {
        headers: { "Content-Type": "image/png" },
      }),
  });
  const { sig, url } = signedParams("https://example.test/image.png");
  const res = await app.request(`/proxy/preview/${sig}/${url}`);
  const body = Buffer.from(await res.arrayBuffer());

  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Content-Type"), "image/png");
  assert.deepEqual(body, image);
});

test("動画の正常系: MP4 からデコード可能な画像を返す", async () => {
  // 取得した MP4 を、実際の ffmpeg・sharp で変換する。
  const app = createApp({
    secretKey,
    fetch: async () =>
      new Response(new Uint8Array(video), {
        headers: { "Content-Type": "video/mp4" },
      }),
  });
  const { sig, url } = signedParams("https://example.test/video.mp4");
  const res = await app.request(`/proxy/preview/${sig}/${url}`);
  const body = Buffer.from(await res.arrayBuffer());

  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type") ?? "", /^image\//);
  assert.ok((await sharp(body).raw().toBuffer()).length > 0);
});

test("不正署名: 外部取得せず 404 を返す", async (t) => {
  const fetchMock = t.mock.fn(async () => {
    throw new Error("不正署名では fetch が呼ばれてはいけない");
  });
  const app = createApp({ fetch: fetchMock, secretKey });
  const { url } = signedParams("https://example.test/image.png");
  const res = await app.request(`/proxy/preview/invalid/${url}`);

  assert.equal(res.status, 404);
  assert.equal(await res.text(), "invalid signature");
  assert.equal(fetchMock.mock.callCount(), 0);
});
