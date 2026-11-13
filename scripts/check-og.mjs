// Checks the social-preview images in a build (`npm run check:og`, after
// `npm run build`): that the frame is drawn the way it is meant to be.
//
// They are drawn by satori from src/utils/og-templates/, and a satori
// upgrade once painted the grey shadow card over the title without any
// error. Nothing else looks at these images, so this does: three things
// that are true of a good image and were false of that one.
import { readdirSync, existsSync } from "node:fs";
import sharp from "sharp";

const DIST = process.argv[2] ?? "dist";
const files = [
  "og.png",
  ...readdirSync(`${DIST}/posts`)
    .map(dir => `posts/${dir}/index.png`)
    .filter(file => existsSync(`${DIST}/${file}`)),
];

/** Colours, as [r, g, b]. */
const CARD = [254, 251, 251];
const SHADOW = [238, 237, 237]; // #ecebeb at 90% over the background
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 6);

let failed = 0;
for (const file of files) {
  const { data, info } = await sharp(`${DIST}/${file}`)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  let dark = 0;
  for (let y = 80; y < 550; y++) {
    for (let x = 90; x < 1110; x++) if (at(x, y)[0] < 90) dark++;
  }
  const problems = [];
  if (info.width !== 1200 || info.height !== 630) {
    problems.push(`is ${info.width}x${info.height}, not 1200x630`);
  }
  // Just inside the front card's top edge, above any text.
  if (!close(at(600, 76), CARD)) {
    problems.push(`the card isn't on top: (600, 76) is ${at(600, 76)}`);
  }
  // The strip of shadow that shows to the card's right.
  if (!close(at(1144, 300), SHADOW)) {
    problems.push(`no shadow to the right: (1144, 300) is ${at(1144, 300)}`);
  }
  // Text in full black: a title under the shadow is grey.
  if (dark < 2000) problems.push(`only ${dark} dark pixels of text`);
  if (problems.length > 0) {
    failed++;
    console.error(`check-og: ${file}: ${problems.join("; ")}`);
  }
}
if (failed > 0) process.exit(1);
console.log(`check-og: ${files.length} images are framed as intended`);
