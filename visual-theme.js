/* Original Pickleboard visual contract; shared by DOM, SVG, 3D and asset tools. */
globalThis.PICKLEBOARD_VISUAL = Object.freeze({
  palette: Object.freeze({
    ink: '#263449', navy: '#304762', navyLight: '#526d86', navyDark: '#1c2b40',
    green: '#83bc65', greenLight: '#b7dc88', greenDark: '#42775a',
    orange: '#df8b50', orangeLight: '#f4bf78', orangeDark: '#98563e',
    skin: '#efca9c', skinShade: '#ca9978', shoe: '#f5edd8',
    court: '#4f8f88', courtShade: '#477f7d', courtLight: '#619996', kitchen: '#a7c7aa', surround: '#739b70', path: '#a96750',
    grassDeep: '#4f805c', grassMid: '#6c9868', grassLight: '#8fb876', grassSun: '#a2c381',
    pathShade: '#875444', pathLight: '#c17a5d', parkShadow: '#2f584b',
    parkWood: '#9a674c', parkWoodLight: '#b37a58', parkSign: '#d9c190',
    line: '#fff6db', ball: '#edee73', annotation: '#d4774f', shot: '#ffdb72',
    paper: '#f4f0dc', panel: '#fffbea', border: '#465a68', muted: '#59696e',
    night: '#202f3c', nightPanel: '#2c4050', nightText: '#efe9d4'
  }),
  sprite: Object.freeze({ width: 64, height: 64, anchorX: 32, anchorY: 54, worldWidth: 16 / 3, worldHeight: 16 / 3 }),
  render: Object.freeze({ pixelScale: 1, maxPixelRatio: 3 })
});
if (typeof document !== 'undefined') {
  for (const [name, value] of Object.entries(globalThis.PICKLEBOARD_VISUAL.palette)) {
    document.documentElement.style.setProperty(`--pb-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value);
  }
}
