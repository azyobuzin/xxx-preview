// @ts-check

const { mkdir, rm, readFile } = require("fs/promises");
const path = require("path");
const execFile = require("util").promisify(require("child_process").execFile);

const MAX_WIDTH = 600;
const MAX_HEIGHT = 600;

/**
 * @type {import("aws-lambda").APIGatewayProxyHandlerV2}
 */
exports.handler = async function (event, context) {
  /** @type {string} */
  // @ts-ignore
  const sig = event.pathParameters.sig;

  /** @type {string} */
  // @ts-ignore
  let encodedUrl = event.pathParameters.url;

  const slashIndex = encodedUrl.indexOf("/");
  if (slashIndex > 0) {
    // スラッシュ以降はファイル名のため動作に影響しない
    encodedUrl = encodedUrl.substring(0, slashIndex);
  }

  if (!verifySignature(sig, encodedUrl)) {
    return {
      statusCode: 404,
      headers: {
        "Content-Type": "text/plain",
      },
      body: "invalid signature",
    };
  }

  const url = Buffer.from(encodedUrl, "base64url").toString();

  const tmpDir = `/tmp/${context.awsRequestId}`;
  await mkdir(tmpDir);

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

    const result = await (contentType.includes("image/png")
      ? makePngPreview(downloadPath)
      : contentType.includes("image/")
      ? makeJpegPreview(downloadPath)
      : makeVideoPreview(downloadPath));
    const content = await readFile(result.path);

    return {
      statusCode: 200,
      headers: {
        "Content-Type": result.contentType,
      },
      isBase64Encoded: true,
      body: content.toString("base64"),
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
  } finally {
    await rm(tmpDir, { recursive: true });
  }
};

/**
 * @param {string} sig
 * @param {string} encodedUrl The URL encoded with base64url
 * @return {boolean}
 */
function verifySignature(sig, encodedUrl) {
  const key = /** @type {string} */ (process.env.SECRET_KEY_BASE);
  const hmac = require("crypto").createHmac("sha1", key);
  hmac.update(encodedUrl);
  const buf = hmac.digest();
  return Buffer.from(sig, "base64url").equals(buf);
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
 * @property {string} path
 * @property {string} contentType
 */

/**
 * @param {string} srcPath The source image file path
 * @return {Promise<PreviewResult>}
 */
async function makePngPreview(srcPath) {
  const destPath = path.normalize(path.join(srcPath, "..", "output.png"));

  await execFile(
    "convert",
    [
      srcPath,
      "-resize",
      `${MAX_WIDTH}x${MAX_HEIGHT}>`,
      "-quality",
      "75",
      destPath,
    ],
    {
      timeout: 5000,
    }
  );

  return { path: destPath, contentType: "image/png" };
}

/**
 * @param {string} srcPath The source image file path
 * @return {Promise<PreviewResult>}
 */
async function makeJpegPreview(srcPath) {
  const destPath = path.normalize(path.join(srcPath, "..", "output.jpg"));

  await execFile(
    "convert",
    [
      srcPath,
      "-interlace",
      "JPEG",
      "-resize",
      `${MAX_WIDTH}x${MAX_HEIGHT}>`,
      "-quality",
      "85",
      destPath,
    ],
    {
      timeout: 5000,
    }
  );

  return { path: destPath, contentType: "image/jpeg" };
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

  return { path: destPath, contentType: "image/jpeg" };
}
