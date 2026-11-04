/**
 * 尺寸语义：唯一来源。
 * 生成类用 aspect → sizeFor；视频用 VIDEO_ASPECT_SIZE；
 * 放大/超分属于 size: "native"（不套用画幅），由调用方自行决定。
 */

export function sizeFor(aspect, longEdge) {
  const [a, b] = String(aspect || "1:1").split(":").map(Number);
  const A = a > 0 ? a : 1, B = b > 0 ? b : 1;
  const align = (n) => Math.max(256, Math.round(n / 32) * 32);
  // 档位语义 = 短边：横屏时短边是高，竖屏时短边是宽（720p 竖屏 = 720×1280）
  if (A >= B) return [align((longEdge * A) / B), longEdge];
  return [longEdge, align((longEdge * B) / A)];
}

/** 尺寸 → ResolutionSelector 的枚举标签 */
export function widthRatio(w, h) {
  const r = w / Math.max(1, h);
  if (r < 0.62) return { label: "9:16 (Portrait Widescreen)" };
  if (r < 0.85) return { label: "3:4 (Portrait Standard)" };
  if (r < 1.15) return { label: "1:1 (Square)" };
  if (r < 1.5) return { label: "4:3 (Standard)" };
  if (r < 1.95) return { label: "16:9 (Widescreen)" };
  return { label: "21:9 (Ultrawide)" };
}

export const ASPECT_SIZE = {  "1:1": [1024, 1024],
  "16:9": [1152, 648],
  "9:16": [648, 1152],
  "4:3": [1024, 768],
  "3:4": [768, 1024],
  "2K": [2048, 2048],
};

/**
 * 视频尺寸档位（按画幅）。
 *   480p ≈ 0.41MP · 720p ≈ 0.75MP · 1.5mp ≈ 1.5MP（本机推荐档） · 1080p ≈ 2.1MP
 * 1.5MP 换算：16:9 理论 1632×918，短边取 32 的整数倍 → 928（实际 1.51MP）
 */
export const VIDEO_ASPECT_SIZE = {
  "16:9_480p": [848, 480], "16:9_720p": [1152, 648],
  "16:9_1.5mp": [1632, 928], "16:9_1080p": [1920, 1088],
  "16:9": [1152, 648],

  "9:16_480p": [480, 848], "9:16_720p": [648, 1152],
  "9:16_1.5mp": [928, 1632], "9:16_1080p": [1088, 1920],
  "9:16": [648, 1152],

  "1:1_480p": [480, 480], "1:1_720p": [768, 768],
  "1:1_1.5mp": [1248, 1248], "1:1_1080p": [1440, 1440],
  "1:1": [768, 768],
};

/** 视频分辨率档位（前端下拉用，value 与上面的键后缀一致） */
export const VIDEO_RES_OPTIONS = [
  { value: "480p", label: "480p · 0.4MP" },
  { value: "720p", label: "720p · 0.75MP" },
  { value: "1.5mp", label: "1.5MP · ≈1632×918（推荐）" },
  { value: "1080p", label: "1080p · 2.1MP" },
];

