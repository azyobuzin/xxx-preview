// @ts-check

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import fetch, { AbortError } from "node-fetch";
import sharp from "sharp";

const MAX_WIDTH = 600;
const MAX_HEIGHT = 600;

/**
 * @param {string} url
 * @param {string} tmpDir
 * @return {Promise<import("aws-lambda").APIGatewayProxyStructuredResultV2>}
 */
export async function makePreviewForUrl(url, tmpDir) {
  try {
    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), 10000);

    console.log("request %s", url);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "xxx-preview",
        Accept: "image/webp,image/*,video/*",
      },
      redirect: "follow",
      follow: 5,
      signal: controller.signal,
    });

    console.log("response %d %s", res.status, res.statusText);
    clearTimeout(connectTimeout);

    switch (res.status) {
      case 403:
      case 404:
      case 410:
        return {
          statusCode: res.status,
          body: "",
        };
    }

    if (!res.ok) {
      return {
        statusCode: 502,
        body: "",
      };
    }

    const contentType = res.headers.get("Content-Type");
    console.log("response Content-Type: %s", contentType);

    if (
      contentType == null ||
      (!contentType.includes("image/") && !contentType.includes("video/"))
    ) {
      return {
        statusCode: 502,
        headers: {
          "Content-Type": "text/plain",
        },
        body: "the resource is not an image nor a video",
      };
    }

    const downloadTimeout = setTimeout(() => controller.abort(), 60000);
    const downloadPath = tmpDir + "/download";
    await downloadData(res, downloadPath);
    clearTimeout(downloadTimeout);

    const result = await (contentType.includes("video/")
      ? makeVideoPreview(downloadPath)
      : makeImagePreview(downloadPath, contentType));

    const hash = createHash("sha1");
    hash.update(result.content);
    const etag = hash.digest("hex");

    return {
      statusCode: 200,
      headers: {
        "Content-Type": result.contentType,
        ETag: `"${etag}"`,
      },
      isBase64Encoded: true,
      body: result.content.toString("base64"),
    };
  } catch (e) {
    if (e instanceof AbortError) {
      return {
        statusCode: 504,
        headers: {
          "Content-Type": "text/plain",
        },
        body: "",
      };
    }

    throw e;
  }
}

/**
 * @param {import("node-fetch").Response} res
 * @param {string} destPath
 * @return {Promise<void>}
 */
function downloadData(res, destPath) {
  const body = res.body;

  if (body == null) {
    throw TypeError("body is null");
  }

  return new Promise((resolve, reject) => {
    const downloadStream = createWriteStream(destPath, {
      flags: "wx",
    });

    downloadStream.on("finish", () => {
      resolve();
    });

    downloadStream.on("error", (e) => {
      reject(e);
    });

    body.pipe(downloadStream, { end: true });
  });
}

/**
 * @typedef {object} PreviewResult
 * @property {Buffer} content
 * @property {string} contentType
 */

/**
 * @param {string} srcPath The source image file path
 * @param {string} contentType The Content-Type header value of the source
 * @return {Promise<PreviewResult>}
 */
async function makeImagePreview(srcPath, contentType) {
  const img = sharp(srcPath, { animated: true });

  const metadata = await img.metadata();
  console.log("Metadata: %o", metadata);

  if (
    metadata.format === "svg" ||
    metadata.width == null ||
    metadata.height == null ||
    (metadata.width <= MAX_WIDTH && metadata.height <= MAX_HEIGHT)
  ) {
    // サイズ不明 or リサイズ不要
    return { content: await readFile(srcPath), contentType };
  }

  const statPromise = stat(srcPath);

  let specifyWidth = metadata.width / metadata.height >= MAX_WIDTH / MAX_HEIGHT;
  const scale = specifyWidth
    ? MAX_WIDTH / metadata.width
    : MAX_HEIGHT / metadata.height;

  if (metadata.orientation && metadata.orientation >= 5) {
    // rotate で幅と高さが反転する
    specifyWidth = !specifyWidth;
  }

  const content = await img
    .rotate()
    .resize({
      width: specifyWidth ? MAX_WIDTH : undefined,
      height: specifyWidth ? undefined : MAX_HEIGHT,
      withoutEnlargement: true,
    })
    .withMetadata({
      density: metadata.density ? metadata.density * scale : undefined,
    })
    .webp({
      nearLossless: metadata.format === "png",
      loop: metadata.loop,
      delay: metadata.delay,
    })
    .timeout({ seconds: 10 })
    .toBuffer();

  const originalSize = (await statPromise).size;
  console.log(
    "Original %d bytes, Compressed %d bytes",
    originalSize,
    content.length,
  );

  if (originalSize <= content.length) {
    // 圧縮結果のほうが大きい
    return { content: await readFile(srcPath), contentType };
  }

  return { content, contentType: "image/webp" };
}

/**
 * @param {string} srcPath The source video file path
 * @return {Promise<PreviewResult>}
 */
async function makeVideoPreview(srcPath) {
  const destPath = path.normalize(path.join(srcPath, "..", "output.jpg"));

  await promisify(execFile)(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-y",
      "-i",
      srcPath,
      "-vframes",
      "1",
      "-f",
      "mjpeg",
      destPath,
    ],
    {
      timeout: 10000,
    },
  );

  return await makeImagePreview(destPath, "image/jpeg");
}
