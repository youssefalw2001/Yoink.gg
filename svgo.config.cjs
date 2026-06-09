// SVGO config — run with: npx svgo -r -i public/ -o public/
module.exports = {
  multipass: true,
  plugins: [
    { name: "preset-default", params: { overrides: {
      removeViewBox: false,       // keep viewBox for responsive scaling
      inlineStyles: { onlyMatchedOnce: false },
    }}},
    { name: "removeComments" },
    { name: "removeEmptyAttrs" },
    { name: "collapseGroups" },
    { name: "mergePaths" },
    { name: "convertShapeToPath" },
    { name: "sortAttrs" },
    { name: "removeScriptElement" },
  ],
};
