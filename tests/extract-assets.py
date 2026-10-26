#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 write.html 提取内嵌 base64 资源并落盘为 assets/dog/*。

用法：
  python3 tests/extract-assets.py <write.html> <输出目录>
示例：
  python3 tests/extract-assets.py write.html assets/dog
"""
import base64
import os
import re
import sys


SPECS = [
    ("embeddedIdleGif", "image/gif", "idle.gif"),
    ("embeddedFocusMp4", "video/mp4", "focus.mp4"),
    ("embeddedBarkMp4", "video/mp4", "bark.mp4"),
]

MAGIC = {
    "idle.gif": b"GIF8",
    "focus.mp4": b"\x00\x00\x00",
    "bark.mp4": b"\x00\x00\x00",
}


def extract(html_path, out_dir):
    html = open(html_path, "r", encoding="utf-8").read()
    os.makedirs(out_dir, exist_ok=True)
    result = []
    for eid, mime, fname in SPECS:
        # 匹配 <script ... id="eid">…</script>，取中间的非空内容
        pat = re.compile(
            r'<script[^>]*\bid=["\']' + re.escape(eid) + r'["\'][^>]*>(.*?)</script>',
            re.DOTALL,
        )
        m = pat.search(html)
        if not m:
            print(f"  !! 未找到 {eid}", file=sys.stderr)
            result.append((fname, False))
            continue
        b64 = re.sub(r"\s+", "", m.group(1))
        try:
            data = base64.b64decode(b64)
        except Exception as exc:  # noqa: BLE001
            print(f"  !! {eid} base64 解码失败: {exc}", file=sys.stderr)
            result.append((fname, False))
            continue
        magic = MAGIC[fname]
        if not data.startswith(magic):
            print(f"  !! {fname} 魔数不符（期望 {magic!r}，实际 {data[:8]!r}）", file=sys.stderr)
            result.append((fname, False))
            continue
        out = os.path.join(out_dir, fname)
        with open(out, "wb") as f:
            f.write(data)
        print(f"  ✓ {fname}: {len(data)} bytes -> {out}")
        result.append((fname, True))
    return result


def main():
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        sys.exit(2)
    html_path, out_dir = sys.argv[1], sys.argv[2]
    print(f"提取 {html_path} 内嵌资源到 {out_dir}")
    ok = extract(html_path, out_dir)
    if not all(flag for _, flag in ok):
        print("提取未完全成功", file=sys.stderr)
        sys.exit(1)
    print("提取完成")


if __name__ == "__main__":
    main()
