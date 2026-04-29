// Build script: bundles all modules + assets into a single index.html
const fs = require('fs');
const path = require('path');

const here = __dirname;

const three = fs.readFileSync(path.join(here, 'three.module.js'), 'utf8');
let fflate = fs.readFileSync(path.join(here, 'fflate.module.js'), 'utf8');
let nurbsUtils = fs.readFileSync(path.join(here, 'NURBSUtils.js'), 'utf8');
let nurbsCurve = fs.readFileSync(path.join(here, 'NURBSCurve.js'), 'utf8');
let fbxLoader = fs.readFileSync(path.join(here, 'FBXLoader.js'), 'utf8');
let assets = fs.readFileSync(path.join(here, 'assets.js'), 'utf8');
let game = fs.readFileSync(path.join(here, 'game.js'), 'utf8');

// We'll construct each module as a Blob URL with patched imports.
// Strategy: use a tiny module loader inside the page that creates Blob URLs,
// patching `from 'three'` -> threeUrl, etc.

const bootstrap = `
(async () => {
  function makeUrl(code) {
    return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  }

  const threeCode = ${JSON.stringify(three)};
  const threeUrl = makeUrl(threeCode);

  let fflateCode = ${JSON.stringify(fflate)};
  const fflateUrl = makeUrl(fflateCode);

  let nurbsUtilsCode = ${JSON.stringify(nurbsUtils)};
  nurbsUtilsCode = nurbsUtilsCode
    .replace(/from\\s+['"]three['"]/g, 'from "' + threeUrl + '"');
  const nurbsUtilsUrl = makeUrl(nurbsUtilsCode);

  let nurbsCurveCode = ${JSON.stringify(nurbsCurve)};
  nurbsCurveCode = nurbsCurveCode
    .replace(/from\\s+['"]three['"]/g, 'from "' + threeUrl + '"')
    .replace(/from\\s+['"]\\.\\.\\/curves\\/NURBSUtils\\.js['"]/g, 'from "' + nurbsUtilsUrl + '"');
  const nurbsCurveUrl = makeUrl(nurbsCurveCode);

  let fbxCode = ${JSON.stringify(fbxLoader)};
  fbxCode = fbxCode
    .replace(/from\\s+['"]three['"]/g, 'from "' + threeUrl + '"')
    .replace(/from\\s+['"]\\.\\.\\/libs\\/fflate\\.module\\.js['"]/g, 'from "' + fflateUrl + '"')
    .replace(/from\\s+['"]\\.\\.\\/curves\\/NURBSCurve\\.js['"]/g, 'from "' + nurbsCurveUrl + '"');
  const fbxUrl = makeUrl(fbxCode);

  const assetsCode = ${JSON.stringify(assets)};
  const assetsUrl = makeUrl(assetsCode);

  let gameCode = ${JSON.stringify(game)};
  gameCode = gameCode
    .replace(/from\\s+['"]\\.\\/three\\.module\\.js['"]/g, 'from "' + threeUrl + '"')
    .replace(/from\\s+['"]\\.\\/FBXLoader\\.js['"]/g, 'from "' + fbxUrl + '"')
    .replace(/from\\s+['"]\\.\\/assets\\.js['"]/g, 'from "' + assetsUrl + '"');
  const gameUrl = makeUrl(gameCode);

  await import(gameUrl);
})();
`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<title>Train Ride</title>
</head>
<body>
<script>
${bootstrap}
</script>
</body>
</html>`;

const outPath = path.join(__dirname, '..', 'index.html');
fs.writeFileSync(outPath, html);
console.log('Built:', outPath, 'size:', (html.length / 1024).toFixed(1), 'KB');
