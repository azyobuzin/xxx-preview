// @ts-check

const { makePreviewForUrl } = require("./lib/preview");

const url = process.argv[2];

if (!url) {
  console.error("No argument");
  process.exit(1);
}

require("fs/promises")
  .mkdtemp(require("path").join(require("os").tmpdir(), "xxxpreview-"))
  .then((tmpDir) => makePreviewForUrl(url, tmpDir))
  .then((res) => console.log(res))
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
