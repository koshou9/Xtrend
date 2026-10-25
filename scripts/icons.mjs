import sharp from "sharp";
for (const size of [16, 32, 48, 128])
  await sharp("public/icons/mark.svg")
    .resize(size, size)
    .png()
    .toFile(`public/icons/${size}.png`);
