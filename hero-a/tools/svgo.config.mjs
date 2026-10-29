// svgo 3.x：保留 class、<style>、viewBox 和无障碍标题，动效与 CSS 变量都靠它们
export default {
  multipass: true,
  floatPrecision: 1,
  plugins: [
    {
      name: 'preset-default',
      params: {
        overrides: {
          inlineStyles: false,
          cleanupIds: false,
          removeViewBox: false,
          removeTitle: false,
          removeDesc: false,
          removeUnknownsAndDefaults: { keepRoleAttr: true },
          convertPathData: { floatPrecision: 1 },
        },
      },
    },
  ],
};
