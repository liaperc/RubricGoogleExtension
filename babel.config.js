export default {
  presets: [
    ['@babel/preset-env', {
      targets: { node: 'current' },
      modules: 'auto' // Let Babel handle module transformation
    }]
  ],
};