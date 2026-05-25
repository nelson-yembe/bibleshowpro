#!/usr/bin/env node
/**
 * Dev helper: documents how to fetch public-domain Bible JSON for offline testing.
 * Runtime downloads are handled by the app (Settings → Bible Versions).
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SEED = path.join(ROOT, "database", "seed");

const SOURCES = [
  {
    id: "kjv",
    url: "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json",
    file: "en_kjv.source.json",
  },
  {
    id: "bbe",
    url: "https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_bbe.json",
    file: "en_bbe.source.json",
  },
  {
    id: "lsg",
    url: "https://bible.helloao.org/api/fra_lsg/complete.json",
    file: "fra_lsg.source.json",
  },
];

for (const src of SOURCES) {
  const dest = path.join(SEED, src.file);
  if (fs.existsSync(dest)) {
    console.log(`Skip ${src.id} — ${src.file} already exists`);
    continue;
  }
  console.log(`Downloading ${src.id}…`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`Failed ${src.url}: ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`Saved ${dest}`);
}

console.log("Done. Use Settings → Bible Versions to import into the app.");
