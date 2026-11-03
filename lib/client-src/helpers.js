/* 工厂内共用常量与纯函数（构建时内联） */
module.exports = (() => {
const CLIENT_LOADED_AT = Date.now();

function report(msg) {
	try {
		fetch("/omni-canvas/api/clientlog", {
			method: "POST", headers: { "content-type": "application/json" },
			body: JSON.stringify({ msg }),
		}).catch(() => {});
	} catch {}
}

async function api(method, body) {
	const res = await fetch(`/omni-canvas/api/${method}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body || {}),
	});
	const json = await res.json().catch(() => ({ ok: false, error: "bad response" }));
	if (!json.ok) throw new Error(json.error || "request failed");
	return json.result;
}

const MODELS = [
	{ id: "qwen-t2i-fast", label: "Qwen 加速" },
	{ id: "qwen-t2i-hq", label: "Qwen 高清" },
];
const ASPECTS = ["1:1", "16:9", "9:16", "3:4", "4:3"];
const COUNTS = [1, 2, 3, 4];
const RESOLUTIONS = ["1K", "2K"];

/** 卡片尺寸：宽度固定，高度按生成图/选择比例换算。 */
const cardSize = (n) => {
	const w = 320;
	const dw = n.data?.width, dh = n.data?.height;
	if (dw && dh) return { w, h: Math.max(200, Math.round(w * dh / dw)) };
	const a = n.data?.aspect || "1:1";
	const [x, y] = a.split(":").map(Number);
	const ratio = x > 0 && y > 0 ? y / x : 1;
	return { w, h: Math.round(w * ratio) };
};

const makeAudioNode = (x, y) => ({
	id: `n-${Date.now().toString(36)}`,
	type: "audio", x, y, w: 320, h: 120,
	data: { title: "音频", file: "", prompt: "" },
});

const makeTextNode = (x, y) => ({
	id: `n-${Date.now().toString(36)}`,
	type: "text", x, y, w: 420, h: 300,
	data: { title: "文本节点", content: "" },
});

const SCRIPT_COLUMNS = [
	{ key: "shot", title: "镜号", w: 54 },
	{ key: "dur", title: "时长", w: 52 },
	{ key: "size", title: "景别", w: 84 },
	{ key: "move", title: "运镜", w: 72 },
	{ key: "desc", title: "画面描述", w: 220 },
	{ key: "light", title: "光影氛围", w: 140 },
	{ key: "line", title: "台词", w: 120 },
	{ key: "sound", title: "音效", w: 130 },
	{ key: "assets", title: "资产（角色/场景/道具）", w: 220 },
	{ key: "prompt", title: "提示词", w: 130 },
];

const SCRIPT_W = 1180;

const ROLE_LABEL = { character: "角色", scene: "场景", prop: "道具" };
const nextRole = (role) => (role === "character" ? "scene" : role === "scene" ? "prop" : "character");


/** 资产名：显式名字 > 提示词首句截断 */
const assetName = (n) => {
	if (n.data?.name) return n.data.name;
	const p = String(n.data?.prompt || "").trim();
	if (!p) return "未命名";
	const first = p.split(/[，。,.\n]/)[0];
	return first.length > 14 ? `${first.slice(0, 14)}…` : first;
};

/** 资产描述：显式描述 > 生成提示词 */
const assetDesc = (n) => (n.data?.desc || n.data?.prompt || "").trim();

/** 从节点标题/提示词推断资产角色 */
const inferRole = (n) => {
	if (n.data?.role) return n.data.role;
	const t = `${n.data?.title || ""} ${n.data?.prompt || ""}`.toLowerCase();
	if (/角色|人物|肖像|character|portrait/.test(t)) return "character";
	if (/场景|环境|背景|scene|environment/.test(t)) return "scene";
	if (/道具|物品|产品|prop|product/.test(t)) return "prop";
	return "character";
};

const makeScriptNode = (x, y) => ({
	id: `n-${Date.now().toString(36)}`,
	type: "script", x, y, w: SCRIPT_W, h: 320,
	data: {
		title: "分镜脚本",
		target: "video",
		columns: JSON.parse(JSON.stringify(SCRIPT_COLUMNS)),
		groups: [{
			id: `g-${Date.now().toString(36)}`,
			title: "场 1",
			scene: "",
			light: "",
			sound: "",
			rows: [{
				id: `r-${Date.now().toString(36)}`,
				cells: { shot: "S01", dur: "6", size: "中景", move: "固定", desc: "", light: "", line: "", sound: "", prompt: "" },
			}],
		}],
	},
});

/** 一行 → H3 六段式提示词 */
const composeRowPrompt = (group, row, index, assets = []) => {
	const c = row.cells || {};
	const desc = (c.desc || "").trim();
	const line = (c.line || "").trim();
	const sound = (c.sound || "").trim() || (group.sound || "").trim();
	const light = (c.light || "").trim() || (group.light || "").trim();
	const scene = (group.scene || "").trim();
	const parts = [];
	parts.push("subject_definitions:");
	if (assets.length) {
		assets.forEach((a, i) => {
			const role = a.role === "scene" ? "the environment" : a.role === "prop" ? "a prop" : "the subject";
			const desc = (a.desc || "").replace(/\s+/g, " ").slice(0, 160);
			parts.push(`<Picture ${i + 1}> is ${role}「${a.name}」${desc ? `：${desc}` : ""}. Identity / layout comes only from this image.`);
		});
	} else {
		parts.push(`<Subject 1> appears in this shot. Identity comes only from the reference images when provided.`);
	}
	parts.push("");
	parts.push("summary:");
	parts.push(desc || "A single continuous shot.");
	parts.push("");
	parts.push("retention_analysis:");
	parts.push("<Subject 1>: fully_preserved - identity unchanged; only natural motion moves.");
	parts.push("");
	parts.push("detailed_description:");
	const head = [`[Shot ${index}]`, c.size || "", c.move ? `运镜：${c.move}` : "",
		scene ? `场景：${scene}` : "", light ? `光影：${light}` : ""].filter(Boolean).join(" · ");
	parts.push(head + "。");
	parts.push(desc);
	if (line) parts.push(`台词：<d>[Chinese] ${line}</d>`);
	parts.push("");
	parts.push("overall_soundscape:");
	parts.push(sound || "自然室内环境声，无音乐。");
	parts.push("");
	parts.push("non_diegetic_music: N/A");
	return parts.join("\n");
};

const SKELETON = `subject_definitions:
<Picture 1> is the subject in the reference. 身份、发型、服装只来自参考图，不要重新设计。

summary:
一句话概括这个镜头。

retention_analysis:
<Picture 1>: fully_preserved - 只允许表情、呼吸等小幅度变化。

detailed_description:
[Shot 1] 景别、机位、光线、环境；按时间点写动作。台词：<d>[Chinese] 不超过16个字。</d>

overall_soundscape:
环境声与近场人声。

non_diegetic_music: N/A`;

return { CLIENT_LOADED_AT, report, MODELS, ASPECTS, COUNTS, RESOLUTIONS, cardSize, makeAudioNode, makeTextNode, SCRIPT_COLUMNS, SCRIPT_W, ROLE_LABEL, nextRole, assetName, assetDesc, inferRole, makeScriptNode, composeRowPrompt, SKELETON };
})();
