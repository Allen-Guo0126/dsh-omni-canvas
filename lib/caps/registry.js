/**
 * 能力注册表：一处声明「某个能力用什么 runner、尺寸语义是什么、需要哪些参数」。
 * size: "aspect"（按画布画幅算尺寸）| "native"（不注入尺寸，用产物真实尺寸，如超分）
 */
export const CAPS = {
  "image-t2i": { label: "文生图", kind: "image", runner: "image", size: "aspect", params: ["prompt"] },
  "image-edit": { label: "图片编辑", kind: "image", runner: "image", size: "aspect", params: ["prompt", "refImage"] },
  "image-upscale": { label: "4K 超分", kind: "image", runner: "upscale", size: "native", params: ["refImage"] },
  "video-t2v": { label: "文生视频", kind: "video", runner: "video", size: "aspect", params: ["prompt"] },
  "video-r2v": { label: "参考生视频", kind: "video", runner: "video", size: "aspect", params: ["prompt", "refImage"] },
  "video-i2v": { label: "首帧生视频", kind: "video", runner: "video", size: "aspect", params: ["prompt", "refImage"] },
  "video-fl2v": { label: "首尾帧生视频", kind: "video", runner: "video", size: "aspect", params: ["prompt", "refImage"] },
  "video-talking": { label: "数字人口播", kind: "video", runner: "talking", size: "aspect", params: ["script", "refImage"] },
};

/** 取能力定义（未知能力回退到与类型匹配的默认项） */
export function capOf(capability, fallback = "image-t2i") {
  return CAPS[capability] || CAPS[fallback] || null;
}

/** 尺寸语义：native 表示不按画布画幅注入尺寸 */
export function sizeModeOf(capability, fallback = "image-t2i") {
  return capOf(capability, fallback)?.size || "aspect";
}

/** 该能力是否用「超分」runner（产物另起卡片、不覆盖源卡） */
export function isNativeSized(capability) {
  return sizeModeOf(capability) === "native";
}

/** 全部能力名 */
export function listCaps() {
  return Object.keys(CAPS);
}
