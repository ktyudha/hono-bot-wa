import { exec } from "child_process";
import fs from "fs/promises";
import sharp from "sharp";
import path from "path";

import crypto from "crypto";

function tmpFile(name: string) {
  return path.join("/tmp", name);
}

export async function compressVideo(inputBase64: string) {
  const id = crypto.randomUUID();
  const inputPath = tmpFile(`${id}-input.mp4`);
  const outputPath = tmpFile(`${id}-output.mp4`);

  try {
    await fs.writeFile(inputPath, Buffer.from(inputBase64, "base64"));

    await new Promise<void>((resolve, reject) => {
      exec(
        `ffmpeg -y -i "${inputPath}" -vcodec libx264 -crf 28 -preset veryfast "${outputPath}"`,
        (err) => (err ? reject(err) : resolve())
      );
    });

    const compressed = await fs.readFile(outputPath);
    return compressed.toString("base64");
  } finally {
    // cleanup wajib
    await fs.unlink(inputPath).catch(() => {});
    await fs.unlink(outputPath).catch(() => {});
  }
}

export async function compressImage(base64: string) {
  const buffer = Buffer.from(base64, "base64");

  const output = await sharp(buffer)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer();

  return output.toString("base64").replace(/\s/g, "");
}
