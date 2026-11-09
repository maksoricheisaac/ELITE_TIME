#!/usr/bin/env node
/**
 * Générateur d'icônes PWA à la demande — PAS exécuté par le build.
 * Usage : node scripts/generate-pwa-icons.mjs
 * Nécessite `sharp` (résolu ici en dépendance transitive). Si l'import
 * échoue, installer temporairement avec `npm i -D sharp`.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC_LOGO = path.join(ROOT, "public", "logo", "logo.png");
const OUT_DIR = path.join(ROOT, "public", "icons");

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const BRAND_BG = "#ffffff";

async function main() {
  let sharp;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    console.error(
      "sharp n'est pas résolvable. Installez-le temporairement avec `npm i -D sharp`, relancez, puis retirez-le si besoin."
    );
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  for (const size of SIZES) {
    const out = path.join(OUT_DIR, `icon-${size}.png`);
    await sharp(SRC_LOGO)
      .resize(size, size, {
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(out);
    console.log("écrit", out);
  }

  {
    const size = 512;
    const logoSize = Math.round(size * 0.8);
    const offset = Math.round((size - logoSize) / 2);
    const logoBuf = await sharp(SRC_LOGO)
      .resize(logoSize, logoSize, { fit: "contain" })
      .toBuffer();
    const out = path.join(OUT_DIR, "icon-512-maskable.png");
    await sharp({
      create: { width: size, height: size, channels: 4, background: BRAND_BG },
    })
      .composite([{ input: logoBuf, left: offset, top: offset }])
      .png()
      .toFile(out);
    console.log("écrit", out);
  }

  {
    const size = 180;
    const logoSize = Math.round(size * 0.8);
    const offset = Math.round((size - logoSize) / 2);
    const logoBuf = await sharp(SRC_LOGO)
      .resize(logoSize, logoSize, { fit: "contain" })
      .toBuffer();
    const out = path.join(OUT_DIR, "apple-touch-icon.png");
    await sharp({
      create: { width: size, height: size, channels: 4, background: BRAND_BG },
    })
      .composite([{ input: logoBuf, left: offset, top: offset }])
      .png()
      .toFile(out);
    console.log("écrit", out);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
