window.__ModuleLoader__.load({
	id: "@local/dsh-omni-canvas",
	factory: (require) => {
		const react = require("react");
		const h = react.createElement;
		const { useState, useEffect, useRef, useCallback } = react;

		const inject = ["slots"];
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

		const T = {
			bg: "#0b0c0f", panel: "#14161a", border: "#23262c", text: "#e7e9ee", dim: "#8b919c",
			accent: "#4d7cfe", ok: "#35d07f", bad: "#ff5f6d",
		};

		const css = `
.ccv-root{display:flex;flex-direction:column;height:100%;min-height:0;background:${T.bg};color:${T.text};font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
.ccv-bar{display:flex;align-items:center;gap:8px;padding:7px 10px;background:${T.panel};border-bottom:1px solid ${T.border};flex:0 0 auto}
.ccv-btn{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:7px;border:1px solid ${T.border};background:#1a1d23;color:${T.text};font-size:12px;cursor:pointer;transition:.15s}
.ccv-btn:hover{background:#22262e;border-color:#343943}
.ccv-btn:disabled{opacity:.45;cursor:not-allowed}
.ccv-primary{background:${T.accent};border-color:${T.accent};font-weight:600}
.ccv-primary:hover{background:#3f6ef0;border-color:#3f6ef0}
.ccv-select{padding:4px 6px;border-radius:6px;border:1px solid ${T.border};background:#1a1d23;color:${T.text};font-size:12px;outline:none}
.ccv-stage{position:relative;flex:1 1 auto;overflow:hidden;background-color:${T.bg};
  background-image:radial-gradient(circle at 1px 1px, rgba(255,255,255,.055) 1px, transparent 0);
  background-size:22px 22px}
.ccv-world{position:absolute;left:0;top:0;transform-origin:0 0}
.ccv-card{position:absolute;border-radius:12px;overflow:hidden;background:#0e1014;
  box-shadow:0 10px 26px rgba(0,0,0,.45);transition:box-shadow .18s,border-color .18s;user-select:none;
  border:1px solid #262a31}
.ccv-card:hover{border-color:#3a4150;box-shadow:0 12px 30px rgba(0,0,0,.55)}
.ccv-card.sel{border-color:${T.accent};box-shadow:0 0 0 2px rgba(77,124,254,.35),0 12px 30px rgba(0,0,0,.55)}
.ccv-card img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
.ccv-handle{position:absolute;width:20px;height:20px;border-radius:50%;z-index:6;
  display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;cursor:pointer;
  background:#1b1e24;border:1px solid #343943;color:#c9ced8;transition:background .15s,border-color .15s}
.ccv-handle:hover{background:${T.accent};border-color:${T.accent};color:#fff}
.ccv-refs{display:flex;align-items:center;justify-content:flex-start;gap:6px;margin:2px 0 6px}
.ccv-ref{width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid #2b3038;background:#0e1014}

.ccv-refhint{font-size:10.5px;color:#7a7a82;margin-left:4px;align-self:center}
.ccv-refcount{font-size:11px;color:#8b919c}
.ccv-mode{display:inline-flex;align-items:center;padding:4px 9px;border-radius:6px;font-size:12px;
  background:#1f2a3d;color:#8fb4ff;border:1px solid #2b3d5c}
.ccv-home{padding:28px 32px;height:100%;overflow:auto;background:#0b0d10;color:#dfe3ea}
.ccv-home-hero{position:relative;border:1px solid #23262c;border-radius:16px;padding:38px 24px;text-align:center;
  background:radial-gradient(ellipse at 50% 0%,rgba(77,124,254,.10),transparent 65%),#0e1115}
.ccv-home-title{font-size:22px;font-weight:600;letter-spacing:.5px}
.ccv-home-sub{margin-top:8px;font-size:12.5px;color:#8b919c}
.ccv-home-cta{margin-top:20px;padding:10px 22px;border-radius:10px;border:1px solid #3b5ea8;background:#1b2a45;
  color:#cfe0ff;font-size:13px;cursor:pointer}
.ccv-home-cta:hover{background:#22355a}
.ccv-home-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:18px}
.ccv-home-action{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:16px;border-radius:12px;
  border:1px solid #23262c;background:#101318;cursor:pointer;text-align:left}
.ccv-home-action:hover{border-color:#3b5ea8;background:#141a24}
.ccv-ha-icon{font-size:18px}
.ccv-ha-label{font-size:13px;color:#e6e9ef}
.ccv-ha-desc{font-size:11px;color:#7b818b}
.ccv-home-sec{display:flex;align-items:center;gap:8px;margin:26px 0 12px;font-size:12.5px;color:#aab0ba}
.ccv-home-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.ccv-proj{border:1px solid #23262c;border-radius:12px;overflow:hidden;background:#101318;cursor:pointer}
.ccv-proj:hover{border-color:#3b5ea8}
.ccv-proj-thumb{width:100%;height:130px;object-fit:cover;display:block;background:#0a0c10}
.ccv-proj-thumb.empty{display:flex;align-items:center;justify-content:center;color:#4b515b;font-size:12px}
.ccv-proj-body{padding:10px 12px}
.ccv-proj-name{font-size:13px;color:#e6e9ef;margin-bottom:4px}
.ccv-proj-stats{font-size:11px;color:#7b818b}
.ccv-proj-date{font-size:10.5px;color:#565c66;margin-top:3px}
.ccv-proj-row{display:flex;align-items:center;gap:6px;margin-top:4px}

.ccv-home-empty{padding:30px;text-align:center;color:#6f7681;font-size:12.5px;border:1px dashed #262a31;border-radius:12px}
.ccv-topbar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:${T.panel};
  border-bottom:1px solid ${T.border};position:relative;z-index:40}
.ccv-homebtn{width:28px;height:28px;border-radius:8px;border:1px solid ${T.border};background:#15181e;
  color:#cfd4dd;font-size:13px;cursor:pointer;line-height:1}
.ccv-homebtn:hover{background:#1f2530;border-color:#3b5ea8}
.ccv-projwrap{position:relative}
.ccv-projbtn{background:transparent;border:none;color:#e6e9ef;font-size:13px;cursor:pointer;padding:4px 6px;border-radius:7px}
.ccv-projbtn:hover{background:#1b2029}
.ccv-projmenu{position:absolute;left:0;top:34px;min-width:210px;background:#14171c;border:1px solid #2b303a;
  border-radius:10px;padding:6px;box-shadow:0 18px 40px rgba(0,0,0,.6);z-index:60}
.ccv-projgrp{font-size:10.5px;color:#6f7681;padding:4px 8px}
.ccv-projitem{display:block;width:100%;text-align:left;background:transparent;border:none;color:#c8ced8;
  font-size:12.5px;padding:6px 8px;border-radius:6px;cursor:pointer}
.ccv-projitem:hover{background:#1f2530}
.ccv-projitem.on{color:#8fb4ff;background:#1b2537}
.ccv-projitem.danger:hover{background:#2a1618;color:#ffb4b4}
.ccv-iconbtn{width:26px;height:26px;border-radius:7px;border:1px solid ${T.border};background:#15181e;
  color:#9aa0aa;cursor:pointer;line-height:1}
.ccv-iconbtn:hover{color:#e6e9ef;border-color:#3b5ea8}
.ccv-dock{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:4px;z-index:25;
  background:rgba(18,21,26,.92);border:1px solid ${T.border};border-radius:999px;padding:4px 8px;
  backdrop-filter:blur(8px)}
.ccv-dockbtn{background:transparent;border:none;color:#b8bec9;font-size:12px;padding:4px 8px;border-radius:999px;cursor:pointer}
.ccv-dockbtn:hover{background:#222833;color:#e6e9ef}
.ccv-dockbtn.on{color:#8fb4ff;background:#1b2537}
.ccv-dockpct{background:transparent;border:none;color:#9aa0aa;font-size:11.5px;min-width:44px;cursor:pointer}
.ccv-docksep{width:1px;height:16px;background:#2b303a;margin:0 4px}
.ccv-adddock{position:absolute;left:50%;transform:translateX(-50%);bottom:14px;z-index:25}
.ccv-addbtn{padding:9px 20px;border-radius:999px;border:1px solid #3b5ea8;background:#1b2a45;color:#cfe0ff;
  font-size:13px;cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,.5)}
.ccv-addbtn:hover{background:#22355a}
.ccv-shell{display:flex;height:100%;min-height:0;background:${T.bg};overflow:hidden}
.ccv-side{width:196px;flex:0 0 196px;display:flex;flex-direction:column;gap:2px;padding:10px 8px;
  background:${T.panel};border-right:1px solid ${T.border};transition:width .16s ease,flex-basis .16s ease}
.ccv-side.mini{width:56px;flex-basis:56px;padding:10px 6px}
.ccv-side-brand{display:flex;align-items:center;gap:8px;padding:4px 6px 12px}
.ccv-side-logo{font-size:15px;color:#8fb4ff}
.ccv-side-name{font-size:13px;color:#e6e9ef;font-weight:600;flex:1;white-space:nowrap;overflow:hidden}
.ccv-side-collapse{margin-left:auto;width:20px;height:20px;border:none;border-radius:6px;background:transparent;
  color:#6f7681;cursor:pointer;font-size:12px;line-height:1}
.ccv-side-collapse:hover{background:#1f2530;color:#cfd4dd}
.ccv-side-new{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 2px 10px;padding:8px 10px;
  border-radius:8px;border:1px solid #3b5ea8;background:#1b2a45;color:#cfe0ff;font-size:12.5px;cursor:pointer;
  white-space:nowrap;overflow:hidden}
.ccv-side-new:hover{background:#22355a}
.ccv-side-item{display:flex;align-items:center;gap:10px;padding:8px 10px;border:none;border-radius:8px;
  background:transparent;color:#aeb5c0;font-size:12.5px;cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden}
.ccv-side-item:hover{background:#1b2029;color:#e6e9ef}
.ccv-side-item.on{background:#1b2537;color:#cfe0ff}
.ccv-side-ico{width:16px;text-align:center;font-size:12px}
.ccv-side-spacer{flex:1}
.ccv-side-foot{display:flex;align-items:center;gap:8px;padding:8px 10px 4px;border-top:1px solid ${T.border}}
.ccv-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
.ccv-page{flex:1;overflow:auto;padding:22px 26px}
.ccv-page-head{display:flex;align-items:center;gap:8px;margin-bottom:16px}
.ccv-page-title{font-size:16px;color:#e6e9ef;font-weight:600}
.ccv-home-cta.small{padding:6px 12px;font-size:12px}
.ccv-projgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.ccv-projcard{display:flex;flex-direction:column;text-align:left;padding:0;border-radius:10px;overflow:hidden;
  border:1px solid ${T.border};background:#15181e;cursor:pointer}
.ccv-projcard:hover{border-color:#3b5ea8}
.ccv-projcard-thumb{height:104px;background:#0d1014;display:flex;align-items:center;justify-content:center;
  color:#39404b;font-size:12px;overflow:hidden}
.ccv-projcard-thumb img,.ccv-projcard-thumb video{width:100%;height:100%;object-fit:cover}
.ccv-projcard-body{padding:9px 11px 11px;display:flex;flex-direction:column;gap:3px}
.ccv-assetgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.ccv-assetcard{border:1px solid ${T.border};border-radius:10px;overflow:hidden;background:#0f1216}
.ccv-assetcard img,.ccv-assetcard video{width:100%;height:120px;object-fit:cover;display:block;background:#000}
.ccv-asset-ph{height:120px;display:flex;align-items:center;justify-content:center;font-size:24px;color:#39404b}
.ccv-asset-meta{display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:11px;color:#7b818b}
.ccv-asset-role{color:#9aa0aa}
.ccv-asset-proj{margin-left:auto;color:#5f646d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px}
.ccv-chip{border:1px solid ${T.border};background:transparent;color:#9aa0aa;font-size:11.5px;padding:4px 10px;
  border-radius:999px;cursor:pointer}
.ccv-chip:hover{color:#e6e9ef;border-color:#3b5ea8}
.ccv-chip.on{background:#1b2537;color:#cfe0ff;border-color:#3b5ea8}
.ccv-set-card{border:1px solid ${T.border};border-radius:12px;background:#111419;padding:14px 16px;margin-bottom:12px;max-width:760px}
.ccv-set-title{font-size:12.5px;color:#cfd4dd;font-weight:600;margin-bottom:10px}
.ccv-set-row{display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:12px}
.ccv-set-label{width:76px;color:#7b818b;flex:0 0 76px}
.ccv-set-val{color:#c8ced8;word-break:break-all}
.ccv-input{flex:1;padding:6px 10px;border-radius:7px;border:1px solid ${T.border};background:#0d1014;
  color:#c8ced8;font-size:12px;outline:none}
.ccv-set-ok{font-size:12px;color:#5fd18c;margin-top:4px}
.ccv-set-bad{font-size:12px;color:#ff8d8d;margin-top:4px}
.ccv-set-line{display:flex;align-items:baseline;gap:8px;padding:4px 0;font-size:12.5px;color:#c8ced8;flex-wrap:wrap}
.ccv-tick{font-size:11px}
.ccv-set-cap{color:#cfd4dd}
.ccv-set-miss{color:#ffb4b4;font-size:11.5px}
.ccv-empty{padding:40px 0;text-align:center;color:#5f646d;font-size:12.5px}
/* ===== 中性主题覆盖：近黑 + 灰阶，去蓝 ===== */
.ccv-shell{background:#0a0a0b}
.ccv-side{width:188px;flex:0 0 188px;background:#0b0b0c;border-right:1px solid #17171a;padding:12px 10px;gap:1px}
.ccv-side.mini{width:52px;flex-basis:52px;padding:12px 6px}
.ccv-side-brand{padding:2px 4px 12px;gap:7px}
.ccv-side-logo{color:#c9c9ce;font-size:12px}
.ccv-side-name{font-size:12.5px;color:#d2d2d6;font-weight:500}
.ccv-side-collapse{color:#4f4f55;font-size:11px}
.ccv-side-collapse:hover{background:#151517;color:#b9b9be}
.ccv-side-new{background:#141416;border:1px solid #232326;color:#dcdce0;font-size:12px;padding:7px 10px;
  border-radius:7px;font-weight:400}
.ccv-side-new:hover{background:#1a1a1d;border-color:#323237}
.ccv-side-item{color:#85858c;font-size:12.5px;padding:7px 9px;border-radius:6px;gap:9px}
.ccv-side-item:hover{background:#131315;color:#cdcdd2}
.ccv-side-item.on{background:#161618;color:#f2f2f4}
.ccv-side-ico{color:#6a6a70;font-size:11px;width:14px}
.ccv-side-item.on .ccv-side-ico{color:#b9b9be}
.ccv-side-foot{border-top:1px solid #17171a;padding:8px 6px 2px}
.ccv-main{background:#0a0a0b}
.ccv-page{padding:28px 34px}
.ccv-page-head{margin-bottom:18px;gap:10px}
.ccv-page-title{font-size:14px;font-weight:600;color:#ededf0;letter-spacing:.4px}
.ccv-hint{color:#6a6a70;font-size:11.5px}

/* 首页 */
.ccv-home{max-width:1080px}
.ccv-home-hero{background:transparent;border:1px dashed #202024;border-radius:14px;padding:30px 24px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0}
.ccv-home-hero:hover{border-color:#2c2c31}
.ccv-hero-plus{width:56px;height:56px;border-radius:14px;border:none;background:#f2f2f4;color:#0a0a0b;
  font-size:24px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;
  box-shadow:0 8px 24px rgba(0,0,0,.5)}
.ccv-hero-plus:hover{background:#fff;transform:translateY(-1px)}
.ccv-hero-label{font-size:12.5px;color:#dcdce0;margin-top:14px}
.ccv-home-sub{font-size:11.5px;color:#5f5f66;margin-top:6px}
.ccv-home-title{font-size:19px;font-weight:600;color:#f0f0f2;letter-spacing:.5px}
.ccv-home-sub{font-size:12px;color:#6f6f76;margin-top:6px}
.ccv-home-cta{background:#f2f2f4;color:#0a0a0b;border:none;border-radius:8px;font-size:12.5px;
  padding:9px 16px;font-weight:500;margin-top:16px}
.ccv-home-cta:hover{background:#fff}
.ccv-home-cta.small{background:#141416;color:#dcdce0;border:1px solid #232326;padding:6px 12px;margin-top:0}
.ccv-home-cta.small:hover{background:#1a1a1d}
.ccv-home-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
.ccv-home-action{background:#0e0e10;border:1px solid #1a1a1d;border-radius:10px;padding:14px 14px 12px;
  text-align:left;cursor:pointer;transition:border-color .12s,background .12s}
.ccv-home-action:hover{background:#121214;border-color:#2c2c31}
.ccv-ha-icon{font-size:13px;color:#9a9aa1;display:block;margin-bottom:10px}
.ccv-ha-label{font-size:12.5px;color:#dedee2;display:block}
.ccv-ha-desc{font-size:11px;color:#63636a;display:block;margin-top:3px}
.ccv-home-sec{display:flex;align-items:center;gap:8px;margin:24px 0 10px;font-size:12px;color:#8a8a91}
.ccv-home-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.ccv-proj{background:#0e0e10;border:1px solid #1a1a1d;border-radius:10px;overflow:hidden}
.ccv-proj:hover{border-color:#2c2c31;background:#121214}
.ccv-proj-name{font-size:12.5px;color:#dedee2}
.ccv-proj-stats,.ccv-proj-date{font-size:11px;color:#63636a}

/* 项目卡 */
.ccv-projgrid{grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.ccv-projcard{background:#0e0e10;border:1px solid #1a1a1d;border-radius:10px}
.ccv-projcard:hover{border-color:#2c2c31;background:#121214}
.ccv-projcard-thumb{height:112px;background:#08080a;color:#3a3a40}
.ccv-projcard-body{padding:9px 11px 11px}

/* 资产卡 */
.ccv-assetgrid{grid-template-columns:repeat(auto-fill,minmax(148px,1fr));gap:9px}
.ccv-assetcard{background:#0e0e10;border:1px solid #1a1a1d;border-radius:9px}
.ccv-assetcard img,.ccv-assetcard video{height:112px}
.ccv-asset-meta{padding:6px 8px;color:#63636a}
.ccv-asset-role{color:#8f8f96}
.ccv-chip{background:transparent;border:1px solid #232326;color:#85858c;font-size:11.5px;padding:4px 10px}
.ccv-chip:hover{color:#dedee2;border-color:#34343a}
.ccv-chip.on{background:#17171a;border-color:#34343a;color:#ededf0}

/* 设置页 */
.ccv-set-card{background:#0e0e10;border:1px solid #1a1a1d;border-radius:11px;padding:14px 16px;
  margin-bottom:10px;max-width:720px}
.ccv-set-title{font-size:12px;color:#9a9aa1;font-weight:500;letter-spacing:.4px;margin-bottom:12px}
.ccv-set-row{font-size:12px;gap:12px;margin-bottom:7px}
.ccv-set-label{width:68px;flex:0 0 68px;color:#5f5f66}
.ccv-set-val{color:#c4c4ca}
.ccv-input{background:#08080a;border:1px solid #1e1e21;color:#b9b9be;font-size:12px;padding:6px 10px;border-radius:6px}
.ccv-set-ok{font-size:12px;color:#7fa886;margin-top:6px}
.ccv-set-bad{font-size:12px;color:#c98a8a;margin-top:6px}
.ccv-set-line{gap:9px;padding:5px 0;font-size:12px;color:#b9b9be}
.ccv-tick{font-size:8px;line-height:1}
.ccv-tick.ok{color:#7fa886}
.ccv-tick.bad{color:#c98a8a}
.ccv-set-cap{color:#dcdce0}
.ccv-set-miss{color:#c98a8a;font-size:11.5px}
.ccv-empty{color:#55555b}

/* 画布：顶栏 / dock / 添加按钮 去蓝 */
.ccv-topbar{background:#0b0b0c;border-bottom:1px solid #17171a;padding:8px 14px}
.ccv-homebtn{background:#141416;border:1px solid #232326;color:#c4c4ca;border-radius:7px}
.ccv-homebtn:hover{background:#1a1a1d;border-color:#323237;color:#ededf0}
.ccv-projbtn{color:#e4e4e8;font-size:12.5px}
.ccv-projbtn:hover{background:#151517}
.ccv-iconbtn{background:#141416;border:1px solid #232326;color:#85858c;border-radius:7px}
.ccv-iconbtn:hover{color:#ededf0;border-color:#323237}
.ccv-projmenu{background:#111113;border:1px solid #232326;border-radius:9px}
.ccv-projitem{color:#b9b9be;font-size:12px}
.ccv-projitem:hover{background:#17171a;color:#ededf0}
.ccv-projitem.on{background:#1a1a1d;color:#f2f2f4}
.ccv-projgrp{color:#5f5f66}
.ccv-sep{background:#1e1e21}
.ccv-dock{background:rgba(12,12,14,.94);border:1px solid #1e1e21;border-radius:999px;padding:3px 7px}
.ccv-dockbtn{color:#9a9aa1;font-size:12px}
.ccv-dockbtn:hover{background:#1a1a1d;color:#ededf0}
.ccv-dockbtn.on{background:#1a1a1d;color:#f2f2f4}
.ccv-dockpct{color:#6f6f76}
.ccv-docksep{background:#232326}
.ccv-addbtn{background:#f2f2f4;border:none;color:#0a0a0b;font-size:12.5px;padding:8px 18px;font-weight:500;
  box-shadow:0 8px 22px rgba(0,0,0,.55)}
.ccv-addbtn:hover{background:#fff}
.ccv-card-role{background:#1c1c20;color:#9a9aa1}
.ccv-btn{background:#141416;border:1px solid #232326;color:#c4c4ca}
.ccv-btn:hover{background:#1a1a1d;border-color:#323237;color:#ededf0}
.ccv-select{background:#141416;border:1px solid #232326;color:#c4c4ca}
.ccv-mini{background:#141416;border:1px solid #232326;color:#c4c4ca}
.ccv-stale{background:#241f14;color:#d9b978;border-color:#43381f}

/* ===== 字号层级 + 自适应布局（第三轮） ===== */
.ccv-side-brand{padding:4px 4px 14px;gap:8px}
.ccv-side-name{font-size:14px;font-weight:600;color:#e6e6ea;letter-spacing:.3px}
.ccv-side-logo{font-size:14px;color:#d8d8dd}
.ccv-side-collapse{font-size:12px}
.ccv-side-new{font-size:12.5px;padding:8px 10px}
.ccv-side-item{font-size:13px;padding:8px 10px}
.ccv-side-foot{font-size:11.5px}

.ccv-page{padding:32px 40px}
.ccv-page-head{margin-bottom:22px}
.ccv-page-title{font-size:22px;font-weight:600;color:#f4f4f6;letter-spacing:.2px}
.ccv-page-sub{font-size:12.5px;color:#6f6f76;margin-left:12px}

/* 首页：内容区自适应，不再固定 1080 */
.ccv-home{max-width:none;width:auto}
.ccv-hero-label{font-size:13px}

/* 项目/资产 网格更宽 */
.ccv-projgrid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.ccv-assetgrid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}

/* 设置页：卡片自适应铺满，不再右侧留白 */
.ccv-set-grid{display:grid;grid-template-columns:1fr;gap:12px;align-items:start;width:100%}
.ccv-set-card{max-width:none;width:100%;margin-bottom:0;padding:16px 18px;border-radius:12px}
.ccv-set-title{font-size:13px;font-weight:600;color:#dedee3;letter-spacing:.3px;margin-bottom:14px}
.ccv-set-row{font-size:12.5px;gap:12px;margin-bottom:8px}
.ccv-set-label{width:74px;flex:0 0 74px;color:#6a6a71;font-size:12px}
.ccv-set-val{color:#cdcdd3}
.ccv-input{font-size:12.5px;padding:7px 10px}
.ccv-set-ok{font-size:12.5px;color:#86b18e;margin-top:8px}
.ccv-set-bad{font-size:12.5px;color:#cf9292;margin-top:8px}
.ccv-set-line{font-size:12.5px;padding:6px 0;gap:10px}
.ccv-set-cap{color:#e2e2e6}
.ccv-set-miss{color:#cf9292;font-size:12px}
.ccv-set-hint{font-size:11.5px;color:#5f5f66;margin-top:10px;line-height:1.7}

.ccv-set-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0 10px}
.ccv-wftag{font-size:11px;color:#8f8f96;border:1px solid #232326;border-radius:999px;padding:1px 8px}

.ccv-assist{border-color:#26262b;background:#0f0f12}
.ccv-assist-pre{margin:0 0 10px;padding:12px 14px;border-radius:8px;background:#08080a;border:1px solid #1c1c20;
  color:#a9a9b0;font-size:11.5px;line-height:1.75;white-space:pre-wrap;word-break:break-word;
  max-height:260px;overflow:auto;font-family:ui-monospace,Consolas,monospace}

.ccv-assist-head{display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap}

.ccv-cap-hint{font-size:11.5px;color:#5f5f66;margin:-4px 0 12px;line-height:1.7}
.ccv-cap{padding:10px 0;border-top:1px solid #16161a}
.ccv-cap:first-of-type{border-top:none}
.ccv-cap-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ccv-cap-name{font-size:12.5px;color:#e2e2e6;min-width:76px}
.ccv-cap-cur{font-size:12px;color:#7d7d84}
.ccv-cap-badge{font-size:11px;color:#7d7d84;border:1px solid #232326;border-radius:999px;padding:1px 8px}
.ccv-cap-cands{margin:8px 0 0 18px;display:flex;flex-direction:column;gap:6px}
.ccv-cap-cand{display:flex;align-items:center;gap:9px;font-size:12px}
.ccv-cap-candname{color:#b9b9be}
.ccv-cap-state{font-size:11px;color:#5f5f66}
.ccv-cap-none{font-size:11.5px;color:#4f4f55;margin:6px 0 0 18px}


/* ===== 默认模型 / 工作流 新版布局 ===== */


.ccv-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:26px;z-index:9999;
  background:#1b1b1e;border:1px solid #34343a;color:#f0f0f2;font-size:12.5px;padding:9px 16px;border-radius:999px;
  box-shadow:0 10px 28px rgba(0,0,0,.6)}
.ccv-copybox{border:1px solid #3a3a42;border-radius:11px;background:#0f0f12;padding:12px 14px;margin-bottom:10px}
.ccv-copybox-head{display:flex;align-items:center;gap:8px;font-size:12px;color:#dedee3;margin-bottom:8px}
.ccv-copybox-pre{margin:0;max-height:260px;overflow:auto;white-space:pre-wrap;word-break:break-word;
  font-size:11.5px;line-height:1.7;color:#b9b9be;background:#08080a;border:1px solid #1c1c20;border-radius:8px;padding:10px 12px;
  font-family:ui-monospace,Consolas,monospace;user-select:text}

.ccv-hrow{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #141418}
.ccv-hrow:first-of-type{border-top:none}
.ccv-hrow-kind{font-size:11.5px;color:#9a9aa1;width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ccv-hrow-prompt{font-size:12px;color:#dedee3;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ccv-hrow-time{font-size:11px;color:#6f6f76;width:44px;text-align:right}
.ccv-hrow-err{font-size:11px;color:#c98a8a;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ccv-mgroup{margin:6px 0 14px}
.ccv-mgroup-title{font-size:12px;color:#8a8a91;letter-spacing:.5px;margin:6px 0 8px;padding-left:1px}
.ccv-mrow{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #141418}
.ccv-mrow:first-of-type{border-top:none}
.ccv-mrow-name{width:86px;flex:0 0 86px;font-size:12.5px;color:#e2e2e6}
.ccv-mrow-sel{flex:0 0 300px;max-width:300px}
.ccv-mrow-state{font-size:11.5px;color:#6f6f76}
.ccv-mrow-state.ok{color:#86b18e}
.ccv-wrow{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #141418;flex-wrap:wrap}
.ccv-wrow:first-of-type{border-top:none}
.ccv-wrow-name{font-size:12.5px;color:#dcdce0;min-width:200px;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ccv-wrow-state{font-size:11.5px;color:#6f6f76}
.ccv-wrow-state.ok{color:#86b18e}

.ccv-cap-cand{position:relative;min-height:24px}
.ccv-cap-act{opacity:0;transition:opacity .12s;background:transparent;border:1px solid #2a2a30;color:#c4c4ca;
  font-size:11.5px;padding:2px 10px;border-radius:999px;cursor:pointer;margin-left:auto}
.ccv-cap-cand:hover .ccv-cap-act{opacity:1}
.ccv-cap-act:hover{background:#1b1b1e;border-color:#3a3a42;color:#f0f0f2}
.ccv-cap-tag{font-size:10.5px;color:#5f5f66;border:1px solid #202024;border-radius:999px;padding:0 7px;line-height:16px}
.ccv-cap-tag.on{color:#86b18e;border-color:#223026;background:#141a16}
.ccv-assist-pre{max-height:220px;font-size:11px;line-height:1.7}

.ccv-set-grid{align-items:stretch}
.ccv-set-card{display:flex;flex-direction:column}
.ccv-set-miss{display:block;flex-basis:100%;padding-left:19px;margin-top:2px}
.ccv-set-line{flex-wrap:wrap;row-gap:2px}


.ccv-envbar{display:flex;align-items:center;gap:8px;margin:0 12px 6px;padding:6px 10px;border-radius:8px;
  background:#241f12;border:1px solid #4a3f1c;font-size:11.5px;color:#e6cf9a}
.ccv-envdot{color:#e0b45c}
.ccv-envtext{flex:1}

.ccv-filmstrip{position:absolute;left:12px;right:12px;bottom:56px;z-index:26;
  background:rgba(16,16,19,.95);border:1px solid #2a2a31;border-radius:12px;padding:8px 10px}
.ccv-film-head{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#9a9aa2;margin-bottom:6px}
.ccv-film-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:2px}
.ccv-film-item{flex:0 0 auto;border:1px solid #2b2b33;border-radius:8px;overflow:hidden;cursor:pointer;background:#0d0d10}
.ccv-film-item.on{border-color:#8fb4ff}
.ccv-film-thumb{display:block;width:96px;height:140px;object-fit:cover;background:#000}
.ccv-film-idx{font-size:10.5px;color:#9aa0aa;text-align:center;padding:2px 0}
.ccv-qpanel{position:absolute;left:16px;top:56px;z-index:30;
  background:rgba(18,18,21,.94);border:1px solid #2e2e35;border-radius:12px;padding:8px 12px;
  min-width:300px;max-width:520px;backdrop-filter:blur(6px)}
.ccv-qhead{display:flex;align-items:center;gap:8px;font-size:12px;color:#e4e4e8}
.ccv-qspin{color:#d6b36a}
.ccv-qtitle{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ccv-qbtn{background:#22222a;border:1px solid #3a3a44;color:#cfcfd6;font-size:11px;
  padding:2px 8px;border-radius:6px;cursor:pointer}
.ccv-qbtn:hover{background:#2d2d36;color:#fff}
.ccv-qlist{margin-top:8px;border-top:1px solid #26262c;padding-top:6px;display:flex;flex-direction:column;gap:4px}
.ccv-qitem{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#a9a9b1}
.ccv-qitem span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ccv-queue{font-size:11px;padding:2px 8px;border-radius:999px;background:#2a2413;border:1px solid #4d3f19;color:#e6c06a}
.ccv-check{display:flex;align-items:center;gap:4px;font-size:11.5px;color:#b8bec9;cursor:pointer}
.ccv-check input{accent-color:#4d7cfe}
.ccv-assets-filter{display:flex;gap:6px;padding:6px 10px;border-bottom:1px solid #23262c}
.ccv-chip{font-size:11px;padding:2px 9px;border-radius:999px;border:1px solid #2b303a;background:transparent;color:#9aa0aa;cursor:pointer}
.ccv-chip.on{background:#1f2a3d;border-color:#3b5ea8;color:#8fb4ff}
.ccv-cancel{font-size:10.5px;margin-left:6px;padding:1px 7px;border-radius:5px;border:1px solid #5b2b2f;
  background:rgba(42,22,24,.9);color:#ffb4b4;cursor:pointer}
.ccv-sc-mini{width:18px;border:none;background:transparent;color:#6f7681;cursor:pointer;font-size:11px}
.ccv-sc-mini:hover{color:#e6e9ef;background:#232830}
.ccv-stale{padding:3px 9px;border-radius:999px;font-size:11px;background:#3a2d12;border:1px solid #6b5320;color:#ffd479}
.ccv-card-head{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:5px;flex-wrap:wrap;row-gap:4px;
  padding:5px 8px;background:linear-gradient(180deg,rgba(0,0,0,.62),rgba(0,0,0,.0));opacity:.95;transition:opacity .15s}
.ccv-card:hover .ccv-card-head,.ccv-card.sel .ccv-card-head{opacity:1}


.ccv-page-head{flex-wrap:wrap;row-gap:8px}
.ccv-page-head .ccv-page-title{white-space:nowrap}
.ccv-search{width:200px;background:#141418;border:1px solid #2a2a30;border-radius:8px;color:#e4e4e8;
  font-size:12px;padding:5px 10px;outline:none}
.ccv-search:focus{border-color:#4a4a55}
.ccv-card-acts{display:flex;gap:4px;margin-left:auto}




.ccv-card-tag.ok{background:rgba(30,48,32,.9);border-color:#3a5c3e;color:#a9d0a9}
.ccv-card-tag.warn{background:rgba(58,44,20,.92);border-color:#6b5322;color:#e8cd91}
.ccv-card-meta{position:absolute;left:8px;bottom:6px;font-size:10.5px;color:#9aa0aa;
  background:rgba(10,10,12,.72);padding:2px 7px;border-radius:6px;z-index:5}
.ccv-card-tag{cursor:pointer}
.ccv-card-tag{font-size:10px;padding:1px 6px;border-radius:5px;background:rgba(38,52,38,.9);
  border:1px solid #37543a;color:#a9d0a9;white-space:nowrap}
.ccv-card-act{white-space:nowrap;background:rgba(20,20,24,.86);border:1px solid #34343c;color:#d8d8dd;font-size:11px;
  padding:2px 7px;border-radius:6px;cursor:pointer;line-height:1.5}
.ccv-card-act:hover{background:#2a2a31;border-color:#4a4a55;color:#fff}
.ccv-card-name{font-size:11px;color:#e6e9ef;text-shadow:0 1px 3px rgba(0,0,0,.8);cursor:text;
  max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ccv-card-role{font-size:10px;padding:1px 6px;border-radius:999px;background:rgba(31,42,61,.9);
  border:1px solid #2b3d5c;color:#8fb4ff;cursor:pointer}
.ccv-card-role:hover{background:#2a3b55}
.ccv-name-edit{font-size:11px;background:#0f1216;border:1px solid #3b5ea8;border-radius:5px;color:#e6e9ef;
  padding:1px 5px;outline:none;max-width:70%}
.ccv-sc-assets{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:3px 6px;min-height:24px}
.ccv-sc-chip{display:inline-flex;align-items:center;padding:1px 6px;border-radius:999px;font-size:10.5px;
  background:#1f2a3d;border:1px solid #2b3d5c;color:#8fb4ff;cursor:pointer}
.ccv-sc-chip.missing{background:#2a1618;border-color:#5b2b2f;color:#ffb4b4}
.ccv-sc-addasset{width:20px;height:18px;border-radius:5px;border:1px dashed #3a4250;background:transparent;
  color:#7b818b;font-size:11px;cursor:pointer;line-height:1}
.ccv-sc-addasset:hover{border-color:${T.accent};color:${T.accent}}
.ccv-picker-overlay{position:fixed;inset:0;z-index:210;background:rgba(5,6,8,.72);display:flex;align-items:center;justify-content:center}
.ccv-picker{width:520px;max-height:70vh;background:#14161a;border:1px solid #2b2f37;border-radius:12px;
  display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.6)}
.ccv-picker-head{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #23262c;font-size:12.5px;color:#dfe3ea}
.ccv-picker-head .sp{flex:1}
.ccv-picker-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;overflow:auto}
.ccv-picker-item{position:relative;border-radius:8px;overflow:hidden;border:1px solid #262a31;cursor:pointer;aspect-ratio:1/1}
.ccv-picker-item:hover{border-color:${T.accent}}
.ccv-picker-thumb{width:100%;height:100%;object-fit:cover;display:block}
.ccv-picker-role{position:absolute;left:4px;bottom:4px;font-size:10px;padding:1px 6px;border-radius:999px;
  background:rgba(10,12,16,.8);color:#a9b0bb}
.ccv-picker-empty{padding:24px;text-align:center;color:#7b818b;font-size:12px}
.ccv-assets{position:absolute;left:0;top:0;bottom:0;width:300px;display:flex;flex-direction:column;background:rgba(18,21,26,.97);
  border-right:1px solid #23262c;z-index:70;display:flex;flex-direction:column;backdrop-filter:blur(6px)}
.ccv-assets-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #23262c;
  font-size:12px;color:#cfd4dd}
.ccv-assets-head .sp{flex:1}
.ccv-assets-grid{flex:1 1 auto;min-height:0;overflow-y:auto;padding:8px;display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-content:start;grid-auto-rows:min-content}
.ccv-assets-search{padding:8px 10px 4px}
.ccv-search{width:100%;box-sizing:border-box;background:#0f1216;border:1px solid #262a31;border-radius:7px;
  color:#dfe3ea;font-size:11.5px;padding:6px 8px;outline:none}
.ccv-search:focus{border-color:#3b5ea8}
.ccv-asset-role{position:absolute;left:4px;top:4px;z-index:2;font-size:9.5px;padding:1px 6px;border-radius:999px;
  background:rgba(10,12,16,.82);color:#9aa0aa}
.ccv-asset-role.character{color:#8fb4ff}
.ccv-asset-role.scene{color:#7fd6a8}
.ccv-asset-role.prop{color:#e6c06a}
.ccv-asset{position:relative;border-radius:8px;overflow:hidden;border:1px solid #262a31;background:#0e1014;aspect-ratio:1/1}
.ccv-asset-media{width:100%;height:100%;object-fit:cover;display:block;cursor:pointer}
.ccv-asset-media:hover{opacity:.85}
.ccv-asset-del{position:absolute;right:3px;top:3px;width:18px;height:18px;border-radius:50%;border:none;
  background:rgba(10,12,16,.8);color:#cfd4dd;font-size:10px;cursor:pointer;display:none}
.ccv-asset:hover .ccv-asset-del{display:block}
.ccv-script{position:absolute;background:#12151a;border:1px solid #262a31;border-radius:12px;
  box-shadow:0 12px 30px rgba(0,0,0,.5);overflow:hidden;user-select:none}
.ccv-script.sel{border-color:${T.accent};box-shadow:0 0 0 2px rgba(77,124,254,.3),0 12px 30px rgba(0,0,0,.5)}
.ccv-script-head{display:flex;align-items:center;gap:8px;padding:7px 10px;background:#171a20;border-bottom:1px solid #23262c}
.ccv-sc-title{font-size:12.5px;color:#dfe3ea;font-weight:600}
.ccv-sc-sum{font-size:11px;color:#8b919c}
.ccv-sc-group{border-bottom:1px solid #1d2027}
.ccv-sc-group-head{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#161a20}
.ccv-sc-gtitle{width:70px;background:transparent;border:none;color:#cfd4dd;font-size:12px;font-weight:600;outline:none}
.ccv-sc-lab{font-size:10.5px;color:#6d737d}
.ccv-sc-gfield{flex:1;min-width:80px;background:#0f1216;border:1px solid #23262c;border-radius:5px;
  color:#c3c9d2;font-size:11.5px;padding:3px 6px;outline:none}
.ccv-sc-row{display:flex;align-items:stretch;border-top:1px solid #1b1e24}
.ccv-sc-row.head{background:#14171c;border-top:none}
.ccv-sc-th{font-size:10.5px;color:#7b818b;padding:5px 6px;box-sizing:border-box;flex:0 0 auto}
.ccv-sc-cell{background:transparent;border:none;border-right:1px solid #1b1e24;color:#dfe3ea;
  font-size:11.5px;padding:5px 6px;outline:none;box-sizing:border-box;flex:0 0 auto;font-family:inherit}
.ccv-sc-cell:focus{background:#1b2027;box-shadow:inset 0 0 0 1px #3b5ea8}
.ccv-sc-go{width:44px;border:none;background:transparent;color:#6f7681;cursor:pointer;font-size:11px}
.ccv-sc-go:hover{background:#22303f;color:#8fb4ff}
.ccv-sc-addrow{padding:5px 8px}
.ccv-lightbox{position:fixed;inset:0;z-index:200;background:rgba(5,6,8,.88);display:flex;
  align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.ccv-lightbox-inner{position:relative;max-width:92vw;max-height:92vh;display:flex;align-items:center;justify-content:center}
.ccv-lb-media{max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 30px 80px rgba(0,0,0,.7);display:block}
.ccv-lb-close{position:absolute;top:-14px;right:-14px;width:30px;height:30px;border-radius:50%;border:1px solid #343943;
  background:#1b1e24;color:#dfe3ea;cursor:pointer;font-size:14px;line-height:1}
.ccv-lb-close:hover{background:#2a2f38}
.ccv-dotport{position:absolute;width:16px;height:16px;border-radius:50%;background:#1b1e24;
  border:1px solid #3a4250;color:#c9ced8;font-size:12px;line-height:14px;text-align:center;
  cursor:pointer;z-index:60;user-select:none}
.ccv-dotport:hover{background:${T.accent};border-color:${T.accent};color:#fff}
.ccv-menu{position:absolute;z-index:40;background:#171a1f;border:1px solid #2b2f37;border-radius:12px;
  padding:8px;box-shadow:0 18px 44px rgba(0,0,0,.6);display:flex;flex-direction:column;gap:2px;min-width:246px}
.ccv-menu .grp{font-size:11px;color:#71767f;padding:6px 8px 4px}
.ccv-menu button{all:unset;display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;
  font-size:12.5px;color:#dfe3ea;cursor:pointer}
.ccv-menu button:hover{background:#22262e}
.ccv-menu button:disabled{opacity:.38;cursor:not-allowed}
.ccv-menu .ico{width:16px;text-align:center;opacity:.85}
.ccv-menu .tag{margin-left:auto;font-size:10px;padding:1px 6px;border-radius:999px;background:#1f2a3d;color:#7fb0ff}
.ccv-menu .sep{height:1px;background:#24272e;margin:6px 4px}
.ccv-tools{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
.ccv-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;
  border:1px solid ${T.border};background:#171a1f;color:#b9bfc9;font-size:11.5px;cursor:pointer}
.ccv-chip:hover{background:#20242b;color:#e7e9ee}
.ccv-chip:disabled{opacity:.45;cursor:not-allowed}
.ccv-send{width:34px;height:34px;border-radius:50%;border:1px solid #3a4250;background:#2a3340;
  color:#dfe6f2;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;
  transition:background .15s,border-color .15s}
.ccv-send:hover:not(:disabled){background:#3a4a5f;border-color:#4b5b74}
.ccv-send:disabled{opacity:.5;cursor:not-allowed}
.ccv-seed{width:74px;padding:4px 7px;border-radius:6px;border:1px solid ${T.border};background:#1a1d23;
  color:${T.text};font-size:12px;outline:none}
.ccv-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#39404b;font-size:36px}
.ccv-run{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  background:rgba(8,9,12,.55);font-size:12px;color:#ffd479;letter-spacing:.5px}
.ccv-float{position:absolute;z-index:20;background:${T.panel};border:1px solid ${T.border};border-radius:12px;
  padding:9px;box-shadow:0 18px 40px rgba(0,0,0,.55);cursor:default}
.ccv-ta{width:100%;box-sizing:border-box;min-height:56px;max-height:200px;resize:none;border-radius:0;
  border:none;background:transparent;color:${T.text};padding:6px 2px;font-size:12.5px;
  outline:none;font-family:inherit;line-height:1.6}
.ccv-ta::placeholder{color:#5f646d}
.ccv-float-head{display:flex;align-items:center;margin-bottom:4px}
.ccv-float-head .sp{flex:1}
.ccv-expand{width:22px;height:22px;border-radius:6px;border:none;background:transparent;color:#7d838d;
  cursor:pointer;font-size:13px;line-height:1}
.ccv-expand:hover{background:#22262e;color:#dfe3ea}
.ccv-video{width:100%;height:100%;object-fit:cover;display:block;background:#000}
.ccv-audio{position:absolute;background:#11141a;border:1px solid #262a31;border-radius:12px;overflow:hidden;
  box-shadow:0 12px 30px rgba(0,0,0,.5)}
.ccv-audio.sel{border-color:#4d7cfe;box-shadow:0 0 0 2px rgba(77,124,254,.28),0 12px 30px rgba(0,0,0,.5)}
.ccv-audio-head{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid #20242b;
  font-size:12px;color:#aab0ba;cursor:grab}
.ccv-audio-player{display:block;width:100%;margin:0;background:#0d1014}
.ccv-audio-empty{padding:14px 12px;display:flex;flex-direction:column;gap:8px;font-size:12px;color:#7b818b}
.ccv-text{position:absolute;background:#11141a;border:1px solid #262a31;border-radius:12px;overflow:hidden;
  box-shadow:0 12px 30px rgba(0,0,0,.5);cursor:default}
.ccv-text.sel{border-color:#4d7cfe;box-shadow:0 0 0 2px rgba(77,124,254,.28),0 12px 30px rgba(0,0,0,.5)}
.ccv-text-head{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid #20242b;
  font-size:12px;color:#aab0ba;cursor:grab}
.ccv-text-ico{font-size:12px;color:#6f7681}
.ccv-text-title{color:#cfd4dd}
.ccv-text-body{padding:14px;max-height:520px;overflow:auto}
.ccv-text-content{white-space:pre-wrap;font-size:12.5px;line-height:1.85;color:#c8ced8;word-break:break-word}
.ccv-text-edit{display:block;width:100%;box-sizing:border-box;height:300px;resize:vertical;border:none;outline:none;
  background:transparent;color:#dfe3ea;font-size:12.5px;line-height:1.85;padding:14px;font-family:inherit}
.ccv-text-empty{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:6px 4px 10px}
.ccv-text-lines{font-size:34px;color:#3a4150;line-height:1;margin-bottom:2px}
.ccv-text-try{font-size:12px;color:#7b818b;margin:2px 0 4px}
.ccv-text-act{display:flex;align-items:center;gap:8px;background:transparent;border:none;color:#b8bec9;
  font-size:12.5px;padding:4px 2px;cursor:pointer}
.ccv-text-act:hover{color:#e6e9ef}
.ccv-text-dot{font-size:10px;color:#6f7681}
.ccv-videobox{position:relative;width:100%;height:100%}
.ccv-videomask{position:absolute;left:0;right:0;top:0;bottom:56px;z-index:2;cursor:default}
.ccv-ta:focus{border-color:#3a4250}
.ccv-row{display:flex;align-items:center;gap:6px;margin-top:7px;flex-wrap:wrap}
.ccv-spacer{flex:1}
.ccv-hint{font-size:11px;color:${T.dim}}
.ccv-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
.ccv-err{padding:8px 10px;border-radius:9px;background:#241417;border:1px solid #5c2a31;color:#ffb3ba;font-size:12px;white-space:pre-wrap}
.ccv-zoom{position:absolute;right:12px;bottom:12px;display:flex;gap:6px;align-items:center;z-index:15}
.ccv-mini{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:7px;
  border:1px solid ${T.border};background:rgba(20,22,26,.92);color:#c9ced8;cursor:pointer;font-size:13px}

.ccv-onboard{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);z-index:12;
  background:rgba(16,16,19,.9);border:1px solid #26262c;border-radius:14px;padding:18px 20px;max-width:520px}
.ccv-onboard-title{font-size:13px;color:#e8e8ec;margin-bottom:10px}
.ccv-onboard-steps{display:flex;flex-direction:column;gap:8px}
.ccv-onboard-step{display:flex;gap:10px;align-items:flex-start;font-size:12px;color:#9d9da5;line-height:1.7}
.ccv-onboard-n{flex:0 0 18px;height:18px;border-radius:50%;background:#23232a;color:#cfcfd6;
  font-size:11px;display:flex;align-items:center;justify-content:center}
.ccv-onboard-actions{display:flex;gap:8px;margin-top:14px}
.ccv-status{position:absolute;left:10px;bottom:10px;font-size:11px;color:${T.dim};z-index:15}
`;

		function useCss(id) {
			useEffect(() => {
				if (document.getElementById(id)) return;
				const el = document.createElement("style");
				el.id = id; el.textContent = css;
				document.head.appendChild(el);
			}, [id]);
		}

		function CanvasApp() {
			useCss("ccv-style");
			const [projects, setProjects] = useState([]);
			const [current, setCurrent] = useState(null);
			const [nodes, setNodes] = useState([]);
			const [edges, setEdges] = useState([]);
			const [vp, setVp] = useState({ x: 0, y: 0, zoom: 1 });
			const [selected, setSelected] = useState(null);
			const [prompt, setPrompt] = useState("");
			const [model, setModel] = useState("qwen-t2i-fast");
			const [aspect, setAspect] = useState("1:1");
			const [count, setCount] = useState(1);
			const [seed, setSeed] = useState("");
			const [resolution, setResolution] = useState("1K");
			const [duration, setDuration] = useState(6);
			const [videoRes, setVideoRes] = useState("480p");
			const [expanded, setExpanded] = useState(false);
			const [health, setHealth] = useState({ ok: false });
			const [busy, setBusy] = useState("");
			const [error, setError] = useState("");
			const [menu, setMenu] = useState(null);
			const [preview, setPreview] = useState(null);
			const [stale, setStale] = useState(null);
			const [queue, setQueue] = useState({ running: null, queue: [] });
			const [vram, setVram] = useState(null);
			const [stripOpen, setStripOpen] = useState(false);
			const [queueOpen, setQueueOpen] = useState(false);
			const [assetFilter, setAssetFilter] = useState("all");
			const [findRes, setFindRes] = useState(null);
			const [wfRes, setWfRes] = useState(null);
			const [bindings, setBindings] = useState([]);
			const [bindingDefaults, setBindingDefaults] = useState({});
			const [p1busy, setP1busy] = useState("");
			const [p1msg, setP1msg] = useState("");
			const [assetQuery, setAssetQuery] = useState("");
			const [jobHistory, setJobHistory] = useState([]);
			const [view, setView] = useState("home");
			const [projMenu, setProjMenu] = useState(false);
			const [page, setPage] = useState("home");
			const [sideCollapsed, setSideCollapsed] = useState(false);
			const [diag, setDiag] = useState(null);
			const [diagLoading, setDiagLoading] = useState(false);
			const [allAssets, setAllAssets] = useState([]);
			const [globalAssetFilter, setGlobalAssetFilter] = useState("all");
			const [playingId, setPlayingId] = useState(null);
			const [editingTextId, setEditingTextId] = useState(null);
			const videoRefs = useRef({});
			const [assetsOpen, setAssetsOpen] = useState(false);
			const [assets, setAssets] = useState([]);
			const [canvasRev, setCanvasRev] = useState(1);
			const [slotPicker, setSlotPicker] = useState(null);
			const [editingName, setEditingName] = useState(null);
			const [linking, setLinking] = useState(null);
			const [linkPos, setLinkPos] = useState(null);
			const historyRef = useRef([]);
		const redoRef = useRef([]);
			const [canUndo, setCanUndo] = useState(false);
			const dragRef = useRef(null);
			const stageRef = useRef(null);
			const taRef = useRef(null);
			const nodesRef = useRef([]);
			const edgesRef = useRef([]);
			useEffect(() => { nodesRef.current = nodes; }, [nodes]);
			useEffect(() => { edgesRef.current = edges; }, [edges]);

			const sel = nodes.find((n) => n.id === selected) || null;

			const pushHistory = useCallback(() => {
				historyRef.current.push({
					nodes: JSON.parse(JSON.stringify(nodesRef.current)),
					edges: JSON.parse(JSON.stringify(edgesRef.current)),
				});
				if (historyRef.current.length > 40) historyRef.current.shift();
				redoRef.current = [];
				setCanUndo(true);
			}, []);

			const persist = useCallback(async (nextNodes, nextEdges, nextVp) => {
				if (!current) return;
				const res = await api("canvas.save", {
					id: current.id,
					baseRev: canvasRev,
					canvas: {
						nodes: nextNodes ?? nodesRef.current,
						edges: nextEdges ?? edgesRef.current,
						viewport: nextVp || vp,
					},
				}).catch(() => null);
				if (res?.rev) setCanvasRev(res.rev);
				if (res?.conflict) {
					const c = await api("canvas.get", { id: current.id }).catch(() => null);
					if (c?.canvas) {
						setCanvasRev(Number(c.canvas.rev) || 1);
						// 用最新 rev 重试一次本次写入（用户刚做的删除/移动不能被丢掉）
						const retry = await api("canvas.save", {
							id: current.id,
							baseRev: Number(c.canvas.rev) || 1,
							canvas: {
								nodes: nextNodes ?? nodesRef.current,
								edges: nextEdges ?? edgesRef.current,
								viewport: nextVp || vp,
							},
						}).catch(() => null);
						if (retry?.rev) setCanvasRev(retry.rev);
						if (retry?.conflict) {
							setNodes(c.canvas.nodes || []);
							setEdges(c.canvas.edges || []);
							setError("画布已被其他人修改，已重新载入");
						}
					}
				}
			}, [current, vp]);

			const undo = useCallback(() => {
				const prev = historyRef.current.pop();
				setCanUndo(historyRef.current.length > 0);
				if (!prev) return;
				redoRef.current.push({
					nodes: JSON.parse(JSON.stringify(nodesRef.current)),
					edges: JSON.parse(JSON.stringify(edgesRef.current)),
				});
				setNodes(prev.nodes);
				setEdges(prev.edges);
				setSelected(null);
				persist(prev.nodes, prev.edges);
			}, [persist]);

			const redo = useCallback(() => {
				const next = redoRef.current.pop();
				if (!next) return;
				historyRef.current.push({
					nodes: JSON.parse(JSON.stringify(nodesRef.current)),
					edges: JSON.parse(JSON.stringify(edgesRef.current)),
				});
				setCanUndo(true);
				setNodes(next.nodes);
				setEdges(next.edges);
				persist(next.nodes, next.edges);
			}, [persist]);


			useEffect(() => {
				let alive = true;
				const check = async () => {
					try {
						const v = await api("version");
						const needRestart = v.hostMtime > v.bootAt;
						const needRefresh = v.clientMtime > CLIENT_LOADED_AT;
						if (alive) setStale(needRestart ? "restart" : needRefresh ? "refresh" : null);
					} catch {}
				};
				check();
				const timer = setInterval(check, 15000);
				return () => { alive = false; clearInterval(timer); };
			}, []);

			useEffect(() => {
				let alive = true;
				const tick = async () => {
					try {
						const r = await api("job.list");
						if (alive) setQueue({ running: r.running || null, queue: r.queue || [] });
					} catch {}
				};
				tick();
				const t = setInterval(tick, 4000);
				return () => { alive = false; clearInterval(t); };
			}, []);

			useEffect(() => {
				if (!current) return;
				let alive = true;
				const timer = setInterval(async () => {
					const ae = document.activeElement;
					const typing = ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA") && ae.closest(".ccv-root");
					if (!alive || busy || menu || editingName || typing) return;
					try {
						const r = await api("canvas.get", { id: current.id });
						const rev = Number(r.canvas?.rev) || 1;
						if (rev !== canvasRev) {
							setCanvasRev(rev);
							setNodes(r.canvas.nodes || []);
							setEdges(r.canvas.edges || []);
						}
					} catch {}
				}, 3000);
				return () => { alive = false; clearInterval(timer); };
			}, [current, canvasRev, busy, menu, editingName]);

			useEffect(() => {
				let alive = true;
				(async () => {
					try {
						const r = await api("project.list");
						let list = r.projects || [];
						if (!list.length) {
							const c = await api("project.create", { name: "新项目" });
							list = [c.project];
						}
						if (!alive) return;
						setProjects(list);
					} catch (e) { setError(String(e.message || e)); }
					try {
						const hr = await api("health");
						if (alive) setHealth(hr);
					} catch (e) { if (alive) setHealth({ ok: false, error: String(e.message || e) }); }
				})();
				return () => { alive = false; };
			}, []);

			useEffect(() => {
				if (!current) return;
				let alive = true;
				api("canvas.get", { id: current.id }).then((r) => {
					if (!alive) return;
					setCanvasRev(Number(r.canvas.rev) || 1);
					setNodes((r.canvas.nodes || []).map((n) => {
						if (n.type === "script") {
							const cols = (n.data?.columns || []).slice();
							for (const def of SCRIPT_COLUMNS) {
								if (!cols.some((c) => c.key === def.key)) cols.push({ ...def });
							}
							return { ...n, data: { ...n.data, columns: cols } };
						}
						return { ...n, w: 320 };
					}));
					setEdges(r.canvas.edges || []);
					setVp(r.canvas.viewport || { x: 0, y: 0, zoom: 1 });
					setSelected(null);
				}).catch((e) => setError(String(e.message || e)));
				return () => { alive = false; };
			}, [current]);

			useEffect(() => {
				const onKey = (e) => {
					const tag = (document.activeElement?.tagName || "").toLowerCase();
					if (tag === "textarea" || tag === "input" || tag === "select") return;
					if (e.key === "Escape") {
						if (preview) { setPreview(null); return; }
						if (projMenu) { setProjMenu(false); return; }
						if (menu) { setMenu(null); return; }
					}
					if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
						e.preventDefault();
						redo();
						return;
					}
					if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
						e.preventDefault();
						undo();
						return;
					}
					if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d" && selected) {
						e.preventDefault();
						pushHistory();
						const src = nodes.find((n) => n.id === selected);
						if (src) {
							const id = `n-${Date.now().toString(36)}`;
							const copy = { ...src, id, x: src.x + 44, y: src.y + 44,
								data: { ...(src.data || {}), assetId: null, title: (src.data?.title || "节点") + " 副本" } };
							const nn = [...nodes, copy];
							setNodes(nn); setSelected(id); persist(nn, edges);
						}
						return;
					}
					if (e.key === "Escape" && !preview && !projMenu && !menu && selected) {
						setSelected(null);
						return;
					}
					if ((e.key === "Delete" || e.key === "Backspace") && selected) {
						e.preventDefault();
						pushHistory();
						const nn = nodes.filter((n) => n.id !== selected);
						const ne = edges.filter((x) => x.from !== selected && x.to !== selected);
						setNodes(nn); setEdges(ne); setSelected(null); persist(nn, ne);
					}
				};
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [selected, nodes, edges, persist, undo, pushHistory]);

			const onWheel = (e) => {
				e.preventDefault();
				const rect = stageRef.current?.getBoundingClientRect();
				if (!rect) return;
				const px = e.clientX - rect.left, py = e.clientY - rect.top;
				const factor = e.deltaY > 0 ? 0.92 : 1.08;
				const z = Math.min(2.5, Math.max(0.2, vp.zoom * factor));
				const k = z / vp.zoom;
				setVp({ x: px - (px - vp.x) * k, y: py - (py - vp.y) * k, zoom: z });
			};

			const onStageDown = (e) => {
				if (e.target !== e.currentTarget) return;
				if (menu) { setMenu(null); return; }
				setSelected(null);
				dragRef.current = { mode: "pan", sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y };
			};

			const onCardDown = (e, node) => {
				e.stopPropagation();
				if (menu) { setMenu(null); }
				setSelected(node.id);
				setPrompt(node.data?.prompt || "");
				setModel(node.data?.model || model);
				setAspect(node.data?.aspect || aspect);
				setVideoRes(node.data?.videoRes || videoRes);
				setCount(node.data?.count || count);
				pushHistory();
				dragRef.current = { mode: "node", id: node.id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y };
			};

			const onMove = (e) => {
				const d = dragRef.current;
				if (!d) return;
				if (d.mode === "dot") {
					const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy);
					if (dist < 6) return;
					const rect = stageRef.current?.getBoundingClientRect();
					if (!rect) return;
					setLinking(d.id);
					setLinkPos({
						x: (e.clientX - rect.left - vp.x) / vp.zoom,
						y: (e.clientY - rect.top - vp.y) / vp.zoom,
					});
					return;
				}
				const dx = (e.clientX - d.sx) / vp.zoom;
				const dy = (e.clientY - d.sy) / vp.zoom;
				if (d.mode === "pan") setVp((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
				else setNodes((ns) => ns.map((n) => n.id === d.id ? { ...n, x: d.ox + dx, y: d.oy + dy } : n));
			};

			const onUp = (e) => {
				const mode = dragRef.current?.mode;
				const dotId = dragRef.current?.id;
				dragRef.current = null;
				if (mode === "dot") {
					if (linking) {
						const el = document.elementFromPoint(e.clientX, e.clientY);
						const cardEl = el?.closest?.("[data-node]");
						const target = cardEl?.getAttribute("data-node") || null;
						setLinking(null); setLinkPos(null);
						if (target) finishLink(target);
					} else {
						const src = nodes.find((n) => n.id === dotId);
						if (src) {
							const cs2 = cardSize(src);
							const wx = src.x + cs2.w + 140, wy = src.y;
							setMenu({ x: wx * vp.zoom + vp.x, y: wy * vp.zoom + vp.y,
								world: { x: wx, y: wy }, linkFrom: src.id, side: "right" });
						}
					}
					return;
				}
				if (mode === "node") persist(nodes, edges);
				if (mode === "pan") persist(nodes, edges, vp);
			};

			/** 结束连线：落在另一张卡片上就建边。 */
			const finishLink = (targetId) => {
				const src = linking;
				setLinking(null);
				if (!src || !targetId || src === targetId) return;
				if (edges.some((e) => e.from === src && e.to === targetId)) return;
				pushHistory();
				const ne = [...edges, { id: `e-${Date.now().toString(36)}`, from: src, to: targetId }];
				setEdges(ne);
				persist(nodesRef.current, ne);
			};

			const addNode = (type = "image", at = null) => {
				pushHistory();
				const n = {
					id: `n-${Date.now().toString(36)}`, type,
					x: at ? at.x : 80 + (nodes.length % 4) * 70,
					y: at ? at.y : 80 + (nodes.length % 4) * 60,
					w: 320, h: 320,
					data: { prompt: "", model, aspect, count, status: "idle" },
				};
				if (type === "script") { Object.assign(n, makeScriptNode(n.x, n.y)); n.id = `n-${Date.now().toString(36)}`; }
				if (type === "text") { Object.assign(n, makeTextNode(n.x, n.y)); n.id = `n-${Date.now().toString(36)}`; }
				if (type === "audio") { Object.assign(n, makeAudioNode(n.x, n.y)); n.id = `n-${Date.now().toString(36)}`; }
				if (type === "text") { Object.assign(n, makeTextNode(n.x, n.y)); n.id = `n-${Date.now().toString(36)}`; }
				if (type === "audio") { Object.assign(n, makeAudioNode(n.x, n.y)); n.id = `n-${Date.now().toString(36)}`; }
				if (type === "video") { n.w = 320; n.h = 420; n.data.aspect = "9:16"; }
				if (type === "script") { Object.assign(n, makeScriptNode(n.x, n.y)); n.id = `n-${Date.now().toString(36)}`; }
				const nn = [...nodes, n];
				setNodes(nn); setSelected(n.id); setPrompt(""); persist(nn, edges);
			};

			const addChild = (from, side, type = "image") => {
				pushHistory();
				const src = nodes.find((n) => n.id === from);
				if (!src) return;
				const cs = cardSize(src);
				const n = {
					id: `n-${Date.now().toString(36)}`, type,
					x: side === "right" ? src.x + cs.w + 140 : src.x - 460,
					y: src.y,
					w: 320, h: 320,
					data: { prompt: "", model, aspect, count, status: "idle" },
				};
				if (type === "video") { n.w = 320; n.h = 420; n.data.aspect = "9:16"; }
				const edge = { id: `e-${Date.now().toString(36)}`, from: src.id, to: n.id };
				const nn = [...nodes, n];
				const ne = [...edges, edge];
				setNodes(nn); setEdges(ne); setSelected(n.id); setPrompt("");
				persist(nn, ne);
			};

			const speakText = async (n) => {
				if (!current) return;
				const content = (n?.data?.content || "").trim();
				if (!content) { setError("文本为空，先写点东西"); return; }
				try {
					setBusy("合成语音中…");
					const audio = makeAudioNode(n.x + 460, n.y);
					audio.data.title = (n.data.title || "文本") + " · 语音";
					audio.data.text = content;
					const nn = [...nodes, audio];
					setNodes(nn);
					const r = await api("audio.speech", { projectId: current.id, nodeId: audio.id, text: content });
					if (r.status === "failed") throw new Error(r.error || "语音合成失败");
					if (r.asset) {
						const nn2 = nn.map((x) => x.id === audio.id ? { ...x, data: { ...x.data, file: r.asset.file, assetId: r.asset.id, status: "done" } } : x);
						setNodes(nn2);
						persist(nn2, edges);
					}
					setBusy("");
				} catch (e) { setBusy(""); setError(String(e.message || e)); }
			};

			/** 平台规格自检（短剧类：竖屏、≤60s、≤500MB） */
			const specIssues = (n) => {
				const out = [];
				const w = n?.data?.width;
				const h = n?.data?.height;
				const sec = n?.data?.durationSec;
				const mb = n?.data?.sizeMB;
				if (w && h && h <= w) out.push("不是竖屏（建议 9:16）");
				if (sec && sec > 60.5) out.push(`时长 ${sec.toFixed(1)}s 超过 60 秒`);
				if (mb && mb > 500) out.push(`体积 ${mb} MB 超过 500 MB`);
				return out;
			};

			/** 把视口移到某个节点并选中（用于血缘跳转） */
			const focusNode = (id) => {
				const n = nodes.find((x) => x.id === id);
				if (!n) return;
				const cs = cardSize(n);
				const rect = stageRef.current?.getBoundingClientRect();
				const w = rect?.width || 800;
				const h = rect?.height || 600;
				const zoom = vp.zoom || 1;
				setVp({ x: w / 2 - (n.x + cs.w / 2) * zoom, y: h / 2 - (n.y + cs.h / 2) * zoom, zoom });
				setSelected(id);
			};

			/** 接一镜：抽上一镜末帧 → 建图片节点 → 建视频节点（链路已连好）→ 填提示词等 Enter */
			const cancelNodeJob = async (n) => {
				const jobId = n?.data?.jobId;
				if (!jobId) return;
				try {
					await api("job.cancel", { jobId });
					setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "idle" } } : x));
					setError("已取消");
				} catch (e) { setError(String(e.message || e)); }
			};

			const retryNode = async (n) => {
				if (!current) return;
				const p = String(n?.data?.prompt || "").trim();
				if (!p) { setError("这条没有提示词，无法重试"); return; }
				try {
					setBusy("重新提交…");
					setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "queued" } } : x));
					const r = n.type === "video"
						? await api("gen.video", {
							projectId: current.id, nodeId: n.id, prompt: p,
							duration: Number(n.data?.duration) || 4,
							aspect: n.data?.aspect || "9:16",
							resolution: videoRes, refFiles: refsOf(n.id),
						})
						: await api("gen.image", {
							projectId: current.id, nodeId: n.id, prompt: p,
							model, aspect: n.data?.aspect || aspect, count,
							resolution, refFiles: refsOf(n.id),
						});
					setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, jobId: r.jobId } } : x));
					pollJob(r.jobId, n.id);
				} catch (e) { setBusy(""); setError(String(e.message || e)); }
			};

			const continueShot = async (n) => {
				if (!current || !n?.data?.file) return;
				try {
					setBusy("接镜中…");
					const imgId = `n-${Date.now().toString(36)}`;
					const vidId = `n-${(Date.now() + 2).toString(36)}`;
					const imgNode = { id: imgId, type: "image", x: n.x + 380, y: n.y, w: 320, h: 320,
						data: { status: "queued", title: "上一镜末帧" } };
					const vidNode = { id: vidId, type: "video", x: n.x + 760, y: n.y, w: 320, h: 420,
						data: { prompt: "", status: "idle", aspect: n.data?.aspect || "9:16" } };
					const nn0 = [...nodes, imgNode, vidNode];
					const ee0 = [...edges,
						{ id: `e-${imgId}`, from: n.id, to: imgId },
						{ id: `e-${vidId}`, from: imgId, to: vidId }];
					setNodes(nn0); setEdges(ee0); setSelected(vidId); persist(nn0, ee0);
					const r = await api("video.frame", {
						projectId: current.id, nodeId: imgId, sourceNodeId: n.id,
						file: n.data.file, at: "last",
					});
					if (r.status === "failed") throw new Error(r.error || "抽帧失败");
					const nn1 = nn0.map((x) => x.id === imgId
						? { ...x, data: { ...x.data, file: r.asset?.file, assetId: r.asset?.id, status: "done" } } : x);
					setNodes(nn1); persist(nn1, ee0);
					setPrompt("延续这个镜头的动作与环境氛围，自然衔接上一镜结尾");
					setBusy("");
					showToast("已抽上一镜末帧并连好链路，按 Enter 生成下一镜");
				} catch (e) { setBusy(""); setError(String(e.message || e)); }
			};

			const extractFrame = async (n) => {
				if (!current || !n?.data?.file) return;
				try {
					setBusy("抽帧中…");
					const id = `n-${Date.now().toString(36)}`;
					const node0 = { id, type: "image", x: n.x + 360, y: n.y, w: 320, h: 320,
						data: { status: "queued", title: "末帧" } };
					const nn0 = [...nodes, node0];
					const ee0 = [...edges, { id: `e-${id}`, from: n.id, to: id }];
					setNodes(nn0); setEdges(ee0); setSelected(id); persist(nn0, ee0);
					const r = await api("video.frame", {
						projectId: current.id, nodeId: id, sourceNodeId: n.id,
						file: n.data.file, at: "last",
					});
					if (r.status === "failed") throw new Error(r.error || "抽帧失败");
					if (r.asset) {
						const nn1 = nn0.map((x) => x.id === id
							? { ...x, data: { ...x.data, file: r.asset.file, assetId: r.asset.id, status: "done", width: 480, height: 864 } }
							: x);
						setNodes(nn1); persist(nn1, ee0);
					}
					setBusy("");
				} catch (e) { setBusy(""); setError(String(e.message || e)); }
			};

			const upscaleVideo = async (n) => {
				if (!current || !n?.data?.file) return;
				try {
					setBusy("视频超分中…");
					const r = await api("video.upscale", { projectId: current.id, nodeId: n.id, file: n.data.file });
					if (r.status === "failed") throw new Error(r.error || "视频超分失败");
					await openProject(current);
					setBusy("");
				} catch (e) { setBusy(""); setError(String(e.message || e)); }
			};

			const upscaleNode = async (n) => {
				if (!current || !n?.data?.file) return;
				try {
					setBusy("超分中…");
					const r = await api("image.upscale", { projectId: current.id, nodeId: n.id, file: n.data.file });
					pollJob(r.jobId, n.id);
				} catch (e) { setBusy(""); setError(String(e.message || e)); }
			};

			/** 一键关键帧：把分镜表所有行按"生成图片"跑一遍（串行提交，宿主排队） */
			const scriptKeyframesAll = async (node) => {
				if (!current) return;
				const rows = (node.data.groups || []).flatMap((g) => (g.rows || []).map((r) => ({ g: g.id, r: r.id })));
				if (!rows.length) { setError("分镜表还没有镜头行"); return; }
				setBusy(`提交关键帧 0/${rows.length}`);
				const patched = { ...node, data: { ...node.data, target: "image" } };
				for (let i = 0; i < rows.length; i++) {
					const { g, r } = rows[i];
					try { await scriptGenerateRow(patched, g, r); } catch {}
					setBusy(`提交关键帧 ${i + 1}/${rows.length}`);
					await new Promise((res) => setTimeout(res, 350));
				}
				setBusy("");
			};

			const loadAssets = useCallback(async () => {
				if (!current) return;
				try {
					const r = await api("asset.list", { id: current.id });
					setAssets(r.assets || []);
				} catch {}
			}, [current]);

			useEffect(() => { if (assetsOpen) loadAssets(); }, [assetsOpen, loadAssets]);

			/** 把资产放回画布（新建一个引用节点） */
			const placeAsset = (asset) => {
				const rect = stageRef.current?.getBoundingClientRect();
				const cx = rect ? (rect.width / 2 - vp.x) / vp.zoom : 200;
				const cy = rect ? (rect.height / 2 - vp.y) / vp.zoom : 200;
				const w = 320;
				const ratio = asset.params?.width && asset.params?.height
					? asset.params.height / asset.params.width : 1;
				const node = {
					id: `n-${Date.now().toString(36)}`,
					type: asset.kind === "video" ? "video" : "image",
					x: Math.round(cx + nodes.length * 12), y: Math.round(cy + nodes.length * 12),
					w, h: Math.max(200, Math.round(w * ratio)),
					data: {
						file: asset.file, kind: asset.kind, status: "done",
						prompt: asset.prompt, model: asset.model,
						width: asset.params?.width, height: asset.params?.height,
					},
				};
				pushHistory();
				const nn = [...nodes, node];
				setNodes(nn); setSelected(node.id); persist(nn, edges);
			};

			const updateNodeData = (nodeId, mutate) => {
				setNodes((ns) => ns.map((n) => {
					if (n.id !== nodeId) return n;
					const d = { ...(n.data || {}) };
					mutate(d);
					return { ...n, data: d };
				}));
			};

			const updateScript = (nodeId, mutate) => {
				setNodes((ns) => ns.map((n) => {
					if (n.id !== nodeId || n.type !== "script") return n;
					const data = JSON.parse(JSON.stringify(n.data));
					mutate(data);
					return { ...n, data };
				}));
			};

			const commitScript = () => persist();

			const bindRowAsset = (nodeId, groupId, rowId, role, assetId) => updateScript(nodeId, (dd) => {
				const gg = dd.groups.find((x) => x.id === groupId);
				const rr = gg?.rows.find((x) => x.id === rowId);
				if (!rr) return;
				rr.assets = rr.assets || { characters: [], scene: null, props: [] };
				if (role === "scene") rr.assets.scene = assetId;
				else {
					const list = role === "prop" ? (rr.assets.props = rr.assets.props || []) : (rr.assets.characters = rr.assets.characters || []);
					const i = list.indexOf(assetId);
					if (i >= 0) list.splice(i, 1);
					else list.push(assetId);
				}
			});

			const scriptAddRow = (nodeId, groupId) => updateScript(nodeId, (d) => {
				const g = d.groups.find((x) => x.id === groupId);
				if (!g) return;
				const n = g.rows.length + 1;
				g.rows.push({
					id: `r-${Date.now().toString(36)}`,
					cells: { shot: `S${String(n).padStart(2, "0")}`, dur: "6", size: "中景", move: "固定",
						desc: "", light: "", line: "", sound: "", prompt: "" },
				});
			});

			const scriptDuplicateRow = (nodeId, groupId, rowId) => updateScript(nodeId, (d) => {
				const g = d.groups.find((x) => x.id === groupId);
				const i = g?.rows.findIndex((x) => x.id === rowId) ?? -1;
				if (!g || i < 0) return;
				const src = g.rows[i];
				const copy = JSON.parse(JSON.stringify(src));
				copy.id = `r-${Date.now().toString(36)}`;
				g.rows.splice(i + 1, 0, copy);
			});

			const scriptDeleteRow = (nodeId, groupId, rowId) => updateScript(nodeId, (d) => {
				const g = d.groups.find((x) => x.id === groupId);
				if (!g) return;
				g.rows = g.rows.filter((x) => x.id !== rowId);
			});

			const scriptAddGroup = (nodeId) => updateScript(nodeId, (d) => {
				d.groups.push({
					id: `g-${Date.now().toString(36)}`,
					title: `场 ${d.groups.length + 1}`,
					scene: "", light: "", sound: "", rows: [],
				});
			});

			const scriptGenerateRow = async (node, groupId, rowId) => {
				const g = node.data.groups.find((x) => x.id === groupId);
				const row = g?.rows.find((r) => r.id === rowId);
				if (!g || !row) return;
				const idx = (node.data.groups.flatMap((x) => x.rows).findIndex((r) => r.id === rowId) + 1) || 1;
				const orderedAssets = [
					...(row.assets?.characters || []).slice(0, 2).map((id) => ({ id, role: "character" })),
					...(row.assets?.scene ? [{ id: row.assets.scene, role: "scene" }] : []),
					...(row.assets?.props || []).slice(0, 2).map((id) => ({ id, role: "prop" })),
				].slice(0, 4)
					.map((a) => {
						const nd = nodes.find((x) => x.id === a.id);
						return nd ? { ...a, name: assetName(nd), desc: assetDesc(nd), node: nd } : null;
					})
					.filter(Boolean);
				const prompt = composeRowPrompt(g, row, idx, orderedAssets);
				const isVideo = (node.data.target || "video") === "video";
				const dur = Math.max(4, Math.min(12, Number(row.cells?.dur) || 6));
				const nx = node.x + SCRIPT_W + 80;
				const ny = node.y + 40 + idx * 20;
				const child = {
					id: `n-${Date.now().toString(36)}`,
					type: isVideo ? "video" : "image",
					x: nx, y: ny, w: 320, h: isVideo ? 420 : 320,
					data: { prompt, model, aspect: isVideo ? "9:16" : "1:1", count: 1, status: "queued" },
				};
				pushHistory();
				const ra = row.assets || { characters: [], scene: null, props: [] };
				const ordered = [
					...(ra.characters || []).slice(0, 2),
					...(ra.scene ? [ra.scene] : []),
					...(ra.props || []).slice(0, 2),
				].slice(0, 4);
				const refEdges = ordered
					.filter((id) => nodes.some((x) => x.id === id && x.data?.file))
					.map((id, i) => ({ id: `e-ref-${Date.now().toString(36)}-${i}`, from: id, to: child.id }));
				const nn = [...nodes, child];
				const ne = [...edges, ...refEdges];
				setNodes(nn); setEdges(ne);
				setSelected(child.id);
				await persist(nn, ne);
				// 只生成"待生成"的卡片：提示词与参数已就绪，由用户确认后再点生成
				return child.id;
			};

			const pollJob = useCallback((jobId, nodeId) => {
				const tick = async () => {
					try {
						const r = await api("job.get", { jobId });
						const job = r.job;
						if (job.status === "running" || job.status === "queued") {
							setNodes((ns) => ns.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: job.status } } : n));
							setTimeout(tick, 1500);
							return;
						}
						setBusy("");
						if (job.status === "failed") {
							setNodes((ns) => ns.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: "failed" } } : n));
							setError(job.error || "生成失败");
							return;
						}
						if (job.status === "canceled" || job.status === "canceling") {
							setNodes((ns) => ns.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: "idle" } } : n));
							setError("已取消");
							return;
						}
						if (current) {
							const c = await api("canvas.get", { id: current.id });
							setNodes(c.canvas.nodes || []); setEdges(c.canvas.edges || []);
							if (assetsOpen) void loadAssets();
						}
					} catch (e) { setBusy(""); setError(String(e.message || e)); }
				};
				tick();
			}, [current]);

			/** 上游连线（= 参考图） */
			const insertToken = (index, kind = "picture") => {
				const ta = taRef.current;
				const token = kind === "image" ? `<image${index}> ` : `<Picture ${index}> `;
				if (!ta) { setPrompt((v) => v + token); return; }
				const start = ta.selectionStart ?? prompt.length;
				const end = ta.selectionEnd ?? start;
				const next = prompt.slice(0, start) + token + prompt.slice(end);
				setPrompt(next);
				setTimeout(() => {
					ta.focus();
					ta.selectionStart = ta.selectionEnd = start + token.length;
				}, 0);
			};

			const refsOf = (nodeId) => {
				if (!nodeId) return [];
				return edges
					.filter((e) => e.to === nodeId)
					.map((e) => nodes.find((n) => n.id === e.from))
					.map((n) => n?.data?.file)
					.filter(Boolean);
			};

			const validateRefs = (nodeId, text) => {
				const refs = refsOf(nodeId);
				if (!refs.length) return null;
				const idx = [
					...text.matchAll(/<Picture\s+(\d+)>/gi),
					...text.matchAll(/<image\s*(\d+)>/gi),
				].map((m) => Number(m[1]));
				const bad = idx.filter((n) => n < 1 || n > refs.length);
				if (bad.length) {
					return `提示词引用了 <Picture ${bad[0]}>，但这条只连接了 ${refs.length} 张参考图。`;
				}
				return null;
			};

			const generate = async () => {
				if (!current || !prompt.trim() || busy) return;
				let nodeId = selected;
				const target = nodes.find((n) => n.id === nodeId);
				const isVideo = target?.type === "video";
				const finalPrompt = prompt;
				const refErr = validateRefs(nodeId, finalPrompt);
				if (refErr) { setError(refErr); return; }
				let nn = nodes;
				if (!nodeId) {
					const n = { id: `n-${Date.now().toString(36)}`, type: "image",
						x: 80 + (nodes.length % 4) * 70, y: 80 + (nodes.length % 4) * 60, w: 320, h: 320,
						data: { prompt, model, aspect, count, status: "queued" } };
					nn = [...nodes, n]; nodeId = n.id;
					setNodes(nn); setSelected(nodeId);
				} else {
					nn = nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, prompt, model, aspect, count, videoRes, status: "queued" } } : n);
					setNodes(nn);
				}
				await persist(nn, edges);
				setBusy("提交中…"); setError("");
				try {
					const r = isVideo ? await api("gen.video", {
						projectId: current.id, nodeId, prompt: finalPrompt,
						duration, aspect,
						resolution: videoRes, refFiles: refsOf(nodeId),
					}) : await api("gen.image", {
						projectId: current.id, nodeId, prompt, model, aspect, count,
						seed: seed === "" ? undefined : Number(seed),
						resolution,
						refFiles: refsOf(nodeId),
					});
					setBusy("生成中…");
					setNodes((ns) => ns.map((x) => x.id === nodeId ? { ...x, data: { ...x.data, jobId: r.jobId } } : x));
					pollJob(r.jobId, nodeId);
				} catch (e) { setBusy(""); setError(String(e.message || e)); }
			};

			const openProject = async (p) => {
				setCurrent(p);
				setView("canvas");
				setTimeout(() => { loadAssets().catch(() => {}); }, 50);
			};

			const newProject = async () => {
				const r = await api("project.create", { name: `项目 ${projects.length + 1}` });
				setProjects([r.project, ...projects]); setCurrent(r.project); setView("canvas");
			};
			const renameProject = async () => {
				if (!current) return;
				const n = window.prompt("项目名称", current.name);
				if (!n) return;
				const r = await api("project.rename", { id: current.id, name: n });
				setProjects(projects.map((p) => p.id === r.project.id ? r.project : p));
				setCurrent(r.project);
			};
			const deleteProject = async () => {
				if (!current) return;
				if (!window.confirm(`删除项目「${current.name}」及其所有素材？`)) return;
				await api("project.delete", { id: current.id });
				const rest = projects.filter((p) => p.id !== current.id);
				if (rest.length) { setProjects(rest); setCurrent(rest[0]); }
				else { const r = await api("project.create", { name: "新项目" }); setProjects([r.project]); setCurrent(r.project); }
			};
			const fit = () => {
				if (!nodes.length) { setVp({ x: 0, y: 0, zoom: 1 }); return; }
				const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
				const maxX = Math.max(...nodes.map((n) => n.x + n.w)), maxY = Math.max(...nodes.map((n) => n.y + n.h));
				const rect = stageRef.current?.getBoundingClientRect();
				if (!rect) return;
				const z = Math.min(1.2, Math.max(0.2, Math.min((rect.width - 80) / (maxX - minX), (rect.height - 80) / (maxY - minY))));
				setVp({ x: (rect.width - (maxX - minX) * z) / 2 - minX * z, y: (rect.height - (maxY - minY) * z) / 2 - minY * z, zoom: z });
			};

			const floatStyle = (() => {
				if (!sel || sel.type === "script" || sel.type === "text") return null;
				const x = sel.x * vp.zoom + vp.x;
				const cs = cardSize(sel);
				const cardW = cs.w * vp.zoom;
				const y = (sel.y + cs.h) * vp.zoom + vp.y + 10;
				const width = expanded ? Math.max(640, Math.min(820, cardW)) : Math.max(470, Math.min(620, cardW));
				const rect = stageRef.current?.getBoundingClientRect();
				const maxW = rect ? rect.width - 24 : 620;
				const w = Math.min(width, maxW);
				// 与卡片水平居中对齐（再夹在可视区内）
				const centered = x + (cardW - w) / 2;
				return { left: Math.max(12, Math.min(centered, maxW + 12 - w)), top: y, width: w };
			})();

			const quickStart = async (kind) => {
				let proj = current || projects[0];
				if (!proj) {
					const r = await api("project.create", { name: "未命名项目" });
					proj = r.project;
					setProjects([proj, ...projects]);
				}
				setCurrent(proj);
				setView("canvas");
				setTimeout(() => {
					addNode(kind, { x: 160, y: 160 });
				}, 160);
			};

			const loadDiag = async () => {
				setDiagLoading(true);
				try { const r = await api("diagnose", {}); setDiag(r); } catch (e) { setDiag({ ok: false, error: String(e.message || e) }); }
				setDiagLoading(false);
			};
			const showToast = (msg) => {
				setToastMsg(msg);
				setTimeout(() => setToastMsg(null), 2600);
			};
			const copyText = async (text) => {
				try {
					if (navigator.clipboard && navigator.clipboard.writeText) {
						await navigator.clipboard.writeText(text);
						return true;
					}
				} catch {}
				try {
					const ta = document.createElement("textarea");
					ta.value = text;
					ta.style.position = "fixed";
					ta.style.left = "-9999px";
					document.body.appendChild(ta);
					ta.select();
					const ok = document.execCommand("copy");
					document.body.removeChild(ta);
					if (ok) return true;
				} catch {}
				// 最后兜底：让宿主用 PowerShell 写系统剪贴板（不受浏览器权限限制）
				try {
					const r = await api("clipboard.set", { text });
					if (r && r.ok) return true;
				} catch {}
				return false;
			};
			const loadFind = async () => {
				setP1busy("find");
				try { const r = await api("comfy.find", {}); setFindRes(r); } catch (e) { setP1msg(String(e.message || e)); }
				setP1busy("");
			};
			const doStartComfy = async (path) => {
				setP1busy("start"); setP1msg("正在启动…（首次可能 30–60 秒）");
				try {
					const r = await api("comfy.start", { path });
					setP1msg(r && r.ok ? `已启动（PID ${r.pid}，${Math.round((r.waitedMs || 0) / 1000)}s）` : "启动失败：" + ((r && r.error) || "未知"));
					await loadDiag();
					await loadFind();
					if (r && r.ok) await loadWorkflows();
				} catch (e) { setP1msg("启动失败：" + String(e.message || e)); }
				setP1busy("");
			};
			const doStopComfy = async () => {
				setP1busy("stop");
				try {
					const r = await api("comfy.stop", {});
					setP1msg(r && r.ok ? "已停止" : "停止失败：" + ((r && r.error) || ""));
					await loadDiag(); await loadFind();
				} catch (e) { setP1msg("停止失败：" + String(e.message || e)); }
				setP1busy("");
			};
			const loadBindings = async () => {
				try {
					const r = await api("binding.list", {});
					setBindings((r && r.bindings) || []);
					setBindingDefaults((r && r.defaults) || {});
				} catch { setBindings([]); setBindingDefaults({}); }
			};
			const loadWorkflows = async () => {
				setP1busy("wf");
				try { const r = await api("workflows.list", {}); setWfRes(r); } catch (e) { setP1msg(String(e.message || e)); }
				setP1busy("");
			};
			const loadAllAssets = async () => {
				try { const r = await api("asset.listAll", {}); setAllAssets((r && r.assets) || []); } catch { setAllAssets([]); }
			};
			useEffect(() => { loadAllAssets().catch(() => {}); }, []);

			// 设置页打开时每 5 秒同步一次绑定状态（AI 写好绑定后无需手动刷新）
			/** 把素材放回它所属的画布（跨项目时先切项目） */
			const placeAssetToProject = async (a) => {
				try {
					const proj = projects.find((p2) => p2.id === a.projectId);
					if (!proj) { setError("找不到这张素材所属的项目"); return; }
					setBusy("放回画布…");
					if (current?.id !== proj.id) await openProject(proj);
					setTimeout(() => {
						try {
							const cur = nodesRef.current || [];
							const type = a.kind === "video" ? "video" : a.kind === "audio" ? "audio" : "image";
							const n = {
								id: `n-${Date.now().toString(36)}`,
								type, x: 120 + (cur.length % 4) * 60, y: 120 + (cur.length % 4) * 40,
								w: 320, h: type === "video" ? 420 : type === "audio" ? 120 : 320,
								data: { file: a.file, assetId: a.id, status: "done", prompt: a.prompt || "", title: a.name || "" },
							};
							const ee = edgesRef.current || [];
							const nn = [...cur, n];
							setNodes(nn);
							persist(nn, ee);
							setSelected(n.id);
							setBusy("");
						} catch (e) { setBusy(""); setError(String(e.message || e)); }
					}, 350);
				} catch (e) { setBusy(""); setError(String(e.message || e)); }
			};

			const exportProject = async (pj) => {
				try {
					setBusy("导出中…");
					const r = await api("project.export", { projectId: pj.id });
					setBusy("");
					if (r.error) { setError(r.error); return; }
					showToast(`已导出 ${r.files} 个文件 → ${r.path}`);
				} catch (e) { setBusy(""); setError(String(e.message || e)); }
			};

			const loadJobs = async () => {
				try {
					const r = await api("job.history", {});
					setJobHistory(r.jobs || []);
				} catch { setJobHistory([]); }
			};

			useEffect(() => {
				if (view !== "canvas") return undefined;
				const tick = () => { api("comfy.status", {}).then((r) => setVram(r || null)).catch(() => setVram(null)); };
				tick();
				const id = setInterval(tick, 10000);
				return () => clearInterval(id);
			}, [view, current?.id]);

			useEffect(() => {
				if (page !== "settings") return undefined;
				loadBindings().catch(() => {});
				loadJobs().catch(() => {});
				const id = setInterval(() => { loadBindings().catch(() => {}); loadJobs().catch(() => {}); }, 5000);
				return () => clearInterval(id);
			}, [page]);

			const navItems = [
				{ id: "home", icon: "⌂", label: "首页" },
				{ id: "projects", icon: "▦", label: "项目" },
				{ id: "assets", icon: "◫", label: "资产" },
				{ id: "settings", icon: "⚙", label: "设置" },
			];
			const sidebarEl = h("div", { className: "ccv-side" + (sideCollapsed ? " mini" : "") },
				h("div", { className: "ccv-side-brand" },
					h("span", { className: "ccv-side-logo" }, "▣"),
					sideCollapsed ? null : h("span", { className: "ccv-side-name" }, "全能画布"),
					h("button", {
						className: "ccv-side-collapse", title: sideCollapsed ? "展开" : "收起",
						onClick: () => setSideCollapsed((v) => !v),
					}, sideCollapsed ? "»" : "«")),
				h("button", { className: "ccv-side-new", title: "新建项目", onClick: newProject }, sideCollapsed ? "＋" : "＋ 新建项目"),
				navItems.map((it) => h("button", {
					key: it.id,
					className: "ccv-side-item" + (view === "home" && page === it.id ? " on" : ""),
					title: it.label,
					onClick: () => {
						setView("home"); setPage(it.id);
						if (it.id === "assets") loadAllAssets();
						if (it.id === "settings") { loadDiag(); loadFind(); loadWorkflows(); loadBindings(); }
					},
				}, h("span", { className: "ccv-side-ico" }, it.icon), sideCollapsed ? null : h("span", null, it.label))),
				h("span", { className: "ccv-side-spacer" }),
				h("div", { className: "ccv-side-foot" },
					sideCollapsed ? null : h("span", { className: "ccv-hint" }, "v0.1.0"),
					h("span", { className: "ccv-dot", style: { background: health.ok ? T.ok : T.bad }, title: health.ok ? "ComfyUI 已连接" : "未连接" })));

			const projectsPage = h("div", { className: "ccv-page" },
				h("div", { className: "ccv-page-head" },
					h("div", { className: "ccv-page-title" }, "项目"),
					h("span", { style: { flex: 1 } }),
					h("button", { className: "ccv-home-cta small", onClick: newProject }, "＋ 新建项目")),
				projects.length
					? h("div", { className: "ccv-projgrid" }, projects.map((pj) => h("button", {
						key: pj.id, className: "ccv-projcard", onClick: () => openProject(pj),
					},
						h("div", { className: "ccv-projcard-thumb" },
							pj.thumb
								? (pj.thumbKind === "video"
									? h("video", { src: `/omni-canvas/media/${pj.id}/${pj.thumb}`, muted: true, preload: "metadata" })
									: h("img", { src: `/omni-canvas/media/${pj.id}/${pj.thumb}` }))
								: h("span", null, "空")),
						h("div", { className: "ccv-projcard-body" },
							h("div", { className: "ccv-proj-name" }, pj.name),
							h("div", { className: "ccv-proj-stats" }, `${pj.nodes || 0} 节点 · ${pj.videos || 0} 视频 · ${pj.images || 0} 图片`),
							h("div", { className: "ccv-proj-row" },
								h("span", { className: "ccv-proj-date" }, String(pj.updatedAt || "").slice(0, 10)),
								h("span", { style: { flex: 1 } }),
								h("button", {
									className: "ccv-card-act", title: "打包成 zip（含 media）",
									onClick: (e) => { e.stopPropagation(); exportProject(pj); },
								}, "导出"))))))
					: h("div", { className: "ccv-empty" }, "还没有项目"));

			const roleLabel = { character: "角色", scene: "场景", prop: "道具" };
			const chips = [["all", "全部"], ["character", "角色"], ["scene", "场景"], ["prop", "道具"]];
			const aq = assetQuery.trim().toLowerCase();
			const shownAssets = allAssets
				.filter((a) => (assetFilter === "all" ? true : (a.role || "") === assetFilter))
				.filter((a) => {
					if (!aq) return true;
					const hay = [a.name, a.prompt, a.model, a.file, a.role].filter(Boolean).join(" ").toLowerCase();
					return hay.includes(aq);
				});
			const assetsPage = h("div", { className: "ccv-page" },
				h("div", { className: "ccv-page-head" },
					h("div", { className: "ccv-page-title" }, "资产"),
					h("span", { className: "ccv-hint", style: { marginLeft: 10 } }, `${allAssets.length} 项（跨项目）`),
					h("span", { style: { flex: 1 } }),
					h("input", {
						className: "ccv-search", style: { flex: "0 0 200px" },
						placeholder: "搜索名称 / 提示词 / 模型",
						value: assetQuery,
						onChange: (e) => setAssetQuery(e.target.value),
					}),
					chips.map(([id, label]) => h("button", {
						key: id, className: "ccv-chip" + (globalAssetFilter === id ? " on" : ""),
						onClick: () => setAssetFilter(id),
					}, label))),
				shownAssets.length
					? h("div", { className: "ccv-assetgrid" }, shownAssets.map((a, i) => h("div", {
						key: (a.id || a.file || "") + i, className: "ccv-assetcard",
						title: `放到画布：${a.projectName || a.projectId || ""}`,
						onClick: () => placeAssetToProject(a),
					},
						a.kind === "video"
							? h("video", { src: `/omni-canvas/media/${a.projectId}/${a.file}`, preload: "metadata", muted: true })
							: (a.kind === "image"
								? h("img", { src: `/omni-canvas/media/${a.projectId}/${a.file}` })
								: h("div", { className: "ccv-asset-ph" }, "🎵")),
						h("div", { className: "ccv-asset-meta" },
							h("span", { className: "ccv-asset-role" }, roleLabel[a.role] || "未分类"),
							h("span", { className: "ccv-asset-proj" }, a.projectName || "")))))
					: h("div", { className: "ccv-empty" }, "还没有资产"));

			const BIND = (capId) => bindings.find((b) => b.capability === capId) || null;
			const getBound = (w, capId) => bindings.find((b) => b.capability === capId && (b.workflow?.file || "").split(/[\\/]/).pop() === (w.name || "")) || null;
			const MODEL_GROUPS = [
				{ title: "默认生图模型", caps: [
					{ id: "image-t2i", label: "文生图", tpl: "t2i-fast" },
					{ id: "image-edit", label: "图生图", tpl: "edit" },
				] },
				{ title: "默认音频模型", caps: [
					{ id: "audio-speech", label: "语音合成", tpl: "speech" },
				] },
				{ title: "默认视频模型", caps: [
					{ id: "video-t2v", label: "文生视频", tpl: "h3-r2v" },
					{ id: "video-i2v", label: "图生视频", tpl: "h3-i2v" },
					{ id: "video-fl2v", label: "首尾帧", tpl: "" },
					{ id: "video-r2v", label: "参考生视频", tpl: "h3-r2v" },
				] },
			];
			const CAPS = MODEL_GROUPS.flatMap((g) => g.caps);
			const BUILTIN_IMPLS = {
				"image-t2i": [
					{ id: "t2i-fast", label: "文生图（快速）" },
					{ id: "t2i-hq", label: "文生图（高清）" },
				],
				"image-edit": [{ id: "edit", label: "图生图" }],
				"audio-speech": [{ id: "speech", label: "语音合成 · Edge 神经音色" }],
				"video-r2v": [{ id: "h3-r2v", label: "参考生视频" }],
				"video-i2v": [{ id: "h3-i2v", label: "图生视频" }],
				// 首尾帧：实测输出与输入无关（H3 的 fl2v 需要额外关键帧结构），先不列内置

				"video-t2v": [{ id: "h3-r2v", label: "文生视频" }],
			};
			const WF_LABEL = { video: "视频·H3", "video-t2v": "文生视频", "video-r2v": "参考生视频", image: "图片", "image-t2i": "文生图", "image-edit": "图生图", tts: "语音", music: "音乐" };
			const diagTpl = { edit: "图生图", "h3-r2v": "参考生视频", "t2i-fast": "文生图（快速）", "t2i-hq": "文生图（高清）" };
			const buildSetupPrompt = (wfName, capLabel) => {
				const comfy = (diag && diag.comfy) || {};
				const disk = (diag && diag.disk) || {};
				const installed = (findRes && findRes.installs && findRes.installs[0]) || {};
				const wfCount = (wfRes && wfRes.workflows) ? wfRes.workflows.length : 0;
				const lines = [
					"请用 dsh-omni-canvas 插件，帮我把本地 ComfyUI 的工作流接成插件的默认实现。",
					"",
					"【环境】",
					"- ComfyUI 目录：" + (installed.path || (disk.projectsDir ? "（未检测到安装，请先扫描）" : "（未知）")),
					"- 地址：" + (comfy.url || "http://127.0.0.1:8188") + (comfy.ok ? "（已连接 v" + (comfy.version || "?") + "）" : "（当前未连接）"),
					"- 已扫描工作流：" + wfCount + " 个",
					"",
					"【我的需求】",
					wfName
						? "- 把工作流「" + wfName + "」绑定为「" + (capLabel || "该能力") + "」的实现，并设为默认。"
						: "- 把适合的工作流绑定为：参考生视频 / 文生视频 / 文生图 / 图生图 的默认实现。",
					"- 优先选择节点齐全、能直接出片的那一个。",
					"- 如果这个工作流缺节点或跑不通，告诉我原因，并保持内置模板不变。",
					"",
					"【执行要求】",
					"1. 用插件的工作流检查能力读出节点表，不要凭空猜；",
					"2. 推断 prompt / seed / 时长或帧数 / 参考图 / 输出 的绑定位置；",
					"3. 有歧义先问我，不要自己拍板；",
					"4. 保存绑定后**直接试跑一次**（用最小参数，避免显存压力）；",
					"5. 试跑通过就设为该能力的默认实现；失败就把人话原因告诉我，不要静默；",
					"6. 最后回报：绑定 id、试跑耗时、是否已设为默认。",
				];
				return lines.join("\n");
			};
			const [copied, setCopied] = useState(false);
			const [assistOpen, setAssistOpen] = useState(false);
			const [copyFallback, setCopyFallback] = useState(null);
			const [toastMsg, setToastMsg] = useState(null);
			const setupSummary = (() => {
				const comfy = (diag && diag.comfy) || {};
				const installed = (findRes && findRes.installs && findRes.installs[0]) || {};
				const wfCount = (wfRes && wfRes.workflows) ? wfRes.workflows.length : 0;
				const parts = [];
				if (installed.path) parts.push(installed.path);
				if (comfy.url) parts.push(comfy.url.replace(/^https?:\/\//, ""));
				if (wfCount) parts.push(wfCount + " 个工作流");
				return parts.length ? parts.join(" · ") : "尚未扫描环境";
			})();
			const setupCard = h("div", { className: "ccv-set-card ccv-assist" },
				h("div", { className: "ccv-assist-head" },
					h("span", { className: "ccv-set-title", style: { marginBottom: 0 } }, "配置助手"),
					h("span", { className: "ccv-set-hint", style: { marginTop: 0 } }, setupSummary),
					h("span", { style: { flex: 1 } }),
					h("button", {
						className: "ccv-chip on",
						onClick: async () => {
							const text = buildSetupPrompt();
							const ok = await copyText(text);
							if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1600); showToast("✅ 配置指令已复制"); }
							else { setCopyFallback({ text, title: "配置指令（请手动复制）" }); showToast("⚠️ 无法访问剪贴板，已弹出可复制的文本框"); }
						},
					}, copied ? "已复制" : "复制配置指令"),
					h("button", { className: "ccv-chip", onClick: () => setAssistOpen((v) => !v) }, assistOpen ? "收起" : "查看内容")),
				assistOpen
					? h("pre", { className: "ccv-assist-pre" }, buildSetupPrompt())
					: h("div", { className: "ccv-set-hint", style: { marginTop: 2 } },
						"工作流绑定由 AI 完成，无需手动配置：复制指令 → 发给 Agent → 它读取本机工作流并写回绑定。"),
				assistOpen
					? h("div", { className: "ccv-set-hint", style: { marginTop: 6 } },
						"内容按当前扫描结果动态生成（目录 / 端口 / 版本 / 工作流数量），换机器会自动变化。")
					: null);

			const settingsPage = h("div", { className: "ccv-page" },
				h("div", { className: "ccv-page-head" },
					h("div", { className: "ccv-page-title" }, "设置"),
					h("span", { style: { flex: 1 } }),
					h("button", { className: "ccv-chip" + (diagLoading ? " on" : ""), onClick: loadDiag, disabled: diagLoading }, diagLoading ? "检测中…" : "重新检测")),
				h("div", { className: "ccv-set-grid" },
				setupCard,
				h("div", { className: "ccv-set-card" },
					h("div", { className: "ccv-set-title" }, "ComfyUI 连接"),
					h("div", { className: "ccv-set-row" },
						h("span", { className: "ccv-set-label" }, "地址"),
						h("input", { className: "ccv-input", readOnly: true, value: (diag && diag.comfy && diag.comfy.url) || "—" })),
					diag && diag.comfy && diag.comfy.ok
						? h("div", { className: "ccv-set-ok" }, `● 已连接 · v${diag.comfy.version || "?"} · ${diag.comfy.vramTotalGB || "?"} GB 显存 · 延迟 ${diag.comfy.latencyMs} ms${diag.comfy.queue ? " · 队列 " + diag.comfy.queue : ""}`)
						: h("div", { className: "ccv-set-bad" }, diag ? (diag.error || (diag.comfy && diag.comfy.error) || "未连接") : "尚未检测")),
				h("div", { className: "ccv-set-card" },
					h("div", { className: "ccv-set-title" }, "默认模型"),
					h("div", { className: "ccv-cap-hint" }, "每类生成默认用哪个实现。工作流要先在下面「工作流」里配置并通过试跑，才会出现在下拉里。"),
					MODEL_GROUPS.map((group) => h("div", { key: group.title, className: "ccv-mgroup" },
						h("div", { className: "ccv-mgroup-title" }, group.title),
						group.caps.map((cap) => {
							const builtins = BUILTIN_IMPLS[cap.id] || (cap.tpl ? [{ id: cap.tpl, label: diagTpl[cap.tpl] || cap.tpl }] : []);
							const ready = bindings.filter((b) => b.capability === cap.id && b.status === "ok" && b.verified?.mode === "run");
							const def = (bindingDefaults && bindingDefaults[cap.id]) || (builtins[0] ? "builtin:" + builtins[0].id : "");
							const isBuiltin = String(def).startsWith("builtin:");
							const curTpl = isBuiltin ? String(def).slice("builtin:".length) : (cap.tpl || "");
							const curT = curTpl ? (diag && diag.templates || []).find((t) => t.id === curTpl) : null;
							const defBinding = (!isBuiltin && def) ? bindings.find((b) => b.id === def) : null;
							const opts = [];
							builtins.forEach((b) => opts.push({ value: "builtin:" + b.id, label: "插件自带 · " + (b.label || b.id) }));
							ready.forEach((b) => opts.push({ value: b.id, label: "工作流 · " + b.name }));
						 const stateText = !opts.length
								? "未配置 · 需要一个工作流"
								: (isBuiltin && curT && !curT.ok)
									? "缺模型/节点"
									: (defBinding ? "已验证" : "可用");
							return h("div", { key: cap.id, className: "ccv-mrow" },
								h("span", { className: "ccv-mrow-name" }, cap.label),
								h("select", {
									className: "ccv-select ccv-mrow-sel",
									value: opts.some((o) => o.value === def) ? def : (opts[0] ? opts[0].value : ""),
									disabled: !opts.length,
									onChange: async (e) => {
										const v = e.target.value;
										try {
											const r = await api("binding.setDefault", { capability: cap.id, target: v });
											if (r && r.ok) { setBindingDefaults(r.defaults || {}); setP1msg("已切换默认：" + cap.label); }
											else setP1msg("切换失败：" + ((r && r.error) || "未知")); await loadBindings();
										} catch (err) { setP1msg("切换失败：" + String(err.message || err)); }
									},
								},
									opts.length
										? opts.map((o) => h("option", { key: o.value, value: o.value }, o.label))
										: h("option", { value: "" }, "未配置（先去下面配置工作流）")),
								h("span", { className: "ccv-mrow-state" + (opts.length && (defBinding || (curT && curT.ok)) ? " ok" : "") }, stateText));
						}))),
					p1msg ? h("div", { className: "ccv-set-hint" }, p1msg) : null),
				h("div", { className: "ccv-set-card" },
					h("div", { className: "ccv-set-title" }, "工作流（自动配置）",
						h("span", { className: "ccv-set-hint", style: { marginLeft: 10 } },
							wfRes ? `${(wfRes.workflows || []).length} 个已扫描` : "")),
					h("div", { className: "ccv-set-actions" },
						h("button", { className: "ccv-chip", onClick: loadWorkflows, disabled: p1busy === "wf" },
							p1busy === "wf" ? "扫描中…" : "扫描工作流"),
						h("button", {
							className: "ccv-chip",
							title: "AI 写好绑定后点这里同步状态",
							onClick: async () => { await loadBindings(); await loadWorkflows(); showToast("状态已刷新"); },
						}, "刷新状态"),
						h("span", { className: "ccv-set-hint", style: { marginTop: 0 } },
							"点「自动配置」复制指令给 AI；配置完点「试跑」，通过后进入上面的下拉。")),
					(wfRes && (wfRes.workflows || []).length)
						? wfRes.workflows.slice(0, 40).map((w) => {
							const bound = bindings.find((b) => (b.workflow?.file || "").split(/[\\/]/).pop() === (w.name || ""));
							const caps = (w.caps || []).filter((c) => c.startsWith("image") || c.startsWith("video"));
							const done = !!(bound && bound.verified?.mode === "run");
							const testing = p1busy === "test:" + (bound && bound.id);
							return h("div", { key: w.rel, className: "ccv-wrow" },
								h("span", { className: "ccv-tick " + (w.ok ? "ok" : "bad") }, w.ok ? "●" : "○"),
								h("span", { className: "ccv-wrow-name" }, (w.name || "").replace(/\.json$/i, "")),
								caps.length
									? h("span", { className: "ccv-wftag" }, caps.map((c) => WF_LABEL[c] || c).join(" · "))
									: h("span", { className: "ccv-wftag" }, "未归类"),
								h("span", { className: "ccv-wrow-state" + (done ? " ok" : "") },
									done ? "已配置 · 已验证" : bound ? "已配置 · 待试跑" : "未配置"),
								h("span", { style: { flex: 1 } }),
								done
									? h("span", { className: "ccv-set-hint", style: { marginTop: 0 } }, "已进入上面下拉")
									: bound
										? h("button", {
											className: "ccv-chip on",
											disabled: testing,
											onClick: async () => {
												setP1busy("test:" + bound.id);
												setP1msg("试跑中…（视频可能 1–2 分钟）");
												try {
													const r = await api("binding.test", { id: bound.id, mode: "run" });
													setP1msg(r && r.ok ? "试跑通过，已加入可选" : "试跑失败：" + ((r && r.error) || "见日志"));
													await loadBindings();
												} catch (e) { setP1msg("试跑失败：" + String(e.message || e)); }
												setP1busy("");
											},
										}, testing ? "试跑中…" : "试跑")
										: h("button", {
											className: "ccv-chip on",
											onClick: async () => {
												const c2 = (w.caps || []).filter((c) => c.startsWith("image") || c.startsWith("video"));
												const text = buildSetupPrompt(w.name, c2.length ? (WF_LABEL[c2[0]] || c2[0]) : "某个能力");
												const copied = await copyText(text);
												if (copied) { setP1msg("已复制配置指令：发给 AI，它会绑定并试跑；完成后点「刷新状态」"); showToast("✅ 已复制：发给 AI，它会绑定 + 试跑 + 设默认"); }
												else { setCopyFallback({ text, title: "配置指令（请手动复制）" }); showToast("⚠️ 无法访问剪贴板，已弹出可复制的文本框"); }
											},
										}, "自动配置"),
								h("span", { className: "ccv-set-hint", style: { marginTop: 0, marginLeft: 8 } }, `${w.nodeCount} 节点`));
						})
												: h("div", { className: "ccv-cap-none" }, "点「扫描工作流」读取 ComfyUI 的 user/default/workflows")),
				h("div", { className: "ccv-set-card" },
					h("div", { className: "ccv-set-title" }, "生成历史",
						h("span", { className: "ccv-set-hint", style: { marginLeft: 10 } },
							jobHistory.length ? `${jobHistory.length} 条（最多 100）` : "暂无")),
					jobHistory.length
						? jobHistory.slice(0, 10).map((j) => h("div", { key: j.id, className: "ccv-hrow" },
							h("span", { className: "ccv-tick " + (j.status === "done" ? "ok" : "bad") },
								j.status === "done" ? "●" : "○"),
							h("span", { className: "ccv-hrow-kind" }, (j.model || j.kind || "").slice(0, 22)),
							h("span", { className: "ccv-hrow-prompt" }, j.prompt || "—"),
							h("span", { className: "ccv-hrow-time" },
								j.durationMs ? Math.round(j.durationMs / 1000) + "s" : ""),
							j.error ? h("span", { className: "ccv-hrow-err" }, j.error.slice(0, 40)) : null))
						: h("div", { className: "ccv-cap-none" }, "还没有生成记录"),
					jobHistory.length ? null : null),
				h("div", { className: "ccv-set-card" },
					h("div", { className: "ccv-set-title" }, "运行状态"),
					h("div", { className: "ccv-set-row" },
						h("span", { className: "ccv-set-label" }, "ComfyUI"),
						h("span", { className: "ccv-set-val" },
							diag && diag.comfy && diag.comfy.ok
								? `${diag.comfy.version || "?"} · 延迟 ${diag.comfy.latencyMs} ms · 队列 ${diag.comfy.queue ?? 0}`
								: "未连接")),
					h("div", { className: "ccv-set-row" },
						h("span", { className: "ccv-set-label" }, "显存"),
						h("span", { className: "ccv-set-val" },
							diag && diag.comfy && diag.comfy.ok
								? `${diag.comfy.vramUsedGB ?? "?"} / ${diag.comfy.vramTotalGB ?? "?"} GB 已用（剩余 ${diag.comfy.vramFreeGB ?? "?"} GB）`
								: "—")),
					h("div", { className: "ccv-set-row" },
						h("span", { className: "ccv-set-label" }, "队列"),
						h("span", { className: "ccv-set-val" },
							queue.running || queue.queue.length
								? `正在跑 1 · 排队 ${queue.queue.length}`
								: "空闲")),
					h("div", { className: "ccv-set-row" },
						h("span", { className: "ccv-set-label" }, "磁盘"),
						h("span", { className: "ccv-set-val" },
							diag && diag.disk ? `剩余 ${diag.disk.freeGB} GB · 项目 ${diag.disk.projectCount} 个` : "—"))),
				h("div", { className: "ccv-set-card" },
					h("div", { className: "ccv-set-title" }, "数据与存储"),
					h("div", { className: "ccv-set-row" },
						h("span", { className: "ccv-set-label" }, "项目目录"),
						h("span", { className: "ccv-set-val" }, (diag && diag.disk && diag.disk.projectsDir) || "—")),
					h("div", { className: "ccv-set-row" },
						h("span", { className: "ccv-set-label" }, "项目"),
						h("span", { className: "ccv-set-val" }, diag && diag.disk
							? `${diag.disk.projectCount || 0} 个 · 占用 ${diag.disk.usedGB || 0} GB`
							: "—")),
					h("div", { className: "ccv-set-row" },
						h("span", { className: "ccv-set-label" }, "所在磁盘"),
						h("span", { className: "ccv-set-val" }, diag && diag.disk ? `剩余 ${diag.disk.freeGB} GB` : "—"))),
				h("div", { className: "ccv-set-card" },
					h("div", { className: "ccv-set-title" }, "本地 ComfyUI",
						h("span", { className: "ccv-set-hint", style: { marginLeft: 10 } },
							diag && diag.comfy && diag.comfy.ok ? "运行中" : "未连接")),
					h("div", { className: "ccv-set-actions" },
						h("button", { className: "ccv-chip", onClick: loadFind, disabled: p1busy === "find" },
							p1busy === "find" ? "扫描中…" : "重新扫描"),
						!(diag && diag.comfy && diag.comfy.ok) && findRes && findRes.installs && findRes.installs.length
							? findRes.installs.map((it) => h("button", {
								key: it.path, className: "ccv-chip",
								disabled: p1busy === "start" || !it.launch,
								onClick: () => doStartComfy(it.path),
							}, "启动 " + it.path.split("\\").pop()))
							: null,
						findRes && findRes.launchedByPlugin
							? h("button", { className: "ccv-chip", onClick: doStopComfy, disabled: p1busy === "stop" }, "停止")
							: null,
						p1msg ? h("span", { className: "ccv-set-hint", style: { marginTop: 0 } }, p1msg) : null),
					findRes && findRes.installs && findRes.installs.length
						? findRes.installs.map((it) => h("div", { key: "i-" + it.path, className: "ccv-set-hint" },
							`找到：${it.path} · ${it.customCount} 个自定义节点 · ${it.launch ? "启动方式 " + it.launch.kind : "未找到启动方式"}`))
						: (findRes ? h("div", { className: "ccv-set-hint" }, "未找到本地 ComfyUI 安装") : null))),
				toastMsg ? h("div", { className: "ccv-toast" }, toastMsg) : null,
				copyFallback
					? h("div", { className: "ccv-copybox" },
						h("div", { className: "ccv-copybox-head" },
							h("span", null, copyFallback.title),
							h("span", { style: { flex: 1 } }),
							h("button", { className: "ccv-chip", onClick: () => setCopyFallback(null) }, "关闭")),
						h("pre", { className: "ccv-copybox-pre" }, copyFallback.text))
					: null);



			if (view === "home") {
				const actions = [
					{ icon: "◫", label: "资产库", desc: "所有生成过的素材", on: async () => {
						const proj = current || projects[0];
						if (!proj) return quickStart("image");
						await openProject(proj);
						setTimeout(() => setAssetsOpen(true), 300);
					} },
					{ icon: "▣", label: "图片生成", desc: "文生图 / 图生图", on: () => quickStart("image") },
					{ icon: "▶", label: "视频生成", desc: "文生视频 / 参考生视频", on: () => quickStart("video") },
					{ icon: "≡", label: "分镜脚本", desc: "场 → 镜头，一键出片", on: () => quickStart("script") },
				];
				const homeEl = h("div", { className: "ccv-home" },
					h("div", { className: "ccv-home-hero" },
						h("button", { className: "ccv-hero-plus", onClick: newProject, title: "新建画布" }, "＋"),
						h("div", { className: "ccv-hero-label" }, "新建画布创作"),
						h("div", { className: "ccv-home-sub" }, "本地 ComfyUI · 图片 / 视频 / 分镜脚本"),
					),
					h("div", { className: "ccv-home-actions" },
						actions.map((a) => h("button", { key: a.label, className: "ccv-home-action", onClick: a.on },
							h("span", { className: "ccv-ha-icon" }, a.icon),
							h("span", { className: "ccv-ha-label" }, a.label),
							h("span", { className: "ccv-ha-desc" }, a.desc)))),
					h("div", { className: "ccv-home-sec" },
						h("span", null, "最近项目"),
						h("span", { style: { flex: 1 } }),
						h("button", { className: "ccv-btn", onClick: async () => {
							const r = await api("project.list");
							setProjects(r.projects || []);
						} }, "刷新")),
					projects.length
						? h("div", { className: "ccv-home-grid" },
							projects.map((p) => h("div", { key: p.id, className: "ccv-proj", onClick: () => openProject(p) },
								p.thumb
									? (p.thumbKind === "video"
										? h("video", { className: "ccv-proj-thumb", src: `/omni-canvas/media/${p.id}/${p.thumb}`, muted: true, preload: "metadata" })
										: h("img", { className: "ccv-proj-thumb", src: `/omni-canvas/media/${p.id}/${p.thumb}` }))
									: h("div", { className: "ccv-proj-thumb empty" }, "空"),
								h("div", { className: "ccv-proj-body" },
									h("div", { className: "ccv-proj-name" }, p.name),
									h("div", { className: "ccv-proj-stats" },
										`${p.nodes || 0} 节点 · ${p.scripts ? p.scripts + " 脚本 · " : ""}${p.assets || 0} 资产`),
									h("div", { className: "ccv-proj-date" }, String(p.updatedAt || "").slice(0, 10))))))
						: h("div", { className: "ccv-home-empty" }, "还没有项目，点上面的「新建画布」开始"),
				);
				return h("div", { className: "ccv-shell" },
					sidebarEl,
					h("div", { className: "ccv-main" },
						page === "settings"
							? settingsPage
							: page === "projects"
								? projectsPage
								: page === "assets"
									? assetsPage
									: homeEl));
			}

			return h("div", { className: "ccv-root" },
				h("div", { className: "ccv-topbar" },
					h("button", {
						className: "ccv-homebtn", title: "回到主页",
						onClick: () => { setView("home"); setAssetsOpen(false); setProjMenu(false); },
					}, "⌂"),
					h("div", { className: "ccv-projwrap" },
						h("button", {
							className: "ccv-projbtn",
							onClick: () => setProjMenu((v) => !v),
						}, (current?.name || "未命名项目") + "  ▾"),
						projMenu ? h("div", { className: "ccv-projmenu", onMouseDown: (e) => e.stopPropagation() },
							h("div", { className: "ccv-projgrp" }, "切换项目"),
							projects.map((p2) => h("button", {
								key: p2.id,
								className: "ccv-projitem" + (p2.id === current?.id ? " on" : ""),
								onClick: () => { setCurrent(p2); setProjMenu(false); },
							}, p2.name)),
							h("div", { className: "ccv-sep" }),
							h("button", { className: "ccv-projitem", onClick: () => { newProject(); setProjMenu(false); } }, "＋ 新建项目"),
							h("button", { className: "ccv-projitem", onClick: () => { renameProject(); setProjMenu(false); } }, "重命名"),
							h("button", { className: "ccv-projitem danger", onClick: () => { deleteProject(); setProjMenu(false); } }, "删除项目"),
						) : null),
					h("span", { style: { flex: 1 } }),
					stale === "restart"
						? h("span", { className: "ccv-stale" }, "宿主代码已更新 · 需重启")
						: stale === "refresh"
							? h("span", { className: "ccv-stale" }, "界面已更新 · 刷新 (F5)")
							: null,
					h("span", {
						className: "ccv-dot",
						style: { background: health.ok ? T.ok : T.bad },
						title: health.ok ? health.comfy : (health.error || "未连接"),
					}),
					h("span", { className: "ccv-hint" },
						health.ok
							? (queue.running || queue.queue.length)
								? `${queue.queue.length + (queue.running ? 1 : 0)} 个任务`
								: "已连接"
							: "未连接"),
					h("button", { className: "ccv-iconbtn", title: "设置", onClick: () => setError("设置面板：暂未接入") }, "⚙"),
				),
				h("div", {
					ref: stageRef, className: "ccv-stage",
					onWheel, onMouseDown: onStageDown, onMouseMove: onMove, onMouseUp: onUp, onMouseLeave: onUp,
					onDoubleClick: (e) => {
						if (e.target !== e.currentTarget) return;
						const rect = stageRef.current?.getBoundingClientRect();
						if (!rect) return;
						const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
						setMenu({ x: sx, y: sy,
							world: { x: Math.round((sx - vp.x) / vp.zoom), y: Math.round((sy - vp.y) / vp.zoom) } });
					},
				},
					h("div", { className: "ccv-world", style: { transform: `translate(${vp.x}px,${vp.y}px) scale(${vp.zoom})` } },

						nodes.map((n) => {
							if (n.type === "audio") {
								const d = n.data || {};
								return h("div", {
									key: n.id,
									className: "ccv-audio" + (selected === n.id ? " sel" : ""),
									style: { left: n.x, top: n.y, width: n.w || 320 },
									onMouseDown: (e) => onCardDown(e, n),
								},
									h("div", { className: "ccv-audio-head" },
										h("span", { className: "ccv-text-ico" }, "♫"),
										h("span", { className: "ccv-text-title" }, d.title || "音频")),
									d.file
										? h("audio", {
											className: "ccv-audio-player",
											src: `/omni-canvas/media/${current?.id}/${d.file}`,
											controls: true,
											onMouseDown: (e) => e.stopPropagation(),
										})
										: h("div", { className: "ccv-audio-empty" },
											h("span", null, "还没有音频"),
											h("button", {
												className: "ccv-text-act",
												onMouseDown: (e) => e.stopPropagation(),
												onClick: (e) => { e.stopPropagation(); setError("配乐生成：暂未接入（可先用资产库放回音频文件）"); },
											}, "生成配乐 / 选择文件")));
							}

							if (n.type === "text") {
								const d = n.data || {};
								const editing = editingTextId === n.id;
								const acts = [
									["自己编写内容", () => setEditingTextId(n.id)],
									["文生视频", () => addNode("video", { x: n.x + 460, y: n.y })],
									["朗读成语音", () => speakText(n)],
									["图片反推提示词", () => setError("图片反推提示词：暂未接入")],
								];
								return h("div", {
									key: n.id,
									className: "ccv-text" + (selected === n.id ? " sel" : ""),
									style: { left: n.x, top: n.y, width: n.w || 420 },
									onMouseDown: (e) => onCardDown(e, n),
									onDoubleClick: (e) => { e.stopPropagation(); setEditingTextId(n.id); },
								},
									h("div", { className: "ccv-text-head" },
										h("span", { className: "ccv-text-ico" }, "▤"),
										h("span", { className: "ccv-text-title" }, d.title || "文本节点")),
									editing
										? h("textarea", {
											className: "ccv-text-edit",
											autoFocus: true,
											value: d.content || "",
											placeholder: "在这里写故事、场景或角色设定…",
											onMouseDown: (e) => e.stopPropagation(),
											onChange: (e) => {
												const v = e.target.value;
												updateNodeData(n.id, (dd) => { dd.content = v; });
											},
											onBlur: () => { setEditingTextId(null); commitScript(); },
										})
										: h("div", { className: "ccv-text-body" },
											(d.content || "").trim()
												? h("div", { className: "ccv-text-content" }, d.content)
												: h("div", { className: "ccv-text-empty" },
													h("div", { className: "ccv-text-lines" }, "☰"),
													h("div", { className: "ccv-text-try" }, "尝试："),
													acts.map(([label, fn]) => h("button", {
														key: label, className: "ccv-text-act",
														onMouseDown: (e) => e.stopPropagation(),
														onClick: (e) => { e.stopPropagation(); fn(); },
													}, h("span", { className: "ccv-text-dot" }, "▣"), label)))));
							}

							if (n.type === "script") {
								const d = n.data;
								const total = d.groups.reduce((a, g) => a + g.rows.reduce((b, r) => b + (Number(r.cells?.dur) || 0), 0), 0);
								const assetNodes = nodes.filter((x) => x.type !== "script" && x.data?.file);
								const assetCell = (g, r) => {
									const rowAssets = r.assets || { characters: [], scene: null, props: [] };
									const chip = (id, role) => {
										const node = nodes.find((x) => x.id === id);
										if (!node) return h("span", { className: "ccv-sc-chip missing" }, "已丢失");
										return h("span", {
											className: "ccv-sc-chip", title: node.data?.prompt || "",
											onClick: (e) => { e.stopPropagation(); bindAsset(role, id); commitScript(); },
										}, role === "scene" ? "场" : role === "prop" ? "道" : "角");
									};
									return h("div", { className: "ccv-sc-assets", onClick: (e) => e.stopPropagation() },
										(rowAssets.characters || []).map((id) => h(react.Fragment, { key: id }, chip(id, "character"))),
										rowAssets.scene ? chip(rowAssets.scene, "scene") : null,
										(rowAssets.props || []).map((id) => h(react.Fragment, { key: id }, chip(id, "prop"))),
										h("button", {
											className: "ccv-sc-addasset",
											onClick: (e) => { e.stopPropagation(); setSlotPicker({ nodeId: n.id, groupId: g.id, rowId: r.id }); },
										}, "＋"),
									);
								};
								const cellInput = (g, r, col) => {
									const val = r.cells?.[col.key] || "";
									const longText = ["desc", "prompt", "line"].includes(col.key);
									const apply = (v) => updateScript(n.id, (dd) => {
										const gg = dd.groups.find((x) => x.id === g.id);
										const rr = gg?.rows.find((x) => x.id === r.id);
										if (rr) { rr.cells = rr.cells || {}; rr.cells[col.key] = v; }
									});
									if (longText) {
										const rows = Math.max(2, Math.min(6, Math.ceil(val.length / Math.max(8, col.w / 13))));
										return h("textarea", {
											className: "ccv-sc-cell ccv-sc-area",
											style: { width: col.w, height: rows * 17 + 8 },
											value: val,
											placeholder: col.title,
											onChange: (e) => apply(e.target.value),
											onBlur: () => commitScript(),
											onMouseDown: (e) => e.stopPropagation(),
										});
									}
									return h("input", {
										className: "ccv-sc-cell",
										style: { width: col.w },
										value: val,
										placeholder: col.title,
										onChange: (e) => apply(e.target.value),
										onBlur: () => commitScript(),
										onMouseDown: (e) => e.stopPropagation(),
									});
								};
								return h("div", {
									key: n.id,
									className: "ccv-script" + (selected === n.id ? " sel" : ""),
									style: { left: n.x, top: n.y, width: SCRIPT_W },
									onMouseDown: (e) => {
										if (e.target === e.currentTarget || e.target.classList.contains("ccv-sc-title")) {
											setSelected(n.id);
											pushHistory();
											dragRef.current = { mode: "node", id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y };
											return;
										}
										e.stopPropagation();
										setSelected(n.id);
									},
								},
									h("div", { className: "ccv-script-head" },
										h("span", { className: "ccv-sc-title" }, d.title || "分镜脚本"),
										h("span", { className: "ccv-sc-sum" }, `${d.groups.reduce((a, g) => a + g.rows.length, 0)} 镜 · ${total.toFixed(1)}s`),
										h("span", { className: "sp" }),
										h("select", {
											className: "ccv-select",
											value: d.target || "video",
											onChange: (e) => { const v = e.target.value; updateScript(n.id, (dd) => { dd.target = v; }); commitScript(); },
										},
											h("option", { value: "video" }, "生成视频"),
											h("option", { value: "image" }, "生成图片")),
										h("button", {
											className: "ccv-btn", title: "按分镜每行生成一张关键帧图片",
											onClick: (e) => { e.stopPropagation(); scriptKeyframesAll(n); },
										}, "一键关键帧"),
										h("button", { className: "ccv-btn", onClick: () => { scriptAddGroup(n.id); commitScript(); } }, "＋ 场"),
									),
									d.groups.map((g) => h("div", { key: g.id, className: "ccv-sc-group" },
										h("div", { className: "ccv-sc-group-head" },
											h("input", {
												className: "ccv-sc-gtitle", value: g.title || "",
												onChange: (e) => { const v = e.target.value; updateScript(n.id, (dd) => {
													const gg = dd.groups.find((x) => x.id === g.id); if (gg) gg.title = v; }); },
												onBlur: () => commitScript(),
												onMouseDown: (e) => e.stopPropagation(),
											}),
											h("span", { className: "ccv-sc-lab" }, "场景"),
											h("input", { className: "ccv-sc-gfield", value: g.scene || "",
												onChange: (e) => { const v = e.target.value; updateScript(n.id, (dd) => {
													const gg = dd.groups.find((x) => x.id === g.id); if (gg) gg.scene = v; }); },
												onBlur: () => commitScript(), onMouseDown: (e) => e.stopPropagation() }),
											h("span", { className: "ccv-sc-lab" }, "光影"),
											h("input", { className: "ccv-sc-gfield", value: g.light || "",
												onChange: (e) => { const v = e.target.value; updateScript(n.id, (dd) => {
													const gg = dd.groups.find((x) => x.id === g.id); if (gg) gg.light = v; }); },
												onBlur: () => commitScript(), onMouseDown: (e) => e.stopPropagation() }),
											h("span", { className: "ccv-sc-lab" }, "音效"),
											h("input", { className: "ccv-sc-gfield", value: g.sound || "",
												onChange: (e) => { const v = e.target.value; updateScript(n.id, (dd) => {
													const gg = dd.groups.find((x) => x.id === g.id); if (gg) gg.sound = v; }); },
												onBlur: () => commitScript(), onMouseDown: (e) => e.stopPropagation() }),
										),
										h("div", { className: "ccv-sc-row head" },
											d.columns.map((c) => h("div", { key: c.key, className: "ccv-sc-th", style: { width: c.w } }, c.title)),
											h("div", { className: "ccv-sc-th", style: { width: 44 } }, "")),
										g.rows.map((r) => h("div", { key: r.id, className: "ccv-sc-row" },
											d.columns.map((c) => (c.key === "assets" ? assetCell(g, r) : cellInput(g, r, c))),
											h("button", {
												className: "ccv-sc-go", title: "按这一行生成",
												onClick: (e) => { e.stopPropagation(); scriptGenerateRow(n, g.id, r.id); },
												onMouseDown: (e) => e.stopPropagation(),
											}, "▶"),
											h("button", {
												className: "ccv-sc-mini", title: "复制这一行",
												onClick: (e) => { e.stopPropagation(); scriptDuplicateRow(n.id, g.id, r.id); commitScript(); },
												onMouseDown: (e) => e.stopPropagation(),
											}, "⧉"),
											h("button", {
												className: "ccv-sc-mini", title: "删除这一行",
												onClick: (e) => { e.stopPropagation(); scriptDeleteRow(n.id, g.id, r.id); commitScript(); },
												onMouseDown: (e) => e.stopPropagation(),
											}, "✕"))),
										h("div", { className: "ccv-sc-addrow" },
											h("button", { className: "ccv-btn", onClick: () => { scriptAddRow(n.id, g.id); commitScript(); } }, "＋ 镜头")),
									)),
								);
							}
							const cs = cardSize(n);
							const card = h("div", {
								key: n.id + "-card",
								"data-node": n.id,
								className: "ccv-card" + (selected === n.id ? " sel" : ""),
								style: { left: n.x, top: n.y, width: cs.w, height: cs.h },
								onMouseDown: (e) => onCardDown(e, n),
								onMouseUp: () => { if (linking) finishLink(n.id); },
								onDoubleClick: (e) => {
									e.stopPropagation();
									if (n.data?.file) {
										setPreview({ file: n.data.file, kind: n.data?.kind || n.type });
									}
								},
							},
								n.data?.file
									? (n.type === "video"
										? h("div", { className: "ccv-videobox" },
											h("video", {
												ref: (el) => { if (el) videoRefs.current[n.id] = el; },
												className: "ccv-video",
												src: `/omni-canvas/media/${current?.id}/${n.data.file}`,
												controls: true, loop: true, playsInline: true, preload: "metadata",
											}),
											h("div", {
												className: "ccv-videomask",
												onMouseDown: (e) => onCardDown(e, n),
												onMouseUp: () => { if (linking) finishLink(n.id); },
												onDoubleClick: (e) => {
													e.stopPropagation();
													if (n.data?.file) setPreview({ file: n.data.file, kind: "video" });
												},
											}))
										: h("img", { src: `/omni-canvas/media/${current?.id}/${n.data.file}`, draggable: false }))
									: h("div", { className: "ccv-ph" }, n.type === "video" ? "🎬" : "🖼"),
								(n.data?.status === "running" || n.data?.status === "queued")
									? h("div", { className: "ccv-run" },
										h("span", null, n.data.status === "queued" ? "排队中…" : "生成中…"),
										queue.running && queue.running.nodeId === n.id
											? h("button", {
												className: "ccv-cancel",
												onClick: async (e) => {
													e.stopPropagation();
													await api("job.cancel", { jobId: queue.running.id }).catch(() => {});
												},
											}, "取消")
											: null)
									: null,
								h("div", { className: "ccv-card-head", onMouseDown: (e) => e.stopPropagation(),
									onDoubleClick: (e) => e.stopPropagation() },
									editingName === n.id
										? h("input", {
											className: "ccv-name-edit", autoFocus: true, defaultValue: assetName(n),
											onMouseDown: (e) => e.stopPropagation(),
											onBlur: (e) => {
												const v = e.target.value.trim();
												updateNodeData(n.id, (d) => { d.name = v; });
												setEditingName(null); commitScript();
											},
											onKeyDown: (e) => {
												if (e.key === "Enter") e.target.blur();
												if (e.key === "Escape") setEditingName(null);
											},
										})
										: h("span", {
											className: "ccv-card-name", title: "双击改名",
											onDoubleClick: (e) => { e.stopPropagation(); setEditingName(n.id); },
										}, assetName(n)),
									n.data?.status === "done" && n.type === "video" && (n.data?.durationSec || n.data?.sizeMB)
										? (() => {
											const issues = specIssues(n);
											return h("span", {
												className: "ccv-card-tag" + (issues.length ? " warn" : " ok"),
												title: issues.length ? issues.join("\n") : "竖屏 · 时长 · 体积均符合短剧常规规格",
											}, issues.length ? `规格 ${issues.length} 项提示` : "规格 OK");
										})()
										: null,
									Array.isArray(n.data?.clipIds) && n.data.clipIds.length
										? h("span", {
											className: "ccv-card-tag", title: "点一下看这 N 个来源镜头",
											onClick: (e) => { e.stopPropagation(); setStripOpen(true); },
										}, `拼接 ${n.data.clipIds.length} 镜`)
										: null,
									n.data?.refFrom
										? h("span", {
											className: "ccv-card-tag", title: "点击跳到这张源图",
											onClick: (e) => {
												e.stopPropagation();
												const src = nodes.find((x) => x.data?.file === n.data.refFrom);
												if (src) focusNode(src.id);
											},
										}, "首帧锁定")
										: null,
									n.data?.frameOf
										? h("span", {
											className: "ccv-card-tag", title: "点击跳到来源视频",
											onClick: (e) => { e.stopPropagation(); focusNode(n.data.frameOf); },
										}, (n.data.frameAt === "last" ? "末帧" : "首帧"))
										: null,
									n.type === "image"
										? h("span", {
											className: "ccv-card-role", title: "点击切换：角色 / 场景 / 道具",
											onClick: (e) => {
												e.stopPropagation();
												const cur = inferRole(n);
												updateNodeData(n.id, (d) => { d.role = nextRole(cur); });
												commitScript();
											},
										}, ROLE_LABEL[inferRole(n)])
										: null,
									["running", "queued"].includes(n.data?.status)
										? h("div", { className: "ccv-card-acts", onMouseDown: (e) => e.stopPropagation() },
											h("button", {
												className: "ccv-card-act", title: "取消这个任务",
												onClick: (e) => { e.stopPropagation(); cancelNodeJob(n); },
											}, "取消"))
										: null,
									n.data?.status === "failed"
										? h("div", { className: "ccv-card-acts", onMouseDown: (e) => e.stopPropagation() },
											h("button", {
												className: "ccv-card-act", title: "用同样的提示词重试",
												onClick: (e) => { e.stopPropagation(); retryNode(n); },
											}, "重试"))
										: null,
									n.data?.status === "done" && n.type === "video" && n.data?.durationSec
										? h("div", { className: "ccv-card-meta" },
											[
												n.data.durationSec ? `${n.data.durationSec.toFixed(1)}s` : null,
												n.data.sizeMB ? `${n.data.sizeMB} MB` : null,
												n.data.width && n.data.height ? `${n.data.width}×${n.data.height}` : null,
											].filter(Boolean).join(" · "))
										: null,
									n.data?.status === "done" && n.type === "video"
										? h("div", { className: "ccv-card-acts", onMouseDown: (e) => e.stopPropagation() },
											h("button", {
												className: "ccv-card-act", title: "抽末帧成图片（只做抽帧）",
												onClick: (e) => { e.stopPropagation(); extractFrame(n); },
											}, "抽帧"),
											h("button", {
												className: "ccv-card-act", title: "接下一镜：抽末帧 + 建图生视频链路",
												onClick: (e) => { e.stopPropagation(); continueShot(n); },
											}, "接一镜"),
											h("button", {
												className: "ccv-card-act", title: "2 倍放大（ffmpeg lanczos）",
												onClick: (e) => { e.stopPropagation(); upscaleVideo(n); },
											}, "高清"),
											h("button", {
												className: "ccv-card-act", title: "导出发布包（mp4 + 说明 txt）",
												onClick: async (e) => {
													e.stopPropagation();
													try {
														const r = await api("video.publish", { projectId: current.id, nodeId: n.id });
														if (r.error) throw new Error(r.error);
														showToast("已导出：" + String(r.video || "").split(/[\\/]/).pop());
													} catch (err) { setError(String(err.message || err)); }
												},
											}, "发布包"))
										: null,
									n.data?.status === "done" && n.type === "image"
										? h("div", { className: "ccv-card-acts", onMouseDown: (e) => e.stopPropagation() },
											h("button", {
												className: "ccv-card-act", title: "4 倍超分（4x-UltraSharp）",
												onClick: (e) => { e.stopPropagation(); upscaleNode(n); },
											}, "高清"),
											h("button", {
												className: "ccv-card-act", title: "用这张图做参考图编辑（图生图）",
												onClick: (e) => { e.stopPropagation(); addChild(n.id, "right", "image"); },
											}, "编辑"))
										: null,
								),
							);
							const showDot = selected === n.id;
							const dot = showDot ? h("div", {
								key: n.id + "-dot", className: "ccv-dotport",
								style: { left: n.x + cs.w + 6, top: n.y + cs.h / 2 - 8 },
								title: "点一下添加 / 拖出去连线",
								onMouseDown: (e) => {
									e.stopPropagation();
									dragRef.current = { mode: "dot", id: n.id, sx: e.clientX, sy: e.clientY };
								},
							}, "+") : null;
							return h(react.Fragment, { key: n.id }, card, dot);
						}),
						(() => {
							const paths = edges.map((edge) => {
								const a = nodes.find((n) => n.id === edge.from);
								const b = nodes.find((n) => n.id === edge.to);
								if (!a || !b) return null;
								const csa = cardSize(a), csb = cardSize(b);
								const x1 = a.x + csa.w + 14, y1 = a.y + csa.h / 2;
								const x2 = b.x - 4, y2 = b.y + csb.h / 2;
								const mx = (x1 + x2) / 2;
								return h("path", {
									key: edge.id || `${edge.from}-${edge.to}`,
									d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
									stroke: "#4a5464", strokeWidth: 1.6, fill: "none",
								});
							});
							if (linking && linkPos) {
								const a = nodes.find((n) => n.id === linking);
								if (a) {
									const csa = cardSize(a);
									const x1 = a.x + csa.w + 14, y1 = a.y + csa.h / 2;
									const mx = (x1 + linkPos.x) / 2;
									paths.push(h("path", {
										key: "temp-link",
										d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${linkPos.y}, ${linkPos.x} ${linkPos.y}`,
										stroke: "#4d7cfe", strokeWidth: 1.8, fill: "none", strokeDasharray: "5 4",
									}));
								}
							}
							return h("svg", {
								key: "links",
								style: { position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none", zIndex: 50 },
							}, paths);
						})(),

					),

					assetsOpen ? h("div", { className: "ccv-assets", onMouseDown: (e) => e.stopPropagation() },
						h("div", { className: "ccv-assets-head" },
							h("span", null, `资产库 · ${assets.length}`),
							h("span", { className: "sp" }),
							h("button", { className: "ccv-expand", onClick: () => setAssetsOpen(false) }, "✕")),
						h("div", { className: "ccv-assets-search" },
							h("input", {
								className: "ccv-search", value: assetQuery,
								placeholder: "搜索提示词 / 名称…",
								onChange: (e) => setAssetQuery(e.target.value),
							})),
						h("div", { className: "ccv-assets-filter" },
							[["all", "全部"], ["character", "角色"], ["scene", "场景"], ["prop", "道具"], ["none", "未分类"]]
								.map(([k, label]) => h("button", {
									key: k, className: "ccv-chip" + (assetFilter === k ? " on" : ""),
									onClick: () => setAssetFilter(k),
								}, label))),
						h("div", { className: "ccv-assets-grid" },
							assets
								.filter((a) => (assetFilter === "all" ? true
									: assetFilter === "none" ? !a.role
									: a.role === assetFilter))
								.filter((a) => !assetQuery.trim()
									|| String(a.prompt || a.name || "").toLowerCase().includes(assetQuery.trim().toLowerCase()))
								.map((a) => h("div", { key: a.id, className: "ccv-asset", title: a.prompt || "" },
								h("span", { className: "ccv-asset-role" + (a.role ? " " + a.role : "") },
									a.role === "character" ? "角色" : a.role === "scene" ? "场景" : a.role === "prop" ? "道具" : "未分类"),
								h(a.kind === "video" ? "video" : "img", {
									className: "ccv-asset-media",
									src: `/omni-canvas/media/${current?.id}/${a.file}`,
									...(a.kind === "video" ? { muted: true, preload: "metadata" } : {}),
									onClick: () => placeAsset(a),
								}),
								h("button", {
									className: "ccv-asset-del", title: "从资产库删除（不影响画布）",
									onClick: async (e) => {
										e.stopPropagation();
										if (!window.confirm("从资产库删除这条记录？（画布上已放置的节点不受影响）")) return;
										await api("asset.delete", { id: current.id, assetId: a.id }).catch(() => {});
										loadAssets();
									},
								}, "✕")))),
					) : null,

					error ? h("div", { className: "ccv-err", style: { position: "absolute", left: 12, right: 12, top: 12, zIndex: 30 } }, error) : null,

					floatStyle ? h("div", {
						className: "ccv-float", style: floatStyle,
						onMouseDown: (e) => e.stopPropagation(), onWheel: (e) => e.stopPropagation(),
					},
						h("div", { className: "ccv-float-head" },
							h("span", { className: "sp" }),
							h("button", {
								className: "ccv-expand", title: expanded ? "收起" : "放大",
								onClick: (e) => { e.stopPropagation(); setExpanded((v) => !v); },
							}, expanded ? "⤡" : "⤢"),
						),
						(vram && vram.ok && vram.vramFreeGB < 8)
							? h("div", { className: "ccv-envbar" },
								h("span", { className: "ccv-envdot" }, "⚠"),
								h("span", { className: "ccv-envtext" },
									`剩余显存 ${vram.vramFreeGB} GB（共 ${vram.vramTotalGB} GB）偏低，生成会自动降档`),
								h("button", {
									className: "ccv-qbtn",
									onClick: async () => {
										try {
											await api("comfy.free", {});
											const r = await api("comfy.status", {});
											setVram(r || null);
											showToast("已请求释放显存");
										} catch (e) { setError(String(e.message || e)); }
									},
								}, "释放显存"))
							: null,
						(() => {
							const refs = refsOf(selected);
							if (!refs.length) return null;
							return h("div", { className: "ccv-refs" },
								refs.slice(0, 4).map((f, i) => h("img", {
									key: f + i, className: "ccv-ref",
									src: `/omni-canvas/media/${current?.id}/${f}`,
									title: sel.type === "video" ? `点击插入 <Picture ${i + 1}>` : `点击插入 <image${i + 1}>`,
									onClick: sel.type === "video" ? () => insertToken(i + 1, "picture") : () => insertToken(i + 1, "image"),
									style: { cursor: "pointer" },
								})),
								refs.length ? h("span", { className: "ccv-refcount" }, `×${refs.length}`) : null,
							h("span", { className: "ccv-refhint" },
								sel.type === "video"
									? "点缩略图插入 <Picture N> 指认角色"
									: "点缩略图插入 <imageN> 指认参考图"),
							);
						})(),
						h("textarea", {
							ref: taRef, className: "ccv-ta", value: prompt,
							placeholder: "可直接文字生图，或上传图片后输入文字指令对图片进行编辑…",
							onChange: (e) => setPrompt(e.target.value),
							onKeyDown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } },
						}),
						h("div", { className: "ccv-row" },
							sel.type === "video"
								? h("span", { className: "ccv-mode" }, refsOf(selected).length ? "参考生视频" : "文生视频")
								: refsOf(selected).length
									? h("span", { className: "ccv-mode" }, "图生图")
									: h("select", { className: "ccv-select", value: model, onChange: (e) => setModel(e.target.value) },
										MODELS.map((m) => h("option", { key: m.id, value: m.id }, m.label))),
							h("select", { className: "ccv-select", value: aspect, onChange: (e) => setAspect(e.target.value) },
								ASPECTS.map((a) => h("option", { key: a, value: a }, a))),
							sel.type === "video" ? null : h("select", { className: "ccv-select", value: count, onChange: (e) => setCount(Number(e.target.value)) },
								COUNTS.map((c) => h("option", { key: c, value: c }, `${c} 张`))),
							sel.type === "video"
								? h("select", { className: "ccv-select", value: duration, onChange: (e) => setDuration(Number(e.target.value)) },
									[4, 6, 8, 10].map((d) => h("option", { key: d, value: d }, `${d} 秒`)))
								: h("select", { className: "ccv-select", value: resolution, onChange: (e) => setResolution(e.target.value) },
									RESOLUTIONS.map((r) => h("option", { key: r, value: r }, r))),
							sel.type === "video"
								? h("select", { className: "ccv-select", value: videoRes, onChange: (e) => setVideoRes(e.target.value) },
									["480p", "720p", "1080p"].map((r) => h("option", { key: r, value: r }, r)))
								: null,
							h("input", {
								className: "ccv-seed", value: seed, placeholder: "种子",
								onChange: (e) => setSeed(e.target.value.replace(/[^0-9]/g, "")),
							}),
							h("span", { className: "ccv-spacer" }),
							h("button", {
								className: "ccv-send", onClick: generate, disabled: !!busy,
								title: busy ? busy : "生成",
							}, busy ? "…" : "↑"),
						),
					) : null,

					menu ? h("div", {
						className: "ccv-menu", style: { left: menu.x, top: menu.y },
						onMouseDown: (e) => e.stopPropagation(),
					},
						h("div", { className: "grp" }, "添加节点"),
						h("button", { onClick: () => {
							const m = menu; setMenu(null);
							if (m.linkFrom) addChild(m.linkFrom, m.side, "image");
							else addNode("image", m.world);
						} }, h("span", { className: "ico" }, "▤"), "图片"),
						h("button", { onClick: () => {
							const m = menu; setMenu(null);
							if (m.linkFrom) addChild(m.linkFrom, m.side, "video");
							else addNode("video", m.world);
						} }, h("span", { className: "ico" }, "▭"), "视频"),
						h("button", { disabled: true, title: "M2" },
							h("span", { className: "ico" }, "◎"), "导演台", h("span", { className: "tag" }, "NEW")),
						h("button", { onClick: () => { setMenu(null); addNode("script", menu.world); } },
							h("span", { className: "ico" }, "≡"), "脚本"),
						h("button", { onClick: () => { setMenu(null); addNode("text", menu.world); } },
							h("span", { className: "ico" }, "T"), "文本"),
						h("button", { onClick: () => { setMenu(null); addNode("audio", menu.world); } },
							h("span", { className: "ico" }, "♫"), "音频"),
						h("div", { className: "sep" }),
						h("div", { className: "grp" }, "添加资源"),
						h("button", { disabled: true, title: "M3" },
							h("span", { className: "ico" }, "⇪"), "上传"),
						h("button", { disabled: true, title: "M3" },
							h("span", { className: "ico" }, "⟲"), "从生成历史选择"),
					) : null,

					h("div", { className: "ccv-dock", onMouseDown: (e) => e.stopPropagation() },
					h("button", {
						className: "ccv-dockbtn" + (assetsOpen ? " on" : ""),
						title: "资产库",
						onClick: () => setAssetsOpen((v) => !v),
					}, "🗂 资产"),
					h("button", {
						className: "ccv-dockbtn" + (stripOpen ? " on" : ""),
						title: "按画面顺序看所有镜头",
						onClick: () => setStripOpen((v) => !v),
					}, `🎬 镜头 ${nodes.filter((n) => n.type === "video" && n.data?.file).length}`),
					h("span", { className: "ccv-docksep" }),
					h("button", { className: "ccv-dockbtn", title: "缩小", onClick: () => setVp((v) => ({ ...v, zoom: Math.max(0.2, v.zoom / 1.15) })) }, "−"),
					h("button", {
						className: "ccv-dockpct", title: "点击重置为 100%",
						onClick: () => setVp((v) => ({ ...v, zoom: 1 })),
					}, `${Math.round(vp.zoom * 100)}%`),
					h("button", { className: "ccv-dockbtn", title: "放大", onClick: () => setVp((v) => ({ ...v, zoom: Math.min(2.5, v.zoom * 1.15) })) }, "+"),
					h("span", { className: "ccv-docksep" }),
					h("button", { className: "ccv-dockbtn", title: "适应画布", onClick: fit }, "⤢"),
				),

				(stripOpen && nodes.some((n) => n.type === "video" && n.data?.file))
					? h("div", { className: "ccv-filmstrip", onMouseDown: (e) => e.stopPropagation() },
						h("div", { className: "ccv-film-head" },
							h("span", null, "镜头顺序（按画布位置）"),
							h("span", { style: { flex: 1 } }),
							h("button", {
								className: "ccv-qbtn",
								title: "按当前顺序拼接成一条成片（硬切）",
								onClick: async () => {
									const ids = nodes.filter((n) => n.type === "video" && n.data?.file)
										.sort((a, b) => a.x - b.x).map((n) => n.id);
									if (ids.length < 2) { setError("至少需要两个镜头才能拼接"); return; }
									try {
										setBusy("拼接中…");
										const r = await api("video.concat", { projectId: current.id, nodeIds: ids, title: "拼接成片" });
										if (r.error) throw new Error(r.error);
										const c = await api("canvas.get", { id: current.id });
										setNodes(c.canvas.nodes || []); setEdges(c.canvas.edges || []);
										setBusy("");
										showToast(`已拼接 ${ids.length} 个镜头`);
									} catch (e) { setBusy(""); setError(String(e.message || e)); }
								},
							}, "按此顺序拼接"),
							h("button", {
								className: "ccv-qbtn",
								title: "把所有镜头按顺序导出为 S01_…mp4 到 ~/.dsh/exports",
								onClick: async () => {
									try {
										setBusy("导出镜头中…");
										const r = await api("video.publishAll", { projectId: current.id });
										if (r.error) throw new Error(r.error);
										setBusy("");
										showToast(`已导出 ${r.count} 个镜头到 ${r.dir}`);
									} catch (e) { setBusy(""); setError(String(e.message || e)); }
								},
							}, "导出全部镜头"),
							h("button", { className: "ccv-qbtn", onClick: () => setStripOpen(false) }, "收起")),
						h("div", { className: "ccv-film-row" },
							nodes
								.filter((n) => n.type === "video" && n.data?.file)
								.sort((a, b) => a.x - b.x)
								.map((n, i) => h("div", {
									key: n.id, className: "ccv-film-item" + (selected === n.id ? " on" : ""),
									onClick: () => focusNode(n.id),
									title: (n.data?.title || n.data?.prompt || "").slice(0, 60),
								},
									h("video", {
										src: `/omni-canvas/media/${current?.id}/${n.data.file}`,
										muted: true, preload: "metadata",
										className: "ccv-film-thumb",
									}),
									h("div", { className: "ccv-film-idx" }, `S${String(i + 1).padStart(2, "0")}`))))
					)
					: null,

				h("div", { className: "ccv-adddock", onMouseDown: (e) => e.stopPropagation() },
					h("button", {
						className: "ccv-addbtn",
						onClick: () => {
							const rect = stageRef.current?.getBoundingClientRect();
							const btn = document.querySelector(".ccv-addbtn")?.getBoundingClientRect();
							const sx = btn && rect ? btn.left - rect.left : 200;
							const sy = btn && rect ? btn.top - rect.top - 400 : 200;
							const cx = rect ? rect.width / 2 : 400;
							const cy = rect ? rect.height / 2 : 300;
							setMenu({
								x: Math.max(12, sx), y: Math.max(12, sy),
								world: { x: Math.round((cx - vp.x) / vp.zoom - 160), y: Math.round((cy - vp.y) / vp.zoom - 100) },
							});
						},
					}, "＋ 添加")),
				(queue.running || queue.queue.length)
					? h("div", { className: "ccv-qpanel" },
						h("div", { className: "ccv-qhead" },
							h("span", { className: "ccv-qspin" }, "⟳"),
							h("span", { className: "ccv-qtitle" },
								queue.running
									? "正在跑：" + ((nodes.find((x) => x.id === queue.running.nodeId)?.data?.title) || queue.running.prompt || queue.running.nodeId || "任务")
									: "空闲"),
							queue.queue.length
								? h("button", { className: "ccv-qbtn", onClick: () => setQueueOpen((v) => !v) },
									(queueOpen ? "收起" : "排队 ") + queue.queue.length)
								: null),
						queueOpen
							? h("div", { className: "ccv-qlist" },
								queue.queue.slice(0, 8).map((it, i) => h("div", { key: it.id || i, className: "ccv-qitem" },
									h("span", null, `${i + 1}. ${(nodes.find((x) => x.id === it.nodeId)?.data?.title) || it.nodeId || "任务"}`),
									h("button", {
										className: "ccv-qbtn",
										onClick: async () => {
											try { await api("job.cancel", { jobId: it.id }); } catch {}
										},
									}, "取消"))) )
							: null)
					: null,
				

				(!nodes.length)
					? h("div", { className: "ccv-onboard" },
						h("div", { className: "ccv-onboard-title" }, "从这三步开始"),
						h("div", { className: "ccv-onboard-steps" },
							h("div", { className: "ccv-onboard-step" },
								h("span", { className: "ccv-onboard-n" }, "1"),
								h("span", null, "写一句提示词，点「＋ 添加」建图片节点，Enter 出图")),
							h("div", { className: "ccv-onboard-step" },
								h("span", { className: "ccv-onboard-n" }, "2"),
								h("span", null, "图片选中后点卡片右上「编辑」「高清」，或点「接一镜」继续做镜头")),
							h("div", { className: "ccv-onboard-step" },
								h("span", { className: "ccv-onboard-n" }, "3"),
								h("span", null, "要成片就加一张「分镜脚本卡」，逐镜出片后拼接"))),
						h("div", { className: "ccv-onboard-actions" },
							h("button", { className: "ccv-chip on", onClick: () => addNode("image", { x: 160, y: 140 }) }, "开始文生图"),
							h("button", { className: "ccv-chip", onClick: () => addNode("video", { x: 520, y: 140 }) }, "开始文生视频"),
							h("button", { className: "ccv-chip", onClick: () => addNode("script", { x: 160, y: 520 }) }, "建分镜脚本")))
					: null,
				),

				slotPicker ? h("div", { className: "ccv-picker-overlay", onClick: () => setSlotPicker(null) },
					h("div", { className: "ccv-picker", onClick: (e) => e.stopPropagation() },
						h("div", { className: "ccv-picker-head" },
							h("span", null, "选择资产（画布上的图片）"),
							h("span", { className: "sp" }),
							h("button", { className: "ccv-expand", onClick: () => setSlotPicker(null) }, "✕")),
						nodes.filter((x) => x.type !== "script" && x.data?.file).length === 0
							? h("div", { className: "ccv-picker-empty" }, "画布上还没有可用图片，先生成几张角色/场景卡")
							: h("div", { className: "ccv-picker-grid" },
								nodes.filter((x) => x.type !== "script" && x.data?.file).map((x) => {
									const role = inferRole(x);
									return h("div", { key: x.id, className: "ccv-picker-item",
										onClick: () => {
											bindRowAsset(slotPicker.nodeId, slotPicker.groupId, slotPicker.rowId, role, x.id);
											commitScript();
											setSlotPicker(null);
										} },
										h("img", { className: "ccv-picker-thumb", src: `/omni-canvas/media/${current?.id}/${x.data.file}` }),
										h("span", { className: "ccv-picker-role" }, role === "scene" ? "场景" : role === "prop" ? "道具" : "角色"));
								})),
					)) : null,

				preview ? h("div", { className: "ccv-lightbox", onClick: () => setPreview(null) },
					h("div", { className: "ccv-lightbox-inner", onClick: (e) => e.stopPropagation() },
						preview.kind === "video"
							? h("video", {
								src: `/omni-canvas/media/${current?.id}/${preview.file}`,
								controls: true, autoPlay: true, loop: true, className: "ccv-lb-media",
							})
							: h("img", { src: `/omni-canvas/media/${current?.id}/${preview.file}`, className: "ccv-lb-media" }),
						h("button", { className: "ccv-lb-close", onClick: () => setPreview(null) }, "✕"),
					),
				) : null,
			);
		}

		function apply(ctx) {
			report(`apply; betterSidebar=${typeof ctx.get("betterSidebar")}`);

			// better-sidebar 可能比本插件晚挂载：轮询等待，最多 15 秒。
			let registered = false;
			let disposeTab = () => {};
			const tryRegister = () => {
				if (registered) return true;
				const sidebar = ctx.get("betterSidebar");
				if (!sidebar || typeof sidebar.registerTab !== "function") return false;
				disposeTab = sidebar.registerTab({
					id: "omni-canvas:main",
					title: () => "画布",
					order: 55,
					dedupeKey: () => "omni-canvas:main",
					component: () => h(CanvasApp),
				});
				registered = true;
				report("tab registered");
				return true;
			};

			ctx.effect(() => {
				if (tryRegister()) return () => disposeTab();
				let tries = 0;
				const timer = setInterval(() => {
					tries += 1;
					if (tryRegister() || tries > 30) {
						clearInterval(timer);
						if (tries > 30) report("betterSidebar never appeared");
					}
				}, 500);
				return () => {
					clearInterval(timer);
					disposeTab();
				};
			}, "dsh-omni-canvas: sidebar tab");
		}

		const module = { exports: {} };
		module.exports.apply = apply;
		module.exports.__CanvasApp = CanvasApp;
		return module.exports;
	},
});
