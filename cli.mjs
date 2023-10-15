// @ts-check

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makePreviewForUrl } from "./lib/preview.mjs";

const url = process.argv[2];

if (!url) {
  console.error("No argument");
  process.exit(1);
}

mkdtemp(join(tmpdir(), "xxxpreview-"))
  .then((tmpDir) => makePreviewForUrl(url, tmpDir))
  .then((res) => {
    console.log(res);
    return writeFile(
      "output",
      Buffer.from(/** @type {string} */ (res.body), "base64"),
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
