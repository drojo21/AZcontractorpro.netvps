/**
 * photos.mjs — job photos for a contractor's gallery and hero.
 *
 * Ported from AzcontractorproVPs: only a file that decodes as an image is
 * accepted, and the original bytes are never kept. Each upload is
 * auto-rotated, flattened and re-encoded into two JPEGs, and re-encoding drops
 * EXIF — which is what keeps a phone photo from publishing the GPS position of
 * a customer's house.
 *
 *   DATA_DIR/media/<site_id>/<id>-w600.jpg    gallery thumbnail
 *   DATA_DIR/media/<site_id>/<id>-w1600.jpg   hero / full size
 *
 * Publishing copies them into the release, so a release is self-contained.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.mjs";
import { db, nowIso } from "./db.mjs";
import { HttpError } from "./http.mjs";
import { photoFile } from "./sites.mjs";

let sharp = null;
let sharpError = null;
try {
  sharp = (await import("sharp")).default;
} catch (err) {
  sharpError = err;
}

export const imagesAvailable = () => Boolean(sharp);
const FORMATS = new Set(["jpeg", "png", "webp", "gif", "heif", "avif", "tiff"]);

export const cleanCategory = (v) => String(v || "").replace(/\s+/g, " ").trim().slice(0, 60) || "General";
export const cleanName = (v) => String(v || "").replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")
  .replace(/\s+/g, " ").trim().slice(0, 120);

export function listPhotos(siteId) {
  return db().all("SELECT * FROM photos WHERE site_id = ? ORDER BY is_hero DESC, sort_order, uploaded_at", [Number(siteId)])
    .map((p) => ({ ...p, hero: Boolean(p.is_hero) }));
}

export async function addPhoto(siteId, buf, { category, name } = {}) {
  if (!sharp) throw new HttpError(503, `photo uploads are off: sharp did not load (${sharpError?.message || "unknown"})`);
  if (!buf?.length) throw new HttpError(400, "empty upload");
  if (buf.length > config.maxUploadBytes) throw new HttpError(413, `photos must be under ${config.maxUploadBytes / 1048576} MB`);
  const n = db().get("SELECT COUNT(*) AS n FROM photos WHERE site_id = ?", [Number(siteId)]).n;
  if (n >= config.maxPhotosPerSite) throw new HttpError(409, `the gallery is full (${config.maxPhotosPerSite} photos)`);

  let meta;
  try { meta = await sharp(buf, { failOn: "error" }).metadata(); } catch { throw new HttpError(415, "that file is not an image"); }
  if (!FORMATS.has(meta.format)) throw new HttpError(415, `unsupported image type: ${meta.format}`);

  const id = crypto.randomBytes(8).toString("hex");
  fs.mkdirSync(path.dirname(photoFile(siteId, id, 1600)), { recursive: true });
  // .rotate() applies EXIF orientation; the output carries no metadata at all.
  const base = () => sharp(buf, { failOn: "error" }).rotate().flatten({ background: "#ffffff" });
  const full = await base().resize({ width: 1600, withoutEnlargement: true }).jpeg({ quality: 84, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base().resize({ width: 600, height: 450, fit: "cover" }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  fs.writeFileSync(photoFile(siteId, id, 1600), full.data);
  fs.writeFileSync(photoFile(siteId, id, 600), thumb);

  const order = db().get("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM photos WHERE site_id = ?", [Number(siteId)]).n;
  db().run(`INSERT INTO photos (id, site_id, category, name, width, height, bytes, sort_order, uploaded_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, Number(siteId), cleanCategory(category), cleanName(name) || "Project photo",
      full.info.width, full.info.height, full.data.length + thumb.length, order, nowIso()]);
  return db().get("SELECT * FROM photos WHERE id = ?", [id]);
}

export function updatePhoto(siteId, id, { category, name, hero }) {
  const p = db().get("SELECT * FROM photos WHERE site_id = ? AND id = ?", [Number(siteId), String(id)]);
  if (!p) throw new HttpError(404, "no such photo");
  db().tx(() => {
    db().run("UPDATE photos SET category = ?, name = ? WHERE id = ?",
      [category !== undefined ? cleanCategory(category) : p.category, name !== undefined ? (cleanName(name) || "Project photo") : p.name, p.id]);
    if (hero === true) {
      db().run("UPDATE photos SET is_hero = 0 WHERE site_id = ?", [Number(siteId)]);
      db().run("UPDATE photos SET is_hero = 1 WHERE id = ?", [p.id]);
    } else if (hero === false) {
      db().run("UPDATE photos SET is_hero = 0 WHERE id = ?", [p.id]);
    }
  });
  return listPhotos(siteId);
}

export function removePhoto(siteId, id) {
  const p = db().get("SELECT * FROM photos WHERE site_id = ? AND id = ?", [Number(siteId), String(id)]);
  if (!p) throw new HttpError(404, "no such photo");
  db().run("DELETE FROM photos WHERE id = ?", [p.id]);
  for (const w of [600, 1600]) fs.rmSync(photoFile(siteId, p.id, w), { force: true });
  return listPhotos(siteId);
}
