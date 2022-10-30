// @ts-check

const { readFile, stat } = require("fs/promises");
const path = require("path");
const execFile = require("util").promisify(require("child_process").execFile);
const sharp = require("sharp");

const MAX_WIDTH = 600;
const MAX_HEIGHT = 600;

/**
 * @param {string} url
 * @param {string} tmpDir
 * @return {Promise<import("aws-lambda").APIGatewayProxyResultV2>}
 */
async function makePreviewForUrl(url, tmpDir) {
  const { default: fetch, AbortError } = await import("node-fetch");

  try {
    const controller = new AbortController();
    const connectTimeout = setTimeout(() => controller.abort(), 10000);

    console.log("request %s", url);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "xxx-preview",
        Accept: "image/*, video/*",
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

    return {
      statusCode: 200,
      headers: {
        "Content-Type": result.contentType,
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
    const { createWriteStream } = require("fs");
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

  const specifyWidth =
    metadata.width / metadata.height >= MAX_WIDTH / MAX_HEIGHT;
  const scale = specifyWidth
    ? MAX_WIDTH / metadata.width
    : MAX_HEIGHT / metadata.height;

  const content = await img
    .resize({
      width: specifyWidth ? MAX_WIDTH : undefined,
      height: specifyWidth ? undefined : MAX_HEIGHT,
      withoutEnlargement: true,
    })
    .withMetadata({
      orientation: metadata.orientation,
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
    content.length
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

  await execFile(
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
    }
  );

  return await makeImagePreview(destPath, "image/jpeg");
}

exports.makePreviewForUrl = makePreviewForUrl;
