// @ts-check

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";

export async function createFixtures() {
  // リサイズ不要の32×24の赤い PNG。
  const image = await sharp({
    create: { width: 32, height: 24, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();

  // 1秒のテストパターン動画。断片化 MP4 にして標準出力へ書き出す。
  const { stdout: video } = await promisify(execFile)(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1280x720:rate=10",
      "-t",
      "1",
      "-an",
      "-c:v",
      "mpeg4",
      "-q:v",
      "5",
      "-movflags",
      "frag_keyframe+empty_moov",
      "-f",
      "mp4",
      "pipe:1",
    ],
    { encoding: null },
  );

  return { image, video };
}
