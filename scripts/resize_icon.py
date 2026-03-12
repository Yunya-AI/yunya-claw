#!/usr/bin/env python3
"""
将应用图标调整为合适尺寸并添加圆角。
输入：public/icon.png（建议 1024x1024）
输出：public/icon.png（256x256，圆角约 12%）
"""
import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    print("请先安装 Pillow: pip install Pillow")
    sys.exit(1)

# 项目根目录（脚本在 scripts/ 下）
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INPUT_PATH = os.path.join(ROOT, "public", "icon.png")
OUTPUT_PATH = os.path.join(ROOT, "public", "icon.png")

# 目标尺寸（应用内展示 256 足够，兼顾清晰度和体积）
SIZE = 256
# 圆角半径（占边长的比例，约 12%）
CORNER_RATIO = 0.12


def add_rounded_corners(img: Image.Image, radius: int) -> Image.Image:
    """为图片添加圆角（透明背景）"""
    mask = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([(0, 0), img.size], radius=radius, fill=255)
    output = Image.new("RGBA", img.size, (0, 0, 0, 0))
    output.paste(img, mask=mask)
    return output


def main():
    if not os.path.exists(INPUT_PATH):
        print(f"错误：找不到输入文件 {INPUT_PATH}")
        sys.exit(1)

    img = Image.open(INPUT_PATH).convert("RGBA")
    w, h = img.size

    # 缩放到目标尺寸
    if (w, h) != (SIZE, SIZE):
        img = img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)

    # 圆角
    radius = int(SIZE * CORNER_RATIO)
    img = add_rounded_corners(img, radius)

    img.save(OUTPUT_PATH, "PNG", optimize=True)
    print(f"已保存: {OUTPUT_PATH} ({SIZE}x{SIZE}, 圆角 {radius}px)")


if __name__ == "__main__":
    main()
