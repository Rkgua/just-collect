const fs = require('node:fs/promises');
const path = require('node:path');
const {
  generateImageAsync,
  generateImageBackgroundAsync,
  compositeImagesAsync,
} = require('@expo/image-utils');
const { setIconAsync } = require('@expo/prebuild-config/build/plugins/icons/withAndroidIcons');

// Mechanical packaging only: preserve the supplied logo, center it and resize for platform icons.
async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const assets = path.join(projectRoot, 'assets');
  const src = path.join(assets, 'logo.png');
  const options = { projectRoot, cacheType: 'just-collect-brand' };
  for (const [name, size, markSize, backgroundColor] of [
    ['icon.png', 1024, 660, '#FFFFFF'],
    ['adaptive-icon.png', 1080, 540, 'transparent'],
  ]) {
    const { source: foreground } = await generateImageAsync(options, {
      src,
      width: markSize,
      height: markSize,
      resizeMode: 'contain',
      backgroundColor: 'transparent',
    });
    const background = await generateImageBackgroundAsync({
      width: size,
      height: size,
      backgroundColor,
      resizeMode: 'contain',
    });
    const icon = await compositeImagesAsync({
      foreground,
      background,
      x: (size - markSize) / 2,
      y: (size - markSize) / 2,
    });
    await fs.writeFile(path.join(assets, name), icon);
  }
  const res = path.join(projectRoot, 'android/app/src/main/res');
  if (
    await fs.stat(res).then(
      () => true,
      () => false,
    )
  ) {
    await setIconAsync(projectRoot, {
      icon: path.join(assets, 'icon.png'),
      foregroundImage: path.join(assets, 'adaptive-icon.png'),
      monochromeImage: path.join(assets, 'adaptive-icon.png'),
      backgroundColor: '#FFFFFF',
      isAdaptive: true,
    });
    const colorsPath = path.join(res, 'values/colors.xml');
    const colors = (await fs.readFile(colorsPath, 'utf8')).replace(
      /\s*<color name="iconBackground">.*?<\/color>/g,
      '',
    );
    await fs.writeFile(
      colorsPath,
      colors.replace(
        '</resources>',
        '  <color name="iconBackground">#FFFFFF</color>\n</resources>',
      ),
    );
  }
  console.log('just-collect icons generated from assets/logo.png');
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
