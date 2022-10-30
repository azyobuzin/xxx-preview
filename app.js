// @ts-check

const { mkdir, rm } = require("fs/promises");
const { makePreviewForUrl } = require("./lib/preview");

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

  try {
    return await makePreviewForUrl(url, tmpDir);
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
