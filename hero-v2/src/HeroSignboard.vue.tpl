<!--
  HeroSignboard：首页招牌 v2（牌匾“咸鱼把脉了”、标语、插画和约 8 秒的动效），规格见 hero-v2/README.md。
  由 hero-v2/tools/build.py 从 src/ 生成，不要手改；改了动效、道具或版式后重新运行 build.py。

  用法：把 HeroSignboard.vue、anchors.json 和 img/ 一起拷进同一个组件目录，然后 <HeroSignboard />。
  锚点直接 import anchors.json，调好锚点只要替换 anchors.json，不用重新生成组件。

  动效播一次停在“把脉后”，点录音笔重播；招牌滚出视口时暂停，滚回来接着播。
  系统设置了减少动态效果，或屏幕不宽于 820px（bamai10 的手机断点）：直接显示 hero-static，不播动画（<picture> 按媒体查询换图）。
  依赖：全局已加载霞鹜文楷；颜色读 --paper --sheet --line --ink --ink-2 --ink-3 --indigo --indigo-2 --gold --brass --wood --cinnabar 和 --kai，
  未定义时用设计稿的值。样式不加 scoped：选择器都带 hero- / fx- 前缀。
-->
<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import anchors from './anchors.json'
{{IMPORTS}}

const stage = ref(null)
let motion = null
onMounted(() => { motion = createHeroMotion(stage.value, anchors) })
onBeforeUnmount(() => { if (motion) motion.destroy() })

{{MOTION}}
</script>

<template>
{{MARKUP}}
</template>

<style>
{{CSS}}
</style>
