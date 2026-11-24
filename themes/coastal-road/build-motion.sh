#!/bin/sh
# 重新打包 coastal-road 动效模块链为经典脚本。
# 背景：Chromium 在 file:// 协议下有两道拦截——
#   1) <script type="module">（ES 模块）整个无法加载；
#   2) 本地图片会污染 WebGL 纹理（SecurityError），无法上传。
# 动效链（motion.js → motion-model.js / coastal-scene.js → vendor/three）全是模块，
# 四张纹理在构建时内联成 data URI 规避污染：
#   三个 RGB 纹理转 JPEG、roadside-atlas（带 alpha）转 WebP，8MB → ~0.8MB。
# 修改 motion.js / motion-model.js / scene-model.js / coastal-scene.js 后必须重跑本脚本，
# 并把 index.html 里 motion-bundle.js 的版本号 +1。
# 注意：coastal-scene.js 静态 import 了纹理文件，源码只能在打包后运行。
set -e
cd "$(dirname "$0")"

# 1) 生成压缩纹理变体（原 PNG 保留：页面预览、下载链接、静态壁纸还在用）
PY=/Users/moomin/.workbuddy/binaries/python/envs/default/bin/python
[ -x "$PY" ] || PY=python3
"$PY" - <<'EOF'
from PIL import Image
import os
d = os.path.join(os.path.dirname(os.path.abspath('build-motion.sh')), 'assets') + os.sep
jobs = [
    ('first-frame.png',    'first-frame.texture.jpg',    'JPEG', dict(quality=82, optimize=True)),
    ('distant-plate.png',  'distant-plate.texture.jpg',  'JPEG', dict(quality=82, optimize=True)),
    ('field-texture.png',  'field-texture.texture.jpg',  'JPEG', dict(quality=80, optimize=True)),
    ('roadside-atlas.png', 'roadside-atlas.texture.webp', 'WEBP', dict(quality=85, method=6)),
]
for src, dst, fmt, kw in jobs:
    im = Image.open(d + src)
    if fmt == 'JPEG':
        im = im.convert('RGB')
    im.save(d + dst, fmt, **kw)
    print(dst, im.size, os.path.getsize(d + dst) // 1024, 'KB')
EOF

# 2) 打包（纹理以 data URI 内联）
npx --yes esbuild motion.js --bundle --format=iife \
  --loader:.png=dataurl --loader:.jpg=dataurl --loader:.webp=dataurl \
  --outfile=motion-bundle.js
echo "done: motion-bundle.js rebuilt"
