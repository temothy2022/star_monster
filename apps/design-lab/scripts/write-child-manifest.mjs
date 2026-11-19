import { readFileSync, writeFileSync } from "node:fs";

const manifestPath = new URL("../dist/manifest.webmanifest", import.meta.url);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.id = "/child/";
manifest.start_url = "/child/#login";
manifest.scope = "/child/";
manifest.icons = manifest.icons.map((icon) => ({
  ...icon,
  src: icon.src.replace(/^\/icons\//, "/child/icons/"),
}));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
