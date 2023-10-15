// @ts-check

const { writeFile } = require("fs/promises");
const { makePreviewForUrl } = require("./lib/preview");

const url = process.argv[2];

if (!url) {
  console.error("No argument");
  process.exit(1);
}

require("fs/promises")
  .mkdtemp(require("path").join(require("os").tmpdir(), "xxxpreview-"))
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
