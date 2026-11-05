/* ---- 客户端自动更新：client.js 变更后自动刷新（部署本版本时需手动强刷一次） ---- */
(() => {
  if (window.__omniCanvasVersionPoller) return;
  window.__omniCanvasVersionPoller = true;
  let cur = null;
  const ping = async () => {
    try {
      const r = await fetch("/omni-canvas/api/client.version", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await r.json();
      const v = j?.result?.version ?? j?.version ?? "0";
      if (cur == null) cur = v;
      else if (v !== cur) location.reload();
    } catch {}
  };
  setInterval(ping, 4000);
  ping();
})();

window.__ModuleLoader__.load({
	id: "@local/dsh-omni-canvas",
	factory: (require) => {
		/* ---- 子模块（构建时内联；源文件在 lib/client-src/） ---- */
		const __sub = Object.create(null);

		__sub["./helpers.js"] = (function () {
			const module = { exports: {} };
			const exports = module.exports;
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
						if (dw && dh) return { w, h: Math.max(120, Math.round(w * dh / dw)) };
				const a = n.data?.aspect || "1:1";
				const [x, y] = a.split(":").map(Number);
				const ratio = x > 0 && y > 0 ? y / x : 1;
				return { w, h: Math.max(120, Math.round(w * ratio)) };
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
			
			return { CLIENT_LOADED_AT, report, MODELS, ASPECTS, COUNTS, RESOLUTIONS, cardSize, makeAudioNode, makeTextNode, SCRIPT_COLUMNS, SCRIPT_W, ROLE_LABEL, nextRole, assetName, assetDesc, inferRole, makeScriptNode, composeRowPrompt, SKELETON, api };
			})();

			return module.exports;
		})();

		__sub["./styles.js"] = (function () {
			const module = { exports: {} };
			const exports = module.exports;
			/* 主题令牌 + 全局样式（构建时打进 client.js） */
			module.exports = (() => {
			const T = {
				bg: "#0A0A0B", panel: "#141416", panel2: "#1A1A1D",
				border: "#26262B", borderStrong: "#33333A",
				text: "#E8E8EC", dim: "#93939C",
				accent: "#4D7CFE", ok: "#35D07F", bad: "#FF5F6D",
				rCard: "12px", rCtrl: "8px",
				fsNav: "14px", fsTitle: "15px", fsBody: "13px", fsSmall: "12px",
			};
			const css = `/* 防止长提示词把页面横向顶爆：flex 链上每层都要能收缩 */
			.ccv-page{min-width:0;overflow-x:hidden}
			.ccv-set-grid{min-width:0}
			.ccv-set-card{min-width:0}
			.ccv-set-row{min-width:0}
			.ccv-hrow{min-width:0}
			.ccv-hrow-prompt{min-width:0}
			.ccv-mrow{min-width:0}
			.ccv-mrow-main{min-width:0}
			.ccv-set-val{min-width:0}
			.ccv-wrow{min-width:0}
			.ccv-set-line{min-width:0}
			.ccv-run-elapsed{font-variant-numeric:tabular-nums;color:#93939C;font-size:11px}
			.ccv-dots{position:absolute;inset:0;pointer-events:none;border-radius:12px;
			background-image:radial-gradient(circle,rgba(255,255,255,.34) 1.1px,transparent 1.3px);
			background-size:9px 9px;opacity:.9;transition:clip-path .6s linear}
			.ccv-rundot{width:6px;height:6px;border-radius:50%;background:${T.accent};animation:ccvPulse 1.4s ease-in-out infinite}
			.ccv-rundot.wait{background:#93939C;animation:none}
			@keyframes ccvPulse{0%,100%{opacity:.45;transform:scale(.85)}50%{opacity:1;transform:scale(1.15)}}
			.ccv-run{display:flex;align-items:center;gap:6px;font-size:12px;color:#C9C9D1}
			.ccv-run-label{color:#93939C}
			.ccv-run-pct{font-variant-numeric:tabular-nums;color:${T.accent};font-weight:600;letter-spacing:.3px}
			.ccv-pbar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.07);overflow:hidden;border-radius:0 0 12px 12px}
			.ccv-pbar-fill{height:100%;background:${T.accent};transition:width .5s linear;box-shadow:0 0 8px rgba(77,124,254,.6)}
			.ccv-card.run{animation:ccvBreathe 2.2s ease-in-out infinite}
			@keyframes ccvBreathe{0%,100%{box-shadow:0 0 0 1px rgba(77,124,254,.35)}50%{box-shadow:0 0 0 2px rgba(77,124,254,.7)}}
			
			.ccv-root{display:flex;flex-direction:column;height:100%;min-height:0;background:${T.bg};color:${T.text};font-size:${T.fsBody};font:13px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
			.ccv-bar{display:flex;align-items:center;gap:8px;padding:7px 10px;background:${T.panel};border-bottom:1px solid ${T.border};flex:0 0 auto}
			.ccv-btn{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;border:1px solid ${T.border};background:#1A1A1D;color:${T.text};font-size:12px;cursor:pointer;transition:.15s}
			.ccv-btn:hover{background:#202024;border-color:#33333A}
			.ccv-btn:disabled{opacity:.45;cursor:not-allowed}
			.ccv-primary{background:${T.accent};border-color:${T.accent};font-weight:600}
			.ccv-primary:hover{background:#3f6ef0;border-color:#3f6ef0}
			.ccv-select{padding:4px 6px;border-radius:8px;border:1px solid ${T.border};background:#1A1A1D;color:${T.text};font-size:12px;outline:none}
			.ccv-stage{position:relative;flex:1 1 auto;overflow:hidden;background-color:${T.bg};
			  background-image:radial-gradient(circle at 1px 1px, rgba(255,255,255,.055) 1px, transparent 0);
			  background-size:22px 22px}
			.ccv-world{position:absolute;left:0;top:0;transform-origin:0 0}
			.ccv-card{position:absolute;border-radius:12px;overflow:hidden;background:#0e1014;
			  box-shadow:0 10px 26px rgba(0,0,0,.45);transition:box-shadow .18s,border-color .18s;user-select:none;
			  border:1px solid #262a31}
			.ccv-card:hover{border-color:#33333A;box-shadow:0 12px 30px rgba(0,0,0,.55)}
			.ccv-card.sel{border-color:${T.accent};box-shadow:0 0 0 2px rgba(77,124,254,.35),0 12px 30px rgba(0,0,0,.55)}
			.ccv-card img{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
			.ccv-handle{position:absolute;width:20px;height:20px;border-radius:50%;z-index:6;
			  display:flex;align-items:center;justify-content:center;font-size:13px;line-height:1;cursor:pointer;
			  background:#1b1e24;border:1px solid #33333A;color:#c9ced8;transition:background .15s,border-color .15s}
			.ccv-handle:hover{background:${T.accent};border-color:${T.accent};color:#fff}
			.ccv-refs{display:flex;align-items:center;justify-content:flex-start;gap:6px;margin:2px 0 6px}
			.ccv-ref{width:40px;height:40px;border-radius:8px;object-fit:cover;border:1px solid #2b3038;background:#0e1014}
			
			.ccv-refhint{font-size:10.5px;color:#7a7a82;margin-left:4px;align-self:center}
			.ccv-refcount{font-size:12px;color:#93939C}
			.ccv-mode{display:inline-flex;align-items:center;padding:4px 9px;border-radius:8px;font-size:12px;
			  background:#1f2a3d;color:#8fb4ff;border:1px solid #2b3d5c}
			.ccv-home{padding:28px 32px;height:100%;overflow:auto;background:${T.bg};color:${T.text}}
			.ccv-home-hero{position:relative;border:1px solid #26262B;border-radius:16px;padding:38px 24px;text-align:center;
			  background:radial-gradient(ellipse at 50% 0%,rgba(77,124,254,.10),transparent 65%),#0e1115}
			.ccv-home-title{font-size:22px;font-weight:600;letter-spacing:.5px}
			.ccv-home-sub{margin-top:8px;font-size:13px;color:#93939C}
			.ccv-home-cta{margin-top:20px;padding:10px 22px;border-radius:12px;border:1px solid #33333A;background:#1b2a45;
			  color:#cfe0ff;font-size:13px;cursor:pointer}
			.ccv-home-cta:hover{background:#242430}
			.ccv-home-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-top:18px}
			.ccv-home-action{display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:16px;border-radius:12px;
			  border:1px solid #26262B;background:#101318;cursor:pointer;text-align:left}
			.ccv-home-action:hover{border-color:#33333A;background:#18181C}
			.ccv-ha-icon{font-size:18px}
			.ccv-ha-label{font-size:13px;color:#e6e9ef}
			.ccv-ha-desc{font-size:12px;color:#93939C}
			.ccv-home-sec{display:flex;align-items:center;gap:8px;margin:26px 0 12px;font-size:13px;color:#aab0ba}
			.ccv-home-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
			.ccv-proj{border:1px solid #26262B;border-radius:12px;overflow:hidden;background:#101318;cursor:pointer}
			.ccv-proj:hover{border-color:#33333A}
			.ccv-proj-thumb{width:100%;height:130px;object-fit:cover;display:block;background:#0a0c10}
			.ccv-proj-thumb.empty{display:flex;align-items:center;justify-content:center;color:#6B6B75;font-size:12px}
			.ccv-proj-body{padding:10px 12px}
			.ccv-proj-name{font-size:13px;color:#e6e9ef;margin-bottom:4px}
			.ccv-proj-stats{font-size:12px;color:#93939C}
			.ccv-proj-date{font-size:10.5px;color:#565c66;margin-top:3px}
			.ccv-proj-row{display:flex;align-items:center;gap:6px;margin-top:4px}
			
			.ccv-home-empty{padding:30px;text-align:center;color:#93939C;font-size:13px;border:1px dashed #262a31;border-radius:12px}
			.ccv-topbar{display:flex;align-items:center;gap:10px;padding:8px 12px;background:${T.panel};
			  border-bottom:1px solid ${T.border};position:relative;z-index:40}
			.ccv-homebtn{width:28px;height:28px;border-radius:8px;border:1px solid ${T.border};background:#15181e;
			  color:#cfd4dd;font-size:13px;cursor:pointer;line-height:1}
			.ccv-homebtn:hover{background:#202024;border-color:#33333A}
			.ccv-projwrap{position:relative}
			.ccv-projbtn{background:transparent;border:none;color:#e6e9ef;font-size:13px;cursor:pointer;padding:4px 6px;border-radius:8px}
			.ccv-projbtn:hover{background:#1b2029}
			.ccv-projmenu{position:absolute;left:0;top:34px;min-width:210px;background:#14171c;border:1px solid #2b303a;
			  border-radius:12px;padding:6px;box-shadow:0 18px 40px rgba(0,0,0,.6);z-index:60}
			.ccv-projgrp{font-size:10.5px;color:#93939C;padding:4px 8px}
			.ccv-projitem{display:block;width:100%;text-align:left;background:transparent;border:none;color:#c8ced8;
			  font-size:12.5px;padding:6px 8px;border-radius:8px;cursor:pointer}
			.ccv-projitem:hover{background:#202024}
			.ccv-projitem.on{color:#8fb4ff;background:#1b2537}
			.ccv-projitem.danger:hover{background:#2a1618;color:#ffb4b4}
			.ccv-iconbtn{width:26px;height:26px;border-radius:8px;border:1px solid ${T.border};background:#15181e;
			  color:#9aa0aa;cursor:pointer;line-height:1}
			.ccv-iconbtn:hover{color:#e6e9ef;border-color:#33333A}
			.ccv-dock{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:4px;z-index:25;
			  background:rgba(18,21,26,.92);border:1px solid ${T.border};border-radius:999px;padding:4px 8px;
			  backdrop-filter:blur(8px)}
			.ccv-dockbtn{background:transparent;border:none;color:#C9C9D1;font-size:12px;padding:4px 8px;border-radius:999px;cursor:pointer}
			.ccv-dockbtn:hover{background:#222833;color:#e6e9ef}
			.ccv-dockbtn.on{color:#8fb4ff;background:#1b2537}
			.ccv-dockpct{background:transparent;border:none;color:#9aa0aa;font-size:11.5px;min-width:44px;cursor:pointer}
			.ccv-docksep{width:1px;height:16px;background:#2b303a;margin:0 4px}
			.ccv-adddock{position:absolute;left:50%;transform:translateX(-50%);bottom:14px;z-index:25}
			.ccv-addbtn{padding:9px 20px;border-radius:999px;border:1px solid #33333A;background:#1b2a45;color:#cfe0ff;
			  font-size:13px;cursor:pointer;box-shadow:0 10px 26px rgba(0,0,0,.5)}
			.ccv-addbtn:hover{background:#242430}
			.ccv-shell{display:flex;height:100%;min-height:0;background:${T.bg};overflow:hidden}
			.ccv-side{width:196px;flex:0 0 196px;display:flex;flex-direction:column;gap:4px;padding:10px 8px;
			  background:${T.panel};border-right:1px solid ${T.border};transition:width .16s ease,flex-basis .16s ease}
			.ccv-side.mini{width:56px;flex-basis:56px;padding:10px 6px}
			.ccv-side-brand{display:flex;align-items:center;gap:8px;padding:4px 6px 12px}
			.ccv-side-logo{font-size:15px;color:#8fb4ff}
			.ccv-side-name{font-size:14px;color:#e6e9ef;font-weight:600;flex:1;white-space:nowrap;overflow:hidden}
			.ccv-side-collapse{margin-left:auto;width:20px;height:20px;border:none;border-radius:8px;background:transparent;
			  color:#93939C;cursor:pointer;font-size:12px;line-height:1}
			.ccv-side-collapse:hover{background:#202024;color:#cfd4dd}
			.ccv-side-new{display:flex;align-items:center;justify-content:center;gap:6px;margin:0 2px 10px;padding:9px 12px;
			  border-radius:8px;border:1px solid #33333A;background:#1b2a45;color:#cfe0ff;font-size:12.5px;cursor:pointer;
			  white-space:nowrap;overflow:hidden}
			.ccv-side-new:hover{background:#242430}
			.ccv-side-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border:none;border-radius:8px;
			  background:transparent;color:#aeb5c0;font-size:12.5px;cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden}
			.ccv-side-item:hover{background:#1b2029;color:#e6e9ef}
			.ccv-side-item.on{background:#1b2537;color:#cfe0ff}
			.ccv-side-ico{width:16px;text-align:center;font-size:14px}
			.ccv-side-spacer{flex:1}
			.ccv-side-foot{display:flex;align-items:center;gap:8px;padding:9px 12px 4px;border-top:1px solid ${T.border}}
			.ccv-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}
			.ccv-page{flex:1;overflow:auto;padding:26px 30px;background:${T.bg};max-width:1180px}
			.ccv-page-head{display:flex;align-items:center;gap:8px;margin-bottom:16px}
			.ccv-page-title{font-size:18px;color:${T.text};font-weight:600;letter-spacing:.2px}
			.ccv-home-cta.small{padding:6px 12px;font-size:13px}
			.ccv-projgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
			
			.ccv-trashbar{display:flex;justify-content:center;margin:18px 0 6px}
			.ccv-trashlist{margin-top:8px;border:1px solid #1e1e22;border-radius:12px;padding:6px 10px;background:#0e0e10}
			
			.ccv-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:60;display:flex;align-items:center;justify-content:center}
			.ccv-modal{width:min(720px,92vw);max-height:70vh;display:flex;flex-direction:column;
			  background:#121215;border:1px solid #2b2b33;border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.6)}
			.ccv-modal-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #212127;
			  font-size:13px;color:#e6e6ea}
			.ccv-modal-x{background:transparent;border:none;color:#8c8c94;font-size:14px;cursor:pointer;padding:2px 6px}
			.ccv-modal-body{padding:6px 14px 12px;overflow:auto}
			.ccv-card-act.danger{color:#d99}
			.ccv-home-cta.small.ghost{background:transparent;border:1px solid #2b2b33;color:#b9b9c0}
			.ccv-trashrow{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #15151a;font-size:12px}
			.ccv-trashrow:first-child{border-top:none}
			.ccv-trashtime{color:#7a7a82;min-width:110px}
			.ccv-trashname{color:#dedee3;flex:0 1 auto;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.ccv-projcard{display:flex;flex-direction:column;text-align:left;padding:0;border-radius:12px;overflow:hidden;
			  border:1px solid ${T.border};background:#15181e;cursor:pointer}
			.ccv-projcard:hover{border-color:#33333A}
			.ccv-projcard-thumb{height:104px;background:#0d1014;display:flex;align-items:center;justify-content:center;
			  color:#39404b;font-size:12px;overflow:hidden}
			.ccv-projcard-thumb img,.ccv-projcard-thumb video{width:100%;height:100%;object-fit:cover}
			.ccv-projcard-body{padding:9px 11px 11px;display:flex;flex-direction:column;gap:3px}
			.ccv-assetgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
			.ccv-assetcard{border:1px solid ${T.border};border-radius:12px;overflow:hidden;background:#0f1216;min-height:80px}
			.ccv-assetcard img,.ccv-assetcard video{width:100%;height:120px;object-fit:cover;display:block;background:#000}
			.ccv-asset-ph{height:120px;display:flex;align-items:center;justify-content:center;font-size:24px;color:#39404b}
			.ccv-asset-meta{display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:12px;color:#93939C}
			.ccv-asset-role{color:#9aa0aa}
			.ccv-asset-proj{margin-left:auto;color:#5f646d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80px}
			.ccv-chip{border:1px solid ${T.border};background:transparent;color:#9aa0aa;font-size:11.5px;padding:4px 10px;
			  border-radius:999px;cursor:pointer}
			.ccv-chip:hover{color:#e6e9ef;border-color:#33333A}
			.ccv-chip.on{background:#1b2537;color:#cfe0ff;border-color:#33333A}
			.ccv-set-card{border:none;border-radius:0;background:transparent;padding:0;margin:0 0 6px;max-width:760px}
			.ccv-set-title{display:flex;align-items:center;gap:8px;font-size:15px;color:${T.text};font-weight:600;margin:22px 0 10px}
			
			.ccv-baklist{margin-top:6px;border-top:1px solid #1b1b20;padding-top:6px;display:flex;flex-direction:column;gap:4px}
			.ccv-bakrow{display:flex;align-items:center;gap:10px;font-size:11.5px;color:#9a9aa2}
			.ccv-bakdate{width:96px}
			.ccv-bakui{width:70px;color:#7a7a82}
			
			
			.ccv-faq{margin-top:6px;display:flex;flex-direction:column;gap:10px}
			.ccv-faqitem{border-top:1px solid #141418;padding-top:8px}
			.ccv-faqitem:first-child{border-top:none;padding-top:0}
			.ccv-faqq{font-size:12px;color:#e2e2e6;margin-bottom:3px}
			.ccv-faqa{font-size:11.5px;color:#9a9aa2;line-height:1.75}
			.ccv-envrow{display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid #141418;font-size:12px}
			.ccv-envrow:first-of-type{border-top:none}
			.ccv-envmark{width:14px;color:#86b18e}
			.ccv-envmark.bad{color:#c98a8a}
			.ccv-envlabel{color:#dedee3;min-width:210px}
			.ccv-envdetail{color:#8a8a92}
			.ccv-envfix{color:#e0b45c;font-size:11.5px}
			.ccv-set-row{display:flex;align-items:center;gap:14px;padding:13px 16px;margin-bottom:8px;border:1px solid ${T.border};border-radius:12px;background:${T.panel};font-size:${T.fsBody}}
			.ccv-set-label{flex:0 0 132px;color:${T.dim};font-size:${T.fsBody}}
			.ccv-set-val{flex:1;color:${T.text};word-break:break-all;text-align:right}
			.ccv-input{flex:1;padding:6px 10px;border-radius:8px;border:1px solid ${T.border};background:#0d1014;
			  color:#c8ced8;font-size:12px;outline:none}
			.ccv-set-ok{font-size:${T.fsSmall};color:${T.ok};margin-top:4px}
			.ccv-set-bad{font-size:${T.fsSmall};color:${T.bad};margin-top:4px}
			.ccv-set-line{display:flex;align-items:baseline;gap:8px;padding:10px 16px;border:1px solid ${T.border};border-radius:12px;background:${T.panel};font-size:${T.fsBody};color:${T.text};flex-wrap:wrap;margin-bottom:8px}
			.ccv-tick{font-size:12px}
			.ccv-set-cap{color:#cfd4dd}
			.ccv-set-miss{color:#ffb4b4;font-size:11.5px}
			.ccv-empty{padding:40px 0;text-align:center;color:#5f646d;font-size:12.5px}
			/* ===== 中性主题覆盖：近黑 + 灰阶，去蓝 ===== */
			.ccv-shell{background:#0a0a0b}
			.ccv-side{width:196px;flex:0 0 196px;background:${T.panel};border-right:1px solid ${T.border};padding:12px 10px;gap:1px}
			.ccv-side.mini{width:52px;flex-basis:52px;padding:12px 6px}
			.ccv-side-brand{padding:2px 4px 12px;gap:7px}
			.ccv-side-logo{color:#c9c9ce;font-size:14px}
			.ccv-side-name{font-size:14px;color:#d2d2d6;font-weight:500}
			.ccv-side-collapse{color:#4f4f55;font-size:14px}
			.ccv-side-collapse:hover{background:#151517;color:#b9b9be}
			.ccv-side-new{background:${T.accent};border:1px solid ${T.accent};color:#fff;font-size:14px;padding:7px 10px;
			  border-radius:8px;font-weight:400}
			.ccv-side-new:hover{background:#1a1a1d;border-color:#323237}
			.ccv-side-item{color:${T.dim};font-size:14px;padding:7px 9px;border-radius:8px;gap:9px}
			.ccv-side-item:hover{background:#131315;color:#cdcdd2}
			.ccv-side-item.on{background:#161618;color:#f2f2f4}
			.ccv-side-ico{color:#6a6a70;font-size:14px;width:14px}
			.ccv-side-item.on .ccv-side-ico{color:#b9b9be}
			.ccv-side-foot{border-top:1px solid #17171a;padding:8px 6px 2px}
			.ccv-main{background:#0a0a0b}
			.ccv-page{padding:26px 30px;max-width:1180px}
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
			.ccv-home-sub{font-size:13px;color:#5f5f66;margin-top:6px}
			.ccv-home-title{font-size:19px;font-weight:600;color:#f0f0f2;letter-spacing:.5px}
			.ccv-home-sub{font-size:13px;color:#6f6f76;margin-top:6px}
			.ccv-home-cta{background:#f2f2f4;color:#0a0a0b;border:none;border-radius:8px;font-size:13px;
			  padding:9px 16px;font-weight:500;margin-top:16px}
			.ccv-home-cta:hover{background:#fff}
			.ccv-home-cta.small{background:#141416;color:#dcdce0;border:1px solid #232326;padding:6px 12px;margin-top:0}
			.ccv-home-cta.small:hover{background:#1a1a1d}
			.ccv-home-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
			.ccv-home-action{background:#0e0e10;border:1px solid #1a1a1d;border-radius:12px;padding:14px 14px 12px;
			  text-align:left;cursor:pointer;transition:border-color .12s,background .12s}
			.ccv-home-action:hover{background:#121214;border-color:#2c2c31}
			.ccv-ha-icon{font-size:13px;color:#9a9aa1;display:block;margin-bottom:10px}
			.ccv-ha-label{font-size:12.5px;color:#dedee2;display:block}
			.ccv-ha-desc{font-size:12px;color:#63636a;display:block;margin-top:3px}
			.ccv-home-sec{display:flex;align-items:center;gap:8px;margin:24px 0 10px;font-size:13px;color:#8a8a91}
			.ccv-home-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
			.ccv-proj{background:#0e0e10;border:1px solid #1a1a1d;border-radius:12px;overflow:hidden}
			.ccv-proj:hover{border-color:#2c2c31;background:#121214}
			.ccv-proj-name{font-size:12.5px;color:#dedee2}
			.ccv-proj-stats,.ccv-proj-date{font-size:12px;color:#63636a}
			
			/* 项目卡 */
			.ccv-projgrid{grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
			.ccv-projcard{background:#0e0e10;border:1px solid #1a1a1d;border-radius:12px}
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
			.ccv-input{background:#08080a;border:1px solid #1e1e21;color:#b9b9be;font-size:12px;padding:6px 10px;border-radius:8px}
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
			.ccv-homebtn{background:#141416;border:1px solid #232326;color:#c4c4ca;border-radius:8px}
			.ccv-homebtn:hover{background:#1a1a1d;border-color:#323237;color:#ededf0}
			.ccv-projbtn{color:#e4e4e8;font-size:12.5px}
			.ccv-projbtn:hover{background:#151517}
			.ccv-iconbtn{background:#141416;border:1px solid #232326;color:#85858c;border-radius:8px}
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
			.ccv-side-collapse{font-size:14px}
			.ccv-side-new{font-size:14px;padding:9px 12px}
			.ccv-side-item{font-size:14px;padding:9px 12px}
			.ccv-side-foot{font-size:14px}
			
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
			.ccv-wftag{font-size:12px;color:#8f8f96;border:1px solid #232326;border-radius:999px;padding:1px 8px}
			
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
			.ccv-cap-badge{font-size:12px;color:#7d7d84;border:1px solid #232326;border-radius:999px;padding:1px 8px}
			.ccv-cap-cands{margin:8px 0 0 18px;display:flex;flex-direction:column;gap:6px}
			.ccv-cap-cand{display:flex;align-items:center;gap:9px;font-size:12px}
			.ccv-cap-candname{color:#b9b9be}
			.ccv-cap-state{font-size:12px;color:#5f5f66}
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
			.ccv-hrow-time{font-size:12px;color:#6f6f76;width:44px;text-align:right}
			.ccv-hrow-err{font-size:12px;color:#c98a8a;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
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
			.ccv-assist-pre{max-height:220px;font-size:12px;line-height:1.7}
			
			.ccv-set-grid{align-items:stretch}
			.ccv-set-card{display:flex;flex-direction:column}
			.ccv-set-miss{display:block;flex-basis:100%;padding-left:19px;margin-top:2px}
			.ccv-set-line{flex-wrap:wrap;row-gap:2px}
			
			
			
			
			.ccv-row{position:relative;flex-wrap:nowrap;gap:5px}
			.ccv-row .ccv-select{max-width:112px;min-width:0;padding:4px 6px;font-size:11.5px}
			.ccv-row .ccv-durbtn{max-width:96px;padding:4px 6px;font-size:11.5px}
			.ccv-row .ccv-seed{width:56px;min-width:0;font-size:12px}
			.ccv-select,.ccv-durbtn{max-width:132px;text-overflow:ellipsis;white-space:nowrap}
			.ccv-durbtn{background:#1a1a1e;border:1px solid #2c2c33;color:#dcdce2;cursor:pointer;padding:4px 8px;border-radius:8px;font-size:12px}
			.ccv-durbtn.on{border-color:#4a4a55;color:#fff}
			.ccv-durpop{position:absolute;bottom:calc(100% + 8px);left:0;z-index:40;width:290px;background:#17171b;
			  border:1px solid #2f2f37;border-radius:11px;padding:10px 12px;box-shadow:0 14px 34px rgba(0,0,0,.55)}
			.ccv-durpop-head{font-size:11.5px;color:#9a9aa2;margin-bottom:8px}
			.ccv-durpop-row{display:flex;align-items:center;gap:8px}
			.ccv-durpop-quick{display:flex;gap:5px;margin-top:9px;flex-wrap:wrap}
			.ccv-durrange{flex:1;accent-color:#9aa6b8;cursor:pointer}
			.ccv-durwrap{display:flex;align-items:center;gap:6px;background:#1a1a1e;border:1px solid #2c2c33;border-radius:8px;padding:2px 8px}
			.ccv-durrange{width:96px;accent-color:#9aa6b8;cursor:pointer}
			.ccv-durinput{width:40px;background:transparent;border:none;color:#dcdce2;font-size:12px;text-align:right;outline:none}
			.ccv-durlab{color:#8a8a92;font-size:12px}
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
			.ccv-qbtn{background:#22222a;border:1px solid #3a3a44;color:#cfcfd6;font-size:12px;
			  padding:2px 8px;border-radius:8px;cursor:pointer}
			.ccv-qbtn:hover{background:#2d2d36;color:#fff}
			.ccv-qlist{margin-top:8px;border-top:1px solid #26262c;padding-top:6px;display:flex;flex-direction:column;gap:4px}
			.ccv-qitem{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#a9a9b1}
			.ccv-qitem span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.ccv-queue{font-size:12px;padding:2px 8px;border-radius:999px;background:#2a2413;border:1px solid #4d3f19;color:#e6c06a}
			.ccv-check{display:flex;align-items:center;gap:4px;font-size:11.5px;color:#C9C9D1;cursor:pointer}
			.ccv-check input{accent-color:#4d7cfe}
			.ccv-assets-filter{display:flex;flex-wrap:wrap;gap:5px;padding:6px 10px;border-bottom:1px solid #26262B;align-items:center}
			.ccv-assets-filter .ccv-chip{flex:0 0 auto;white-space:nowrap;font-size:11px;padding:1px 8px;height:20px;line-height:18px}
			.ccv-chip{font-size:12px;padding:2px 9px;border-radius:999px;border:1px solid #2b303a;background:transparent;color:#9aa0aa;cursor:pointer}
			.ccv-chip.on{background:#1f2a3d;border-color:#33333A;color:#8fb4ff}
			.ccv-cancel{font-size:10.5px;margin-left:6px;padding:1px 7px;border-radius:5px;border:1px solid #5b2b2f;
			  background:rgba(42,22,24,.9);color:#ffb4b4;cursor:pointer}
			.ccv-sc-mini{width:18px;border:none;background:transparent;color:#93939C;cursor:pointer;font-size:12px}
			.ccv-sc-mini:hover{color:#e6e9ef;background:#232830}
			.ccv-stale{padding:3px 9px;border-radius:999px;font-size:12px;background:#3a2d12;border:1px solid #6b5320;color:#ffd479}
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
			  background:rgba(10,10,12,.72);padding:2px 7px;border-radius:8px;z-index:5}
			
			
			.ccv-titlewrap{position:absolute;pointer-events:none;z-index:8}
			.ccv-titlewrap > *{pointer-events:auto}
			
			.ccv-titlewrap{display:flex;align-items:center;justify-content:space-between;gap:8px}
			.ccv-card-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.ccv-card-title.empty{width:14px;height:11px;border-bottom:1px dashed transparent}
			.ccv-card-title.empty:hover{border-bottom-color:#4a4a55}
			.ccv-card-res{flex:0 0 auto;font-size:10px;color:#666a72;white-space:nowrap;letter-spacing:.2px}
			.ccv-titlewrap{gap:12px;padding-right:1px}
			.ccv-card-title{flex:0 1 auto;min-width:0;font-size:11.5px;color:#8f939b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text;user-select:none}
			.ccv-card-title:hover{color:#c8ccd4}
			.ccv-card-title.empty{width:16px;height:12px;border-bottom:1px dashed transparent}
			.ccv-card-title.empty:hover{border-bottom-color:#4a4a55}
			.ccv-card-title-edit{flex:1 1 auto;min-width:0;background:#15151a;border:1px solid #3a3a44;border-radius:5px;color:#e6e6ea;font-size:11.5px;padding:1px 6px;outline:none}
			
			.ccv-card-tag{font-size:10px;padding:1px 6px;border-radius:5px;background:rgba(38,52,38,.9);
			  border:1px solid #37543a;color:#a9d0a9;white-space:nowrap}
			
			.ccv-toolbar{position:absolute;z-index:40;display:flex;align-items:center;gap:2px;
			  background:rgba(24,24,28,.92);border:1px solid #34343c;border-radius:11px;padding:4px;
			  box-shadow:0 8px 28px rgba(0,0,0,.5);backdrop-filter:blur(10px)}
			.ccv-tb-btn{background:transparent;border:none;color:#dcdce2;font-size:12px;padding:6px 10px;border-radius:8px;cursor:pointer;white-space:nowrap}
			.ccv-tb-btn:hover{background:#2c2c35;color:#fff}
			.ccv-tb-split{display:flex;align-items:center;background:transparent;border-radius:8px}
			.ccv-tb-select{background:transparent;border:none;color:#9aa0aa;font-size:12px;padding:4px 2px;cursor:pointer;outline:none}
			.ccv-tb-menu{position:absolute;top:40px;right:0;min-width:150px;background:#1b1b21;border:1px solid #34343c;
			  border-radius:12px;padding:4px;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,.5)}
			.ccv-tb-menu button{background:transparent;border:none;color:#cfcfd6;font-size:12px;text-align:left;padding:7px 10px;border-radius:8px;cursor:pointer}
			.ccv-tb-menu button:hover{background:#2a2a33;color:#fff}
			.ccv-tb-menu button.danger{color:#d99}
			.ccv-card-act{white-space:nowrap;background:rgba(20,20,24,.86);border:1px solid #34343c;color:#d8d8dd;font-size:12px;
			  padding:2px 7px;border-radius:8px;cursor:pointer;line-height:1.5}
			.ccv-card-act:hover{background:#2a2a31;border-color:#4a4a55;color:#fff}
			.ccv-card-name{font-size:12px;color:#e6e9ef;text-shadow:0 1px 3px rgba(0,0,0,.8);cursor:text;
			  max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.ccv-card-role{font-size:10px;padding:1px 6px;border-radius:999px;background:rgba(31,42,61,.9);
			  border:1px solid #2b3d5c;color:#8fb4ff;cursor:pointer}
			.ccv-card-role:hover{background:#2a3b55}
			.ccv-name-edit{font-size:12px;background:#0f1216;border:1px solid #33333A;border-radius:5px;color:#e6e9ef;
			  padding:1px 5px;outline:none;max-width:70%}
			.ccv-sc-assets{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:3px 6px;min-height:24px}
			.ccv-sc-chip{display:inline-flex;align-items:center;padding:1px 6px;border-radius:999px;font-size:10.5px;
			  background:#1f2a3d;border:1px solid #2b3d5c;color:#8fb4ff;cursor:pointer}
			.ccv-sc-chip.missing{background:#2a1618;border-color:#5b2b2f;color:#ffb4b4}
			.ccv-sc-addasset{width:20px;height:18px;border-radius:5px;border:1px dashed #3a4250;background:transparent;
			  color:#93939C;font-size:12px;cursor:pointer;line-height:1}
			.ccv-sc-addasset:hover{border-color:${T.accent};color:${T.accent}}
			.ccv-picker-overlay{position:fixed;inset:0;z-index:210;background:rgba(5,6,8,.72);display:flex;align-items:center;justify-content:center}
			.ccv-picker{width:520px;max-height:70vh;background:#141416;border:1px solid #2b2f37;border-radius:12px;
			  display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.6)}
			.ccv-picker-head{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid #26262B;font-size:12.5px;color:#E8E8EC}
			.ccv-picker-head .sp{flex:1}
			.ccv-picker-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:10px;overflow:auto}
			.ccv-picker-item{position:relative;border-radius:8px;overflow:hidden;border:1px solid #262a31;cursor:pointer;aspect-ratio:1/1}
			.ccv-picker-item:hover{border-color:${T.accent}}
			.ccv-picker-thumb{width:100%;height:100%;object-fit:cover;display:block}
			.ccv-picker-role{position:absolute;left:4px;bottom:4px;font-size:10px;padding:1px 6px;border-radius:999px;
			  background:rgba(10,12,16,.8);color:#a9b0bb}
			.ccv-picker-empty{padding:24px;text-align:center;color:#93939C;font-size:12px}
			.ccv-assets{position:absolute;left:0;top:0;bottom:0;width:336px;display:flex;flex-direction:column;background:rgba(18,21,26,.97);
			  border-right:1px solid #26262B;z-index:70;display:flex;flex-direction:column;backdrop-filter:blur(6px)}
			.ccv-assets-head{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid #26262B;
			  font-size:12px;color:#cfd4dd}
			.ccv-assets-head .sp{flex:1}
			.ccv-assets-grid{flex:1 1 auto;min-height:0;overflow-y:auto;padding:8px;column-count:2;column-gap:8px}
			.ccv-assets-search{padding:8px 10px 4px}
			.ccv-search{width:100%;box-sizing:border-box;background:#0f1216;border:1px solid #262a31;border-radius:8px;
			  color:#E8E8EC;font-size:11.5px;padding:6px 8px;outline:none}
			.ccv-search:focus{border-color:#33333A}
			.ccv-asset-role{position:absolute;left:4px;top:4px;z-index:2;font-size:9.5px;padding:1px 6px;border-radius:999px;
			  background:rgba(10,12,16,.82);color:#9aa0aa}
			.ccv-asset-role.character{color:#8fb4ff}
			.ccv-asset-role.scene{color:#7fd6a8}
			.ccv-asset-role.prop{color:#e6c06a}
			.ccv-asset{position:relative;border-radius:8px;overflow:hidden;border:1px solid #262a31;background:#0e1014;min-height:64px;margin:0 0 8px;break-inside:avoid;-webkit-column-break-inside:avoid}
			.ccv-asset-media{width:100%;height:100%;object-fit:cover;display:block;cursor:zoom-in;background:#0a0b0f}
			.ccv-asset-media:hover{opacity:.85}
			.ccv-asset-del{position:absolute;right:3px;top:3px;width:18px;height:18px;border-radius:50%;border:none;
			  background:rgba(10,12,16,.8);color:#cfd4dd;font-size:10px;cursor:pointer;display:none}
			.ccv-asset:hover .ccv-asset-del{display:block}
			.ccv-script{position:absolute;background:#12151a;border:1px solid #262a31;border-radius:12px;
			  box-shadow:0 12px 30px rgba(0,0,0,.5);overflow:hidden;user-select:none}
			.ccv-script.sel{border-color:${T.accent};box-shadow:0 0 0 2px rgba(77,124,254,.3),0 12px 30px rgba(0,0,0,.5)}
			.ccv-script-head{display:flex;align-items:center;gap:8px;padding:7px 10px;background:#171a20;border-bottom:1px solid #26262B}
			.ccv-sc-title{font-size:12.5px;color:#E8E8EC;font-weight:600}
			.ccv-sc-sum{font-size:12px;color:#93939C}
			.ccv-sc-group{border-bottom:1px solid #1d2027}
			.ccv-sc-group-head{display:flex;align-items:center;gap:6px;padding:6px 10px;background:#161a20}
			.ccv-sc-gtitle{width:70px;background:transparent;border:none;color:#cfd4dd;font-size:12px;font-weight:600;outline:none}
			.ccv-sc-lab{font-size:10.5px;color:#6d737d}
			.ccv-sc-gfield{flex:1;min-width:80px;background:#0f1216;border:1px solid #26262B;border-radius:5px;
			  color:#c3c9d2;font-size:11.5px;padding:3px 6px;outline:none}
			.ccv-sc-row{display:flex;align-items:stretch;border-top:1px solid #1b1e24}
			.ccv-sc-row.head{background:#14171c;border-top:none}
			.ccv-sc-th{font-size:10.5px;color:#93939C;padding:5px 6px;box-sizing:border-box;flex:0 0 auto}
			.ccv-sc-cell{background:transparent;border:none;border-right:1px solid #1b1e24;color:#E8E8EC;
			  font-size:11.5px;padding:5px 6px;outline:none;box-sizing:border-box;flex:0 0 auto;font-family:inherit}
			.ccv-sc-cell:focus{background:#1b2027;box-shadow:inset 0 0 0 1px #33333A}
			.ccv-sc-go{width:44px;border:none;background:transparent;color:#93939C;cursor:pointer;font-size:12px}
			.ccv-sc-go:hover{background:#22303f;color:#8fb4ff}
			.ccv-sc-addrow{padding:5px 8px}
			.ccv-lightbox{position:fixed;inset:0;z-index:200;background:rgba(5,6,8,.88);display:flex;
			  align-items:center;justify-content:center;backdrop-filter:blur(4px)}
			.ccv-lightbox-inner{position:relative;max-width:92vw;max-height:92vh;display:flex;align-items:center;justify-content:center}
			.ccv-lb-media{max-width:92vw;max-height:92vh;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.7);display:block}
			.ccv-lb-close{position:absolute;top:-14px;right:-14px;width:30px;height:30px;border-radius:50%;border:1px solid #33333A;
			  background:#1b1e24;color:#E8E8EC;cursor:pointer;font-size:14px;line-height:1}
			.ccv-lb-close:hover{background:#33333A}
			.ccv-dotport{position:absolute;width:16px;height:16px;border-radius:50%;background:#1b1e24;
			  border:1px solid #3a4250;color:#c9ced8;font-size:12px;line-height:14px;text-align:center;
			  cursor:pointer;z-index:60;user-select:none}
			.ccv-dotport:hover{background:${T.accent};border-color:${T.accent};color:#fff}
			.ccv-menu{position:absolute;z-index:40;background:#171a1f;border:1px solid #2b2f37;border-radius:12px;
			  padding:8px;box-shadow:0 18px 44px rgba(0,0,0,.6);display:flex;flex-direction:column;gap:2px;min-width:246px}
			.ccv-menu .grp{font-size:12px;color:#71767f;padding:6px 8px 4px}
			.ccv-menu button{all:unset;display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:8px;
			  font-size:12.5px;color:#E8E8EC;cursor:pointer}
			.ccv-menu button:hover{background:#202024}
			.ccv-menu button:disabled{opacity:.38;cursor:not-allowed}
			.ccv-menu .ico{width:16px;text-align:center;opacity:.85}
			.ccv-menu .tag{margin-left:auto;font-size:10px;padding:1px 6px;border-radius:999px;background:#1f2a3d;color:#7fb0ff}
			.ccv-menu .sep{height:1px;background:#24272e;margin:6px 4px}
			.ccv-tools{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
			.ccv-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:8px;
			  border:1px solid ${T.border};background:#171a1f;color:#b9bfc9;font-size:11.5px;cursor:pointer}
			.ccv-chip:hover{background:#20242b;color:#E8E8EC}
			.ccv-chip:disabled{opacity:.45;cursor:not-allowed}
			.ccv-send{width:34px;height:34px;border-radius:50%;border:1px solid #3a4250;background:#2a3340;
			  color:#dfe6f2;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;
			  transition:background .15s,border-color .15s}
			.ccv-send:hover:not(:disabled){background:#3a4a5f;border-color:#4b5b74}
			.ccv-send:disabled{opacity:.5;cursor:not-allowed}
			.ccv-seed{width:74px;padding:4px 7px;border-radius:8px;border:1px solid ${T.border};background:#1A1A1D;
			  color:${T.text};font-size:12px;outline:none}
			.ccv-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#39404b;font-size:36px}
			.ccv-run{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
			  background:rgba(8,9,12,.55);font-size:12px;color:#ffd479;letter-spacing:.5px}
			.ccv-float{position:absolute;z-index:20;background:${T.panel};border:1px solid ${T.border};border-radius:12px;
			  padding:9px;box-shadow:0 18px 40px rgba(0,0,0,.55);cursor:default}
			.ccv-ta{width:100%;box-sizing:border-box;min-height:118px;max-height:300px;resize:none;border-radius:0;
			  border:none;background:transparent;color:${T.text};padding:6px 2px;font-size:13.5px;
			  outline:none;font-family:inherit;line-height:1.6}
			.ccv-ta::placeholder{color:#5f646d}
			.ccv-float-head{position:absolute;top:3px;right:5px;height:0;margin:0;padding:0;display:block;z-index:3}
			.ccv-float>.ccv-ta{padding-right:26px}
			.ccv-float-head .sp{flex:1}
			.ccv-expand{width:22px;height:22px;border-radius:8px;border:none;background:transparent;color:#7d838d;
			  cursor:pointer;font-size:13px;line-height:1}
			.ccv-expand:hover{background:#202024;color:#E8E8EC}
			.ccv-video{width:100%;height:100%;object-fit:cover;display:block;background:#000}
			.ccv-audio{position:absolute;background:#11141a;border:1px solid #262a31;border-radius:12px;overflow:hidden;
			  box-shadow:0 12px 30px rgba(0,0,0,.5)}
			.ccv-audio.sel{border-color:#4d7cfe;box-shadow:0 0 0 2px rgba(77,124,254,.28),0 12px 30px rgba(0,0,0,.5)}
			.ccv-audio-head{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid #20242b;
			  font-size:12px;color:#aab0ba;cursor:grab}
			.ccv-audio-player{display:block;width:100%;margin:0;background:#0d1014}
			
			.ccv-audio-ta{width:100%;min-height:56px;resize:vertical;background:#0d1014;border:1px solid #2a2e36;
			  border-radius:8px;color:#E8E8EC;font-size:12px;padding:6px 8px;outline:none}
			.ccv-audio-row{display:flex;gap:6px;align-items:center}
			.ccv-audio-row .ccv-select{flex:1;min-width:0}
			
			
			.ccv-selbox{position:absolute;border:1px dashed #6f8dff;background:rgba(90,120,255,.12);
			  border-radius:4px;pointer-events:none;z-index:20}
			.ccv-multibar{display:flex;align-items:center;gap:8px;background:rgba(14,16,22,.96);
			  border:1px solid #2a3342;border-radius:9px;padding:6px 10px;font-size:12px;color:#dfe4ee;
			  box-shadow:0 8px 22px rgba(0,0,0,.5)}
			.ccv-multibar-n{color:#9fb2d8}
			.ccv-multibar-hint{color:#6f7a8c;font-size:11.5px}
			.ccv-multibar button{background:#1b2230;border:1px solid #2c3648;color:#dfe4ee;
			  border-radius:8px;padding:3px 8px;font-size:12px;cursor:pointer}
			.ccv-multibar button:hover{background:#243046}
			.ccv-audio-empty{padding:14px 12px;display:flex;flex-direction:column;gap:6px;font-size:12px;color:#93939C}
			.ccv-audio-hint{font-size:12px;color:#5f6670;line-height:1.5}
			.ccv-text{position:absolute;background:#11141a;border:1px solid #262a31;border-radius:12px;overflow:hidden;
			  box-shadow:0 12px 30px rgba(0,0,0,.5);cursor:default}
			.ccv-text.sel{border-color:#4d7cfe;box-shadow:0 0 0 2px rgba(77,124,254,.28),0 12px 30px rgba(0,0,0,.5)}
			.ccv-text-head{display:flex;align-items:center;gap:6px;padding:8px 12px;border-bottom:1px solid #20242b;
			  font-size:12px;color:#aab0ba;cursor:grab}
			.ccv-text-ico{font-size:12px;color:#93939C}
			.ccv-text-title{color:#cfd4dd}
			.ccv-text-body{padding:14px;max-height:520px;overflow:auto}
			.ccv-text-content{white-space:pre-wrap;font-size:12.5px;line-height:1.85;color:#c8ced8;word-break:break-word}
			.ccv-text-edit{display:block;width:100%;box-sizing:border-box;height:300px;resize:vertical;border:none;outline:none;
			  background:transparent;color:#E8E8EC;font-size:12.5px;line-height:1.85;padding:14px;font-family:inherit}
			.ccv-text-empty{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:6px 4px 10px}
			.ccv-text-lines{font-size:34px;color:#33333A;line-height:1;margin-bottom:2px}
			.ccv-text-try{font-size:12px;color:#93939C;margin:2px 0 4px}
			.ccv-text-act{display:flex;align-items:center;gap:8px;background:transparent;border:none;color:#C9C9D1;
			  font-size:12.5px;padding:4px 2px;cursor:pointer}
			.ccv-text-act:hover{color:#e6e9ef}
			.ccv-text-dot{font-size:10px;color:#93939C}
			.ccv-videobox{position:relative;width:100%;height:100%}
			.ccv-videomask{position:absolute;left:0;right:0;top:0;bottom:56px;z-index:2;cursor:default}
			.ccv-ta:focus{border-color:#3a4250}
			.ccv-row{display:flex;align-items:center;gap:6px;margin-top:7px;flex-wrap:wrap}
			.ccv-spacer{flex:1}
			.ccv-hint{font-size:12px;color:${T.dim}}
			.ccv-dot{width:8px;height:8px;border-radius:50%;display:inline-block}
			.ccv-err{padding:8px 10px;border-radius:9px;background:#241417;border:1px solid #5c2a31;color:#ffb3ba;font-size:12px;white-space:pre-wrap}
			.ccv-zoom{position:absolute;right:12px;bottom:12px;display:flex;gap:6px;align-items:center;z-index:15}
			.ccv-mini{width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:8px;
			  border:1px solid ${T.border};background:rgba(20,22,26,.92);color:#c9ced8;cursor:pointer;font-size:13px}
			
			.ccv-onboard{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);z-index:12;
			  background:rgba(16,16,19,.9);border:1px solid #26262c;border-radius:14px;padding:18px 20px;max-width:520px}
			.ccv-onboard-title{font-size:13px;color:#e8e8ec;margin-bottom:10px}
			.ccv-onboard-steps{display:flex;flex-direction:column;gap:8px}
			.ccv-onboard-step{display:flex;gap:10px;align-items:flex-start;font-size:12px;color:#9d9da5;line-height:1.7}
			.ccv-onboard-n{flex:0 0 18px;height:18px;border-radius:50%;background:#23232a;color:#cfcfd6;
			  font-size:12px;display:flex;align-items:center;justify-content:center}
			.ccv-onboard-actions{display:flex;gap:8px;margin-top:14px}
			.ccv-status{position:absolute;left:10px;bottom:10px;font-size:12px;color:${T.dim};z-index:15}
			/* ===== 覆盖层（最后生效）：去大卡片 + 新建项目中性化 ===== */
			.ccv-set-card{border:none !important;background:transparent !important;padding:0 !important;margin:0 0 4px !important;border-radius:0 !important;box-shadow:none !important}
			.ccv-assist{border:none !important;background:transparent !important;padding:0 !important;margin:0 !important}
			.ccv-set-grid{gap:0 !important}
			.ccv-set-title{margin:40px 0 16px !important;font-size:17px !important;font-weight:700 !important;letter-spacing:.2px}
			/* 只有整页第一个板块贴顶；其余板块保持 40px 层次间距 */
			.ccv-set-grid > .ccv-set-card:first-child > .ccv-set-title:first-child{margin-top:8px !important}
			/* 环境自检并入 ComfyUI 连接：标题降级为小标签，两块之间的间隔收掉 */
			.ccv-set-card:has(.ccv-envrow){margin-bottom:-6px !important}
			.ccv-set-card:has(.ccv-envrow) > .ccv-set-title{font-size:12px !important;font-weight:500 !important;margin:0 0 6px !important;color:${T.dim} !important}
			.ccv-set-row{padding:16px 18px !important;margin-bottom:10px !important}
			.ccv-set-line{padding:14px 18px !important;margin-bottom:10px !important}
			.ccv-set-desc{margin-top:6px !important;font-size:12px !important;line-height:18px}
			.ccv-set-grid > * + *{margin-top:0 !important}
			/* 配置助手块：与下面 ComfyUI 拉开层次 */
			.ccv-assist{padding-bottom:14px !important;margin-bottom:0 !important}
			.ccv-assist + .ccv-set-card > .ccv-set-title{margin-top:18px !important}
			.ccv-mrow-main{display:flex;flex-direction:column;gap:2px}
			.ccv-mrow-hint{font-size:12px;color:${T.dim}}
			.ccv-mrow-hint.bad{color:${T.bad}}
			.ccv-mrow-none{color:${T.dim};width:260px;text-align:right}
			.ccv-mrow.need .ccv-mrow-name{color:${T.dim}}
			.ccv-set-card.wf.collapsed > *:not(.ccv-set-title){display:none !important}
			.ccv-mrow{display:flex;align-items:center;gap:12px}
			.ccv-mrow-ico{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;color:${T.dim};font-size:14px;flex:0 0 20px}
			.ccv-mrow-name{line-height:20px}
			.ccv-set-statusline{font-size:12px;color:${T.dim};white-space:nowrap}
			.ccv-assist-head{display:flex;align-items:center;gap:10px}
			.ccv-assist-head .ccv-set-hint{margin:0 !important}
			.ccv-mrow-sel{width:260px !important;margin-left:auto}
			.ccv-side-new{background:${T.panel2} !important;border:1px solid ${T.borderStrong} !important;color:${T.text} !important;font-weight:500 !important}
			.ccv-side-new:hover{background:${T.panel} !important;border-color:${T.dim} !important}
			/* 默认模型行：强制单行，图标与文字同基线 */
			.ccv-mrow{display:flex !important;flex-direction:row !important;flex-wrap:nowrap !important;align-items:center !important;gap:12px !important;padding:14px 18px !important;margin:0 0 10px !important}
			.ccv-mrow-ico{display:inline-flex !important;align-items:center !important;justify-content:center !important;flex:0 0 20px !important;width:20px !important;height:20px !important;margin:0 !important;font-size:14px !important;line-height:1 !important}
			.ccv-mrow-main{display:flex !important;flex-direction:row !important;align-items:center !important;gap:8px !important;flex:0 1 auto !important}
			.ccv-mrow-name{line-height:20px !important;font-size:13px !important;color:${T.text} !important}
			.ccv-mrow-hint{font-size:12px !important;line-height:20px !important;color:${T.dim} !important}
			.ccv-mrow-hint.bad{color:${T.bad} !important}
			.ccv-mrow-sel{flex:0 0 260px !important;width:260px !important;margin:0 0 0 auto !important}
			.ccv-wrow-err{font-size:12px;color:${T.bad};margin-left:10px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.ccv-mrow-none{flex:0 0 260px !important;text-align:right !important;color:${T.dim} !important}
			.ccv-mrow-state{display:none !important}
			/* 配置助手标题行：单行、基线对齐 */
			.ccv-assist-head{display:flex !important;flex-direction:row !important;align-items:center !important;gap:10px !important;flex-wrap:nowrap !important}
			.ccv-assist-head .ccv-set-title{margin:0 !important;font-size:15px !important}
			.ccv-assist-head .ccv-set-hint{margin:0 !important;font-size:12px !important;line-height:20px !important}
			.ccv-assist .ccv-set-hint, .ccv-assist-desc{font-size:13px !important;line-height:20px !important;color:#C9C9D1 !important}
			.ccv-cap-hint{font-size:13px !important;color:#C9C9D1 !important;line-height:20px !important;margin:0 0 12px !important}
			.ccv-set-actions .ccv-set-hint{font-size:13px !important;color:#C9C9D1 !important}
			
			
			/* 音色面板 */
			.ccv-audio-foot{display:flex;align-items:center;gap:8px;padding:6px 8px;border-top:1px solid #141418}
			.ccv-voice{padding:10px;border-top:1px solid #141418;display:flex;flex-direction:column;gap:8px}
			.ccv-voice-row{display:flex;align-items:center;gap:8px}
			.ccv-voice-label{font-size:12px;color:#8b8b93}
			.ccv-voice-hint{font-size:11.5px;color:#6f6f76}
			.ccv-voice-lock{font-size:11.5px;color:#7fd1a0}
			.ccv-voice-desc{min-height:56px;resize:vertical;background:#0f0f12;border:1px solid #26262c;border-radius:6px;color:#dedee3;font-size:12px;padding:6px 8px;font-family:inherit}
			.ccv-voice-text{background:#0f0f12;border:1px solid #26262c;border-radius:6px;color:#dedee3;font-size:12px;padding:6px 8px}
			.ccv-voice-acts{display:flex;gap:8px;flex-wrap:wrap}
			
			/* 音色引用徽标条（方案 A） */
			.ccv-voice-refs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 0 2px}
			.ccv-voice-chip{display:flex;align-items:center;gap:5px;padding:3px 7px;border-radius:999px;
			  background:#14141a;border:1px solid #26262e;font-size:11.5px;color:#c8c8cf;cursor:pointer;
			  transition:border-color .15s,background .15s}
			.ccv-voice-chip:hover{border-color:#3a3a44;background:#1a1a21}
			.ccv-voice-chip.locked{border-color:#2f4a3a}
			.ccv-vc-i{color:#8b8b93;font-weight:600}
			.ccv-vc-name{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.ccv-vc-lock{font-size:10px;opacity:.75}
			.ccv-vc-btn{background:none;border:none;color:#8b8b93;cursor:pointer;font-size:11px;padding:0 2px;line-height:1}
			.ccv-vc-btn:hover{color:#dedee3}
			.ccv-voice-warn{font-size:11px;color:#e08a8a}
			.ccv-voice-name{background:#0f0f12;border:1px solid #26262c;border-radius:6px;color:#dedee3;
			  font-size:12px;padding:6px 8px;margin-bottom:2px}
			
			/* 提示词大窗（蒙板弹窗 + 双语对照） */
			.ccv-bigrow{display:flex;align-items:center;gap:8px;padding:4px 0 6px}
			.ccv-modal-mask{position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:9000;
			  display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)}
			.ccv-modal{width:min(1200px,94vw);height:min(76vh,760px);background:#121216;border:1px solid #2a2a32;
			  border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,.6)}
			.ccv-modal-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #202028}
			.ccv-modal-title{font-size:13px;color:#dedee3;font-weight:600}
			.ccv-modal-tab{background:#1a1a21;border:1px solid #2a2a32;color:#b9b9c2;border-radius:6px;
			  padding:4px 10px;font-size:12px;cursor:pointer}
			.ccv-modal-tab.on{background:#232330;border-color:#3a3a48;color:#fff}
			.ccv-modal-body{flex:1;display:flex;min-height:0}
			.ccv-modal-ta{flex:1;min-width:0;resize:none;background:#0f0f13;border:none;outline:none;
			  color:#e6e6ec;font:15px/1.85 ui-monospace,Consolas,monospace;padding:16px 18px}
			.ccv-modal-zh{flex:1;min-width:0;border-left:1px solid #202028;background:#0d0d11;overflow:auto;padding:14px 16px}
			.ccv-modal-pre{margin:0;white-space:pre-wrap;word-break:break-word;color:#c9c9d2;
			  font:15px/1.85 ui-monospace,Consolas,monospace}
			.ccv-modal-hint{color:#8b8b93;font-size:12px}
			.ccv-modal-err{color:#e08a8a;font-size:12px;white-space:pre-wrap}
			.ccv-modal-foot{display:flex;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid #202028}
			.ccv-modal-meta{font-size:11.5px;color:#7c7c85}
			
			/* 提示词模板 chips */
			.ccv-tpl{display:flex;flex-wrap:wrap;gap:5px;padding:0 0 6px}
			.ccv-tpl-chip{background:#15151b;border:1px solid #26262e;color:#b9b9c2;border-radius:999px;
			  padding:3px 9px;font-size:11px;cursor:pointer;white-space:nowrap}
			.ccv-tpl-chip:hover{border-color:#3a3a48;color:#fff;background:#1b1b23}
			.ccv-tpl-more{background:transparent;border:1px dashed #33333d;color:#8b8b93}
			
			/* 模板浮层 */
			.ccv-tplwrap{position:relative;display:inline-block}
			.ccv-tplbtn{white-space:nowrap}
			.ccv-tplpop{position:absolute;bottom:34px;left:0;z-index:40;min-width:240px;padding:6px;
			  background:#15151b;border:1px solid #2c2c36;border-radius:10px;box-shadow:0 16px 36px rgba(0,0,0,.6)}
			.ccv-tplpop-head{font-size:11px;color:#7c7c85;padding:4px 8px 6px}
			.ccv-tplpop-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:transparent;
			  border:none;color:#cfcfd6;font-size:12.5px;padding:7px 8px;border-radius:6px;cursor:pointer}
			.ccv-tplpop-item:hover{background:#20202a;color:#fff}
			.ccv-tplpop-ico{opacity:.7}
			
			/* 连线时目标卡片高亮 */
			.ccv-card.drop,.ccv-audio.drop{outline:2px solid #4d7cfe;outline-offset:3px}
			.ccv-dotport{width:18px;height:18px;line-height:16px}
			
			/* 已选片段合成条 */
			.ccv-compose{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:600;
			  display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:12px;
			  background:#16161d;border:1px solid #2c2c36;box-shadow:0 16px 40px rgba(0,0,0,.6);max-width:92vw;overflow-x:auto}
			.ccv-compose-n{font-size:12.5px;color:#e6e6ec;font-weight:600;white-space:nowrap}
			.ccv-compose-sec{font-size:11.5px;color:#8b8b93;white-space:nowrap}
			.ccv-compose-list{display:flex;gap:6px;flex-wrap:nowrap}
			.ccv-compose-chip{background:#20202a;border:1px solid #33333f;border-radius:999px;padding:2px 8px;
			  font-size:11.5px;color:#c8c8cf;cursor:pointer;white-space:nowrap}
			.ccv-compose-chip:hover{border-color:#e08a8a;color:#ffb3b3}
			
			.ccv-compose-item{display:flex;align-items:center;gap:4px;padding:2px 4px 2px 2px;border-radius:8px;
			  background:#1b1b23;border:1px solid #2f2f3a;cursor:grab;position:relative}
			.ccv-compose-item.dragging{opacity:.55;border-color:#4d7cfe}
			.ccv-compose-idx{font-size:10.5px;color:#8b8b93;min-width:10px;text-align:center}
			.ccv-compose-thumb{width:56px;height:32px;object-fit:cover;border-radius:5px;background:#000;display:block;pointer-events:none}
			.ccv-compose-x{position:absolute;top:-6px;right:-6px;width:16px;height:16px;line-height:14px;text-align:center;
			  border-radius:50%;background:#2a2a33;border:1px solid #3a3a46;color:#b9b9c2;font-size:11px;cursor:pointer}
			.ccv-compose-x:hover{background:#7a2f2f;border-color:#a05050;color:#fff}
			
			/* 提示词机检警告条 */
			.ccv-lintbar{display:flex;align-items:center;gap:8px;padding:7px 14px;background:#241d12;
			  border-top:1px solid #4a3a1c;color:#e8c98a;font-size:12px}
			.ccv-lint-ico{flex:none}
			.ccv-lint-more{color:#a08a5f;font-size:11.5px}
			
			/* 能力中心 */
			.ccv-packbtn{white-space:nowrap}
			.ccv-packs{width:min(980px,94vw);height:min(78vh,760px)}
			.ccv-packs-body{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
			.ccv-packs-empty{color:#9a9aa4;font-size:12.5px;display:flex;flex-direction:column;gap:10px;align-items:flex-start}
			.ccv-pack{border:1px solid #26262e;border-radius:10px;padding:10px 12px;background:#14141a;display:flex;flex-direction:column;gap:8px}
			.ccv-pack.ok{border-color:#2c3f33}
			.ccv-pack.need{border-color:#4a3a1c}
			.ccv-pack-head{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#dedee3}
			.ccv-pack-dot{color:#7fd1a0}
			.ccv-pack.need .ccv-pack-dot{color:#e8c98a}
			.ccv-pack-cap{font-size:11px;color:#7c7c85;border:1px solid #2c2c36;border-radius:999px;padding:1px 7px}
			.ccv-pack-ok{font-size:11.5px;color:#7fd1a0}
			.ccv-pack-need{font-size:11.5px;color:#e8c98a}
			.ccv-pack-miss{display:flex;flex-direction:column;gap:4px}
			.ccv-pack-mrow{display:flex;gap:10px;font-size:11.5px;color:#b9b9c2}
			.ccv-pack-mfile{font-family:ui-monospace,Consolas,monospace}
			.ccv-pack-mmeta{color:#7c7c85}
			.ccv-pack-dl{align-self:flex-start;margin-top:4px}
			.ccv-pack-nodes{font-size:11.5px;color:#e08a8a}
			.ccv-dl-list{display:flex;flex-direction:column;gap:6px;margin-top:6px}
			.ccv-dl-row{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#b9b9c2}
			.ccv-dl-name{flex:0 0 260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.ccv-dl-bar{flex:1;height:6px;background:#20202a;border-radius:999px;overflow:hidden}
			.ccv-dl-bar>span{display:block;height:100%;background:#4d7cfe;transition:width .3s}
			.ccv-dl-pct{width:44px;text-align:right;color:#8b8b93}
			.ccv-dl-st{width:14px}
			
			/* 首次上手向导 */
			.ccv-wizard{width:min(620px,92vw);height:auto}
			.ccv-wiz-body{display:flex;flex-direction:column;gap:10px;padding:14px 16px}
			.ccv-wiz-step{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #26262e;
			  border-radius:10px;background:#14141a}
			.ccv-wiz-step.on{border-color:#3a4a6a}
			.ccv-wiz-n{width:22px;height:22px;border-radius:50%;background:#232330;color:#cfcfd6;
			  display:flex;align-items:center;justify-content:center;font-size:12px;flex:none}
			.ccv-wiz-t{font-size:13px;color:#e6e6ec;font-weight:600}
			.ccv-wiz-d{font-size:11.5px;color:#8b8b93;margin-top:2px}
			.ccv-wiz-badge{font-size:14px}
			.ccv-wiz-badge.ok{color:#7fd1a0}
			.ccv-wiz-badge.bad{color:#e08a8a}
			
			/* 资产库 v2 */
			.ccv-facet-label{font-size:11px;color:#6f6f78;margin-right:4px;flex:none}
			.ccv-facet-scenes{flex-wrap:wrap}
			.ccv-asset-shot{position:absolute;left:6px;bottom:26px;right:6px;font-size:9.5px;color:#cfcfd6;
			  background:rgba(0,0,0,.55);border-radius:4px;padding:1px 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
			.ccv-asset-fav{position:absolute;right:6px;top:6px;color:#e8c98a;font-size:12px;z-index:2}
			.ccv-asset-actions{position:absolute;left:4px;right:4px;bottom:4px;display:flex;gap:4px;justify-content:flex-end;
			  opacity:0;transition:opacity .15s}
			.ccv-asset:hover .ccv-asset-actions{opacity:1}
			.ccv-asset-actions button,.ccv-asset-actions a{width:20px;height:20px;border-radius:5px;border:1px solid #33333f;
			  background:rgba(20,20,26,.9);color:#c8c8d0;font-size:11px;line-height:18px;text-align:center;cursor:pointer;
			  text-decoration:none;padding:0}
			.ccv-asset-actions button:hover,.ccv-asset-actions a:hover{background:#2a2a36;color:#fff}
			.ccv-board{display:flex;flex-direction:column;gap:14px;padding:4px 2px}
			.ccv-board-scene{border:1px solid #24242e;border-radius:10px;padding:8px 10px;background:#14141a}
			.ccv-board-title{font-size:12.5px;color:#dedee3;margin-bottom:8px;display:flex;gap:8px;align-items:center}
			.ccv-board-count{font-size:11px;color:#7c7c85;border:1px solid #2c2c36;border-radius:999px;padding:0 6px}
			.ccv-board-strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
			.ccv-board-shot{flex:0 0 auto;width:104px;position:relative}
			.ccv-board-thumb{width:104px;height:59px;object-fit:cover;border-radius:6px;background:#000;display:block}
			.ccv-board-label{display:block;font-size:10px;color:#a9a9b2;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
			.ccv-board-dur{position:absolute;right:3px;top:3px;font-size:9.5px;color:#fff;background:rgba(0,0,0,.6);
			  border-radius:4px;padding:0 3px}
			.ccv-lineage{position:absolute;right:12px;top:56px;width:300px;max-height:50%;overflow:auto;
			  background:#14141a;border:1px solid #2a2a34;border-radius:10px;z-index:40}
			.ccv-lineage-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #24242e;
			  font-size:12px;color:#dedee3}
			.ccv-lineage-body{padding:8px 10px;display:flex;flex-direction:column;gap:5px}
			.ccv-lineage-row{font-size:11px;color:#a9a9b2;display:flex;gap:6px;align-items:center;
			  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
			.ccv-lineage-row.cur{color:#fff}
			.ccv-lineage-tag{flex:none;font-size:9.5px;color:#8b8b93;border:1px solid #2c2c36;border-radius:4px;padding:0 4px}
			
			.ccv-asset-var{position:absolute;left:6px;top:6px;font-size:9.5px;color:#dfe6ff;background:rgba(40,60,120,.85);
			  border-radius:4px;padding:0 4px;cursor:pointer;z-index:2}
			.ccv-var-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px 10px;max-height:240px;overflow:auto}
			.ccv-var-item{position:relative;cursor:pointer}
			.ccv-var-thumb{width:100%;height:54px;object-fit:cover;border-radius:5px;background:#000;display:block}
			.ccv-var-item:hover .ccv-var-thumb{outline:1px solid #4d7cfe}
			.ccv-var-label{position:absolute;right:3px;bottom:3px;font-size:9px;color:#fff;background:rgba(0,0,0,.6);
			  border-radius:3px;padding:0 3px}
			
			.ccv-board-refs{display:flex;gap:2px;margin-top:3px}
			.ccv-board-ref{width:20px;height:20px;object-fit:cover;border-radius:3px;border:1px solid #2c2c36}
			
			.ccv-detail{position:absolute;left:0;right:0;bottom:0;max-height:78%;overflow:auto;background:#14141a;
			  border-top:1px solid #2a2a34;border-radius:10px 10px 0 0;z-index:45}
			.ccv-detail-body{padding:10px 12px;display:flex;flex-direction:column;gap:10px}
			.ccv-detail-media{width:100%;max-height:260px;object-fit:contain;background:#000;border-radius:8px}
			.ccv-detail-meta{font-size:11.5px;color:#a9a9b2;display:flex;flex-direction:column;gap:2px}
			.ccv-detail-prompt{font-size:11.5px;color:#c8c8d0}
			.ccv-detail-prompt summary{cursor:pointer;color:#9a9aa4}
			.ccv-detail-prompt pre{white-space:pre-wrap;word-break:break-word;max-height:180px;overflow:auto;
			  background:#0f0f14;border:1px solid #24242e;border-radius:6px;padding:8px;margin-top:6px}
			.ccv-detail-actions{display:flex;gap:8px;flex-wrap:wrap}
			
			/* 首页配置提示横幅 */
			.ccv-banner{display:flex;align-items:center;gap:12px;margin:0 0 16px;padding:12px 16px;
			  border-radius:12px;border:1px solid #2a2a34;background:#14141a}
			.ccv-banner.bad{border-color:#5a2a2a;background:#1e1414}
			.ccv-banner.warn{border-color:#4a3a1c;background:#1e1a12}
			.ccv-banner.ok{border-color:#2c3f33;background:#131a15}
			.ccv-banner-dot{width:8px;height:8px;border-radius:50%;flex:none;background:#7fd1a0}
			.ccv-banner.bad .ccv-banner-dot{background:#e08a8a}
			.ccv-banner.warn .ccv-banner-dot{background:#e8c98a}
			.ccv-banner-body{display:flex;flex-direction:column;gap:2px}
			.ccv-banner-title{font-size:13px;color:#e6e6ec;font-weight:600}
			.ccv-banner-desc{font-size:11.5px;color:#8b8b93}
			/* 能力页列表 */
			.ccv-packlist{display:flex;flex-direction:column;gap:10px;padding:4px 0}
			.ccv-page-sub{font-size:11.5px;color:#7c7c85}
			
			/* 模型与依赖：汇总徽标 / 来源标签 / 依赖明细 */
			.ccv-pack-sum{font-size:11.5px;padding:1px 8px;border-radius:999px;border:1px solid #2c2c36;color:#9a9aa4}
			.ccv-pack-sum.ok{color:#7fd1a0;border-color:#2c4a38}
			.ccv-pack-sum.need{color:#e8c98a;border-color:#4a3a1c}
			.ccv-pack-src{font-size:9.5px;color:#8b8b93;border:1px solid #2c2c36;border-radius:4px;padding:0 4px}
			.ccv-pack-src.b{color:#9db4ff;border-color:#2f3a5e}
			.ccv-chip.tiny{font-size:10.5px;padding:0 6px;height:18px;line-height:16px}
			.ccv-dep-list{display:flex;flex-direction:column;gap:2px;margin:6px 0 4px;padding:6px 8px;
			  background:#0f0f14;border:1px solid #22222a;border-radius:8px}
			.ccv-dep-row{display:flex;gap:8px;align-items:center;font-size:11px;color:#a9a9b2}
			.ccv-dep-row.ok .ccv-dep-mark{color:#7fd1a0}
			.ccv-dep-row.bad .ccv-dep-mark{color:#e08a8a}
			.ccv-dep-file{flex:1;font-family:ui-monospace,Consolas,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
			.ccv-dep-dir{color:#6f6f78;width:100px}
			.ccv-dep-size{color:#6f6f78;width:60px;text-align:right}
			
			/* 需手动下载的模型 */
			.ccv-manual{margin:8px 0;padding:8px 10px;border:1px solid #4a3a1c;border-radius:8px;background:#1b1a12;
			  display:flex;flex-direction:column;gap:4px}
			.ccv-manual-head{display:flex;align-items:center;gap:8px;font-size:11.5px;color:#e8c98a;margin-bottom:2px}
			.ccv-manual-row{display:flex;align-items:center;gap:8px;font-size:11px;color:#b9b9c2}
			.ccv-manual-link{color:#9db4ff;text-decoration:none;font-size:11px}
			.ccv-manual-link:hover{text-decoration:underline}
			.ccv-pack-foot{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:10px;
			  border-top:1px solid #22222a;font-size:11px;color:#7c7c85}
			
			/* 按能力分组 */
			.ccv-packgroup{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
			.ccv-packgroup-title{display:flex;align-items:center;gap:10px;font-size:12px;color:#cfd4dd;
			  padding-bottom:6px;border-bottom:1px solid #22222a}
			.ccv-packgroup-def{font-size:11px;color:#7fd1a0}
			.ccv-pack-def{font-size:9.5px;color:#0f1a13;background:#7fd1a0;border-radius:4px;padding:0 5px;font-weight:600}
			
			/* 能力与实现 */
			.ccv-implgroup{display:flex;flex-direction:column;gap:6px;margin:10px 0}
			.ccv-implgroup-title{font-size:11.5px;color:#8b8b93;padding-bottom:5px;border-bottom:1px solid #22222a}
			.ccv-impl{border:1px solid #24242e;border-radius:9px;padding:8px 10px;background:#12121a;display:flex;flex-direction:column;gap:6px}
			.ccv-impl.def{border-color:#2c4a38;background:#111a15}
			.ccv-impl.off{opacity:.75;border-style:dashed}
			.ccv-impl-head{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#dedee3}
			.ccv-impl-name{font-weight:500}
			.ccv-impl-state{font-size:11px;padding:0 6px;border-radius:999px;border:1px solid #2c2c36}
			.ccv-impl-state.ok{color:#7fd1a0;border-color:#2c4a38}
			.ccv-impl-state.bad{color:#e8c98a;border-color:#4a3a1c}
			.ccv-impl-state.off{color:#8b8b93}
			.ccv-impl-acts{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
			.ccv-impl-bind{display:flex;align-items:center;gap:4px;font-size:10.5px;color:#7c7c85;flex-wrap:wrap}
			
			.ccv-lb-bar{position:absolute;left:0;right:0;bottom:-48px;display:flex;align-items:center;gap:8px;
			  padding:8px 10px;background:rgba(18,21,26,.92);border:1px solid #2a2a34;border-radius:10px}
			.ccv-lb-meta{font-size:11.5px;color:#9a9aa4}
			
			.ccv-assets-active{display:flex;align-items:center;gap:8px;padding:4px 10px 6px;font-size:11px;color:#8b8b93}
			`;
			function useCss(id) {
				useEffect(() => {
					if (document.getElementById(id)) return;
					const el = document.createElement("style");
					el.id = id; el.textContent = css;
					document.head.appendChild(el);
				}, [id]);
			}
			return { T, css, useCss };
			})();

			return module.exports;
		})();

		__sub["./canvas-app.js"] = (function () {
			const module = { exports: {} };
			const exports = module.exports;
			/* 画布主组件（构建时内联；依赖由 client-main 注入） */
			module.exports = (deps) => {
			  const { CLIENT_LOADED_AT, report, MODELS, ASPECTS, COUNTS, RESOLUTIONS, cardSize, makeAudioNode, makeTextNode, SCRIPT_COLUMNS, SCRIPT_W, ROLE_LABEL, nextRole, assetName, assetDesc, inferRole, makeScriptNode, composeRowPrompt, SKELETON, api } = deps;
			
			  function CanvasApp() {
			  	useCss("ccv-style");
			  	const [projects, setProjects] = useState([]);
			  	const [current, setCurrent] = useState(null);
			  	const [nodes, setNodes] = useState([]);
			  	const deletedIdsRef = useRef(new Set());
			  	const [edges, setEdges] = useState([]);
			  	const [vp, setVp] = useState({ x: 0, y: 0, zoom: 1 });
			  	const [selected, setSelected] = useState(null);
			  	const [multiSel, setMultiSel] = useState([]);
			  	const [selBox, setSelBox] = useState(null);
			  	const [prompt, setPrompt] = useState("");
			  	const [model, setModel] = useState("qwen-t2i-fast");
			  	const [aspect, setAspect] = useState("16:9");
			  	const [count, setCount] = useState(1);
			  	const [seed, setSeed] = useState("");
			  	const [resolution, setResolution] = useState("1K");
			  	const [duration, setDuration] = useState(6);
			  	const [videoRes, setVideoRes] = useState("900p");
			  	const [expanded, setExpanded] = useState(false);
			  	const [bigOpen, setBigOpen] = useState(false);        // 提示词大窗
			  	const [tpls, setTpls] = useState([]);          // 提示词模板
			  	const [tplOpen, setTplOpen] = useState(false);   // 模板浮层
			  	const [bigTab, setBigTab] = useState("en");           // en | zh
			  	const [zhText, setZhText] = useState("");             // 中文译文
			  	const [trBusy, setTrBusy] = useState(false);
			  	const [trErr, setTrErr] = useState("");
				const [lintWarn, setLintWarn] = useState([]);   // 提示词机检警告
			  	const [bigSnap, setBigSnap] = useState("");           // 打开时的快照，用于未保存提示
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
			  	const [backups, setBackups] = useState([]);
			  	const [restoreArm, setRestoreArm] = useState(null);
			  	const [envChecks, setEnvChecks] = useState(null);
			  	const [wfOpen, setWfOpen] = useState(false);
			  	const [rowErr, setRowErr] = useState(null);
			  	const [faqOpen, setFaqOpen] = useState(false);
			  	const [trash, setTrash] = useState([]);
			  	const [trashOpen, setTrashOpen] = useState(false);
			  	const [tbMenu, setTbMenu] = useState(false);
			  	const [upModel, setUpModel] = useState("4x_foolhardy_Remacri.pth");
				const VOICE_DESC_DEFAULT = "60岁左右男性，声音苍老、沙哑、语速偏慢，带一点气息感";
				const VOICE_TEXT_DEFAULT = "这是一段测试音频，请确认我的音色是否合适。";
				// 音色输入按卡片独立保存（草稿覆盖已保存值），避免所有卡片联动
				const [voiceDraft, setVoiceDraft] = useState({});
				const [voiceBusy, setVoiceBusy] = useState("");
				const voiceOf = (n) => {
					const d = voiceDraft[n.id] || {};
					return {
						desc: d.desc ?? n?.data?.voice?.desc ?? VOICE_DESC_DEFAULT,
						text: d.text ?? n?.data?.voice?.text ?? VOICE_TEXT_DEFAULT,
					};
				};
				const setVoiceField = (nid, key, val) => setVoiceDraft((m) => ({
					...m, [nid]: { ...(m[nid] || {}), [key]: val },
				}));
			  	const [upScale, setUpScale] = useState(2);
			  	const [videoMode, setVideoMode] = useState("auto");
			  	const [durOpen, setDurOpen] = useState(false);
			
			  	// 浮层跟随卡片：切换选中就关掉，点弹层外面也关掉
			  	useEffect(() => { setTplOpen(false); setDurOpen(false); }, [selected]);
			
			  	useEffect(() => {
			  		if (!tplOpen && !durOpen) return;
			  		const onDown = (e) => {
			  			const t = e.target;
			  			if (t && t.closest && (t.closest(".ccv-tplwrap") || t.closest(".ccv-durbtn") || t.closest(".ccv-durpop"))) return;
			  			setTplOpen(false);
			  			setDurOpen(false);
			  		};
			  		document.addEventListener("mousedown", onDown, true);
			  		return () => document.removeEventListener("mousedown", onDown, true);
			  	}, [tplOpen, durOpen]);
			  	const [renaming, setRenaming] = useState(null);
			  	const [impls, setImpls] = useState([]);
			  	const [implStats, setImplStats] = useState({});
			  	const [implOpen, setImplOpen] = useState({});
			  	const [implBusy, setImplBusy] = useState("");
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
			  	const [edgeSel, setEdgeSel] = useState(null);   // 选中的连线
				const [linkTarget, setLinkTarget] = useState(null); // 连线时高亮的目标卡片
				const [composeDrag, setComposeDrag] = useState(null); // 合成条里正在拖的片段下标
					const [assetQ, setAssetQ] = useState({ kind: "", role: "", sceneId: "", q: "", favorite: false, sort: "new" });
					const assetQRef = useRef({ kind: "", role: "", sceneId: "", q: "", favorite: false, sort: "new" });
				const [assetView, setAssetView] = useState("grid");   // grid | board
				const [assetFacets, setAssetFacets] = useState({ kinds: [], roles: [], scenes: [] });
				const [assetBoard, setAssetBoard] = useState([]);
				const [assetLineage, setAssetLineage] = useState(null);
				const [assetVariants, setAssetVariants] = useState(null);   // { nodeId, items: [] }
				const [assetDetail, setAssetDetail] = useState(null);     // 详情抽屉
				const [wizardOpen, setWizardOpen] = useState(() => {
					try { return localStorage.getItem("omni.wizard.done") !== "1"; } catch { return false; }
				});
				const [wizardStep, setWizardStep] = useState(0);
				const [packs, setPacks] = useState([]);
				const [packBusy, setPackBusy] = useState("");
				const [dlTasks, setDlTasks] = useState([]);
				const [packOpenIds, setPackOpenIds] = useState({});   // 展开看依赖的包
				const [manualDl, setManualDl] = useState([]);         // 需要手动下载的模型
				const [showMyPacks, setShowMyPacks] = useState(false); // 是否显示自己导入的包
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
			  		const localNodes = nextNodes ?? nodesRef.current;
			  		const localEdges = nextEdges ?? edgesRef.current;
			  		const send = (baseRev, nodes, edges) => api("canvas.save", {
			  			id: current.id,
			  			baseRev,
			  			canvas: { nodes, edges, viewport: nextVp || vp },
			  		}).catch(() => null);
			
			  		let res = await send(canvasRev, localNodes, localEdges);
			  		if (res?.rev) setCanvasRev(res.rev);
			
			  		// 别的客户端（AI / 另一个页签）改过 → 合并后再存，不打断你，也不弹窗
			  		for (let attempt = 0; res?.conflict && attempt < 2; attempt++) {
			  			const c = await api("canvas.get", { id: current.id }).catch(() => null);
			  			if (!c?.canvas) break;
			  			const remoteRev = Number(c.canvas.rev) || 1;
			  			const byId = new Map();
			  			for (const n of c.canvas.nodes || []) byId.set(n.id, n);      // 先放远端的
			  			for (const n of localNodes) {                                  // 本地改动覆盖同名节点
			  				const remote = byId.get(n.id);
			  				const merged = remote
			  					? { ...remote, ...n, data: { ...remote.data, ...n.data,
			  							file: n.data?.file || remote.data?.file } }
			  					: n;
			  				byId.set(n.id, merged);
			  			}
			  			const mergedNodes = [...byId.values()].filter((n) => !deletedIdsRef.current.has(n.id));
			  			const edgeKey = (e) => `${e.from}->${e.to}`;
			  			const seen = new Set();
			  			const mergedEdges = [];
			  			for (const e of [...(c.canvas.edges || []), ...localEdges]) {
			  				const k = edgeKey(e);
			  				if (seen.has(k)) continue;
			  				seen.add(k); mergedEdges.push(e);
			  			}
			  			setCanvasRev(remoteRev);
			  			res = await send(remoteRev, mergedNodes, mergedEdges);
			  			if (res?.rev) setCanvasRev(res.rev);
			  			if (!res?.conflict) { deletedIdsRef.current.clear(); setNodes(mergedNodes); setEdges(mergedEdges); }
			  		}
			  		// 仍然冲突：静默拉最新，不弹「已被其他人修改」
			  		if (res?.conflict) {
			  			const c = await api("canvas.get", { id: current.id }).catch(() => null);
			  			if (c?.canvas) {
			  				setCanvasRev(Number(c.canvas.rev) || 1);
			  				setNodes(c.canvas.nodes || []);
			  				setEdges(c.canvas.edges || []);
			  			}
			  		}
			  	}, [current, vp, canvasRev]);
			
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
			  		}, 1500);
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
			  			// 任何可编辑区域（含 contenteditable 的对话输入框）里都不接管快捷键，
			  			// 否则在聊天框按退格会顺带删掉画布上选中的卡片
			  			const ae = document.activeElement;
			  			const tag = (ae?.tagName || "").toLowerCase();
			  			const tgt = e.target;
			  			const inEditable = (el) => {
			  				if (!el) return false;
			  				const t = (el.tagName || "").toLowerCase();
			  				return el.isContentEditable || t === "textarea" || t === "input" || t === "select" || t === "option";
			  			};
			  			if (tag === "textarea" || tag === "input" || tag === "select") return;
			  			if (ae?.isContentEditable) return;
			  			if (inEditable(tgt) || tgt?.closest?.("[contenteditable='true'], [contenteditable=''], .ccv-input, textarea, input")) return;
			  			if (e.isComposing) return;
			  			if (e.key === "Escape") {
			  				if (preview) { setPreview(null); return; }
			  				if (projMenu) { setProjMenu(false); return; }
			  				if (menu) { setMenu(null); return; }
			  			}
			  			if (edgeSel && (e.key === "Delete" || e.key === "Backspace")) {
			  				e.preventDefault();
			  				deleteEdge(edgeSel);
			  				return;
			  			}
			  			if ((e.key === "Delete" || e.key === "Backspace") && multiSel.length) {
			  			e.preventDefault();
			  			pushHistory();
			  			multiSel.forEach((id) => { deletedIdsRef.current.add(id); });
			  			const nn = nodes.filter((n) => !multiSel.includes(n.id));
			  			const ne = edges.filter((ed) => !multiSel.includes(ed.from) && !multiSel.includes(ed.to));
			  			setNodes(nn); setEdges(ne); setMultiSel([]); persist(nn, ne);
			  			return;
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
			  			if (e.key === "Escape" && multiSel.length) {
			  				e.preventDefault();
			  				setMultiSel([]);
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
			  	}, [selected, multiSel, nodes, edges, persist, undo, pushHistory]);
			
			  	const isSel = (id) => selected === id || multiSel.includes(id);
			
				/** 已选中的视频片段（按加选顺序），用于合成 */
				const pickedVideos = () => multiSel
					.map((id) => nodes.find((n) => n.id === id))
					.filter((n) => n && n.type === "video" && n.data?.file);
			
			  	// 卡片 / 面板内部滚动时不应缩放画布
			  	const PANEL_SEL = [
			  		".ccv-card", ".ccv-text", ".ccv-audio", ".ccv-script", ".ccv-scriptcard",
			  		".ccv-dock", ".ccv-assets", ".ccv-assetcard", ".ccv-assetgrid",
			  		".ccv-strip", ".ccv-menu", ".ccv-tb-menu", ".ccv-picker", ".ccv-qpanel",
			  		".ccv-toolbar", ".ccv-durpop", ".ccv-float", ".ccv-modal",
			  	].join(",");
			  	const SCROLL_SEL = [
			  		".ccv-text-body", ".ccv-script-body", ".ccv-script-scroll", ".ccv-assets",
			  		".ccv-assetgrid", ".ccv-strip", ".ccv-qlist", ".ccv-picker", ".ccv-ta",
			  	].join(",");
			
			  	const onWheel = (e) => {
			  		const el = e.target instanceof Element ? e.target : null;
			  		// 1) 指针在卡片/面板内：不缩放画布
			  		if (el && el.closest(PANEL_SEL)) {
			  			const scroller = el.closest(SCROLL_SEL);
			  			if (scroller && scroller.scrollHeight > scroller.clientHeight + 2) {
			  				return; // 让内部自己滚（不 preventDefault）
			  			}
			  			e.stopPropagation();
			  			return;
			  		}
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
			  		setEdgeSel(null);          // 点空白处取消连线选中
			  		if (promptSaveTimer.current) { clearTimeout(promptSaveTimer.current); promptSaveTimer.current = null; persist(); }
			  		if (menu) { setMenu(null); return; }
			  		const rect0 = stageRef.current?.getBoundingClientRect();
			  		if ((e.ctrlKey || e.shiftKey) && rect0) {
			  			const ox = (e.clientX - rect0.left - vp.x) / vp.zoom;
			  			const oy = (e.clientY - rect0.top - vp.y) / vp.zoom;
			  			dragRef.current = { mode: "marquee", ox, oy, sx: e.clientX, sy: e.clientY };
			  			setSelBox({ x: ox, y: oy, w: 0, h: 0 });
			  			setMultiSel([]);
			  			setSelected(null);
			  			return;
			  		}
			  		setSelected(null);
			  		setMultiSel([]);
			  		dragRef.current = { mode: "pan", sx: e.clientX, sy: e.clientY, ox: vp.x, oy: vp.y };
			  	};
			
			  	const onCardDown = (e, node) => {
			  		e.stopPropagation();
			  		if (menu) { setMenu(null); }
			  		// Shift / Ctrl / Cmd + 点击 = 加选或取消选中（挑选要合成的片段）
			  		if (e.shiftKey || e.ctrlKey || e.metaKey) {
			  			setMultiSel((prev) => prev.includes(node.id)
			  				? prev.filter((id) => id !== node.id)
			  				: [...prev, node.id]);
			  			setSelected(node.id);
			  			return;
			  		}
			  		// 点在已选中的卡上且当前是多选 → 拖动整组（保持选集不变）
			  		const groupDrag = multiSel.length > 1 && multiSel.includes(node.id);
			  		if (!groupDrag) setSelected(node.id);
			  		const cardMode = node.data?.videoMode || "auto";
			  		setVideoMode(cardMode);
			  		setPrompt(node.data?.videoMode === "talking"
			  			? String(node.data?.script || node.data?.prompt || "")
			  			: (node.data?.prompt || ""));
			  		setModel(node.data?.model || model);
			  		setAspect(node.data?.aspect || aspect);
			  		setVideoRes(node.data?.videoRes || videoRes);
					// 时长：优先卡片自己的生成参数，其次已生成成片的实际时长
					const cardDur = Number(node.data?.duration ?? node.data?.durationSec ?? 0);
					if (cardDur > 0) setDuration(Math.min(15, Math.max(2, Math.round(cardDur * 10) / 10)));
					setSeed(node.data?.seed != null ? String(node.data.seed) : "");
					setUpModel(node.data?.upModel || upModel);
					if (node.data?.resolution) setResolution(node.data.resolution);
			  		setCount(node.data?.count || count);
			  		pushHistory();
			  		if (groupDrag) {
			  			const origins = {};
			  			nodesRef.current.forEach((n) => { if (multiSel.includes(n.id)) origins[n.id] = { x: n.x, y: n.y }; });
			  			dragRef.current = { mode: "multi", sx: e.clientX, sy: e.clientY, origins, ids: [...multiSel] };
			  		} else {
			  			dragRef.current = { mode: "node", id: node.id, sx: e.clientX, sy: e.clientY, ox: node.x, oy: node.y };
			  		}
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
			  			const t = nodeAtPoint(e.clientX, e.clientY);
			  			setLinkTarget(t && t.id !== d.id ? t.id : null);
			  			return;
			  		}
			  		if (d.mode === "marquee") {
			  			const rect = stageRef.current?.getBoundingClientRect();
			  			if (!rect) return;
			  			const cx = (e.clientX - rect.left - vp.x) / vp.zoom;
			  			const cy = (e.clientY - rect.top - vp.y) / vp.zoom;
			  			setSelBox({ x: Math.min(d.ox, cx), y: Math.min(d.oy, cy),
			  				w: Math.abs(cx - d.ox), h: Math.abs(cy - d.oy) });
			  			return;
			  		}
			  		const dx = (e.clientX - d.sx) / vp.zoom;
			  		const dy = (e.clientY - d.sy) / vp.zoom;
			  		if (d.mode === "pan") setVp((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }));
			  		else if (d.mode === "multi") setNodes((ns) => ns.map((n) => d.ids.includes(n.id) && d.origins[n.id]
			  			? { ...n, x: d.origins[n.id].x + dx, y: d.origins[n.id].y + dy } : n));
			  		else setNodes((ns) => ns.map((n) => n.id === d.id ? { ...n, x: d.ox + dx, y: d.oy + dy } : n));
			  	};
			
			  	const onUp = (e) => {
			  		const mode = dragRef.current?.mode;
			  		if (mode === "marquee") {
			  			dragRef.current = null;
			  			setSelBox((box) => {
			  				if (box && (box.w > 6 || box.h > 6)) {
			  					const hits = nodes.filter((n) => {
			  						const cs = cardSize(n);
			  						const w = n.w || cs.w, h = n.h || cs.h;
			  						return !(n.x > box.x + box.w || n.x + w < box.x ||
			  							n.y > box.y + box.h || n.y + h < box.y);
			  					}).map((n) => n.id);
			  					setMultiSel(hits);
			  				} else {
			  					setMultiSel([]);
			  				}
			  				return null;
			  			});
			  			return;
			  		}
			  		const dotId = dragRef.current?.id;
			  		dragRef.current = null;
			  		if (mode === "dot") {
			  			if (linking) {
			  			// 几何命中代替 elementFromPoint：远距离拖动会跨过已有连线的命中带或浮层
			  			const hit = nodeAtPoint(e.clientX, e.clientY);
			  			const target = (hit && hit.id !== linking) ? hit.id : null;
			  			setLinking(null); setLinkPos(null); setLinkTarget(null);
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
			  		if (mode === "node" || mode === "multi") persist(nodes, edges);
			  		if (mode === "pan") persist(nodes, edges, vp);
			  	};
			
			  	/** 按世界坐标找卡片：先判断命中，再给一个吸附半径（远的也能连上） */
				const nodeAtPoint = (clientX, clientY, snapPx = 64) => {
					const rect = stageRef.current?.getBoundingClientRect();
					if (!rect) return null;
					const wx = (clientX - rect.left - vp.x) / vp.zoom;
					const wy = (clientY - rect.top - vp.y) / vp.zoom;
					let best = null;
					let bestD = Infinity;
					for (const n of nodes) {
						const cs = cardSize(n);
						const x2 = n.x + cs.w;
						const y2 = n.y + cs.h;
						if (wx >= n.x && wx <= x2 && wy >= n.y && wy <= y2) return n;   // 直接命中
						const dx = Math.max(n.x - wx, 0, wx - x2);
						const dy = Math.max(n.y - wy, 0, wy - y2);
						const d = Math.hypot(dx, dy);
						if (d < bestD) { bestD = d; best = n; }
					}
					return bestD * vp.zoom <= snapPx ? best : null;
				};
			
				/** 结束连线：落在另一张卡片上就建边。 */
			  	const finishLink = (targetId) => {
			  		const src = linking;
			  		setLinkTarget(null);
			  		setLinking(null);
			  		if (!src || !targetId || src === targetId) return;
			  		if (edges.some((e) => e.from === src && e.to === targetId)) return;
			  		pushHistory();
			  		const ne = [...edges, { id: `e-${Date.now().toString(36)}`, from: src, to: targetId }];
			  		setEdges(ne);
			  		persist(nodesRef.current, ne);
			  	};
			
			  	// 删除单条连线
			  	const deleteEdge = (edgeId) => {
			  		if (!edgeId) return;
			  		pushHistory();
			  		const ne = edges.filter((e) => e.id !== edgeId);
			  		setEdges(ne);
			  		setEdgeSel(null);
			  		persist(nodesRef.current, ne);
			  	};
			
			  	const pickFiles = (at) => {
			  		const el = document.createElement("input");
			  		el.type = "file";
			  		el.multiple = true;
			  		el.accept = "image/*,video/*,audio/*";
			  		el.onchange = async () => {
			  			const files = Array.from(el.files || []);
			  			if (!files.length) return;
			  			const measure = (f) => new Promise((res) => {
			  				const url = URL.createObjectURL(f);
			  				if (f.type.startsWith("image/")) {
			  					const img = new Image();
			  					img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
			  					img.onerror = () => { res(null); URL.revokeObjectURL(url); };
			  					img.src = url;
			  				} else if (f.type.startsWith("video/")) {
			  					const v = document.createElement("video");
			  					v.onloadedmetadata = () => { res({ w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(url); };
			  					v.onerror = () => { res(null); URL.revokeObjectURL(url); };
			  					v.src = url;
			  				} else { res(null); }
			  			});
			  			let ax = at?.x, ay = at?.y;
			  			for (const f of files) {
			  				const dataUrl = await new Promise((res, rej) => {
			  					const fr = new FileReader();
			  					fr.onload = () => res(String(fr.result));
			  					fr.onerror = rej;
			  					fr.readAsDataURL(f);
			  				});
			  				const dim = await measure(f);
			  				try {
			  					await api("media.upload", {
			  						projectId: current.id,
			  						name: f.name.replace(/\.[^.]+$/, ""),
			  						dataUrl,
			  						naturalW: dim?.w,
			  						naturalH: dim?.h,
			  						at: Number.isFinite(ax) && Number.isFinite(ay) ? { x: Math.round(ax), y: Math.round(ay) } : undefined,
			  					});
			  					if (Number.isFinite(ax)) ax += 340;
			  				} catch (err) { setError(String(err.message || err)); }
			  			}
			  			const cc = await api("canvas.get", { id: current.id });
			  			if (cc?.canvas) { setNodes(cc.canvas.nodes || []); setEdges(cc.canvas.edges || []); }
			  		};
			  		el.click();
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
			  		if (type === "video") { n.w = 400; n.h = 240; n.data.aspect = "16:9"; }
			  		if (type === "script") { Object.assign(n, makeScriptNode(n.x, n.y)); n.id = `n-${Date.now().toString(36)}`; }
			  		const nn = [...nodes, n];
			  		setNodes(nn); setSelected(n.id); setPrompt(""); persist(nn, edges);
			  	};
			
			  	/** 图片编辑：建子节点 + 连源图 + 预填「保持构图，只改…」模板 + 记血缘 */
			  	const editFromImage = (src) => {
			  		if (!src?.data?.file) { setError("这张图还没有内容"); return; }
			  		pushHistory();
			  		const cs = cardSize(src);
			  		const id = `n-${Date.now().toString(36)}`;
			  		const n = {
			  			id, type: "image", x: src.x + cs.w + 140, y: src.y, w: 320, h: 320,
			  			data: {
			  				prompt: "保持原图的主体、构图与光线，只修改：", model, aspect,
			  				count: 1, status: "idle", editFrom: src.data.file,
			  			},
			  		};
			  		const edge = { id: `e-${id}`, from: src.id, to: id };
			  		const nn = [...nodes, n];
			  		const ne = [...edges, edge];
			  		setNodes(nn); setEdges(ne); setSelected(id);
			  		setPrompt("保持原图的主体、构图与光线，只修改：");
			  		persist(nn, ne);
			  		showToast("已连好源图，改完描述按 Enter");
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
			  		if (type === "video") { n.w = 400; n.h = 240; n.data.aspect = "16:9"; }
			  		const edge = { id: `e-${Date.now().toString(36)}`, from: src.id, to: n.id };
			  		const nn = [...nodes, n];
			  		const ne = [...edges, edge];
			  		setNodes(nn); setEdges(ne); setSelected(n.id); setPrompt("");
			  		persist(nn, ne);
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
			
			  	useEffect(() => {
			  		if (!durOpen) return undefined;
			  		const close = () => setDurOpen(false);
			  		const t = setTimeout(() => document.addEventListener("click", close), 0);
			  		return () => { clearTimeout(t); document.removeEventListener("click", close); };
			  	}, [durOpen]);
			
			  	const loadTrash = async () => {
			  		try {
			  			const r = await api("project.trashList", {});
			  			setTrash(r.projects || []);
			  		} catch { setTrash([]); }
			  	};
			
			  	/** 把项目移进回收站（可恢复） */
			  	const trashProject = async (pj) => {
			  		if (!pj) return;
			  		if (!window.confirm(`把「${pj.name}」移入回收站？可以在回收站里恢复。`)) return;
			  		try {
			  			const r = await api("project.trash", { id: pj.id });
			  			if (r.error) throw new Error(r.error);
			  			setProjects(projects.filter((x) => x.id !== pj.id));
			  			if (current?.id === pj.id) setCurrent(null);
			  			await loadTrash();
			  			showToast(`「${pj.name}」已移入回收站`);
			  		} catch (e) { setError(String(e.message || e)); }
			  	};
			
			  	const restoreProject = async (id) => {
			  		try {
			  			const r = await api("project.restore", { id });
			  			if (r.error) throw new Error(r.error);
			  			await loadTrash();
			  			const l = await api("project.list", {});
			  			setProjects(l.projects || []);
			  			showToast("已恢复");
			  		} catch (e) { setError(String(e.message || e)); }
			  	};
			
			  	const purgeProject = async (id, name) => {
			  		if (!window.confirm(`彻底删除「${name}」？不可恢复。`)) return;
			  		try {
			  			const r = await api("project.purge", { id });
			  			if (r.error) throw new Error(r.error);
			  			await loadTrash();
			  			showToast("已彻底删除");
			  		} catch (e) { setError(String(e.message || e)); }
			  	};
			
			  	/** 删除某个节点（含连线），可撤销 */
			  	const deleteNode = (id) => {
			  		deletedIdsRef.current.add(id);
			  		if (!id) return;
			  		pushHistory();
			  		const nn = nodes.filter((n) => n.id !== id);
			  		const ne = edges.filter((x) => x.from !== id && x.to !== id);
			  		setNodes(nn); setEdges(ne);
			  		if (selected === id) setSelected(null);
			  		persist(nn, ne);
			  	};
			
			  	/** 复制某个节点（偏移 40,40，不复制连线） */
			  	const duplicateNode = (id) => {
			  		const src = nodes.find((n) => n.id === id);
			  		if (!src) return;
			  		pushHistory();
			  		const nid = `n-${Date.now().toString(36)}`;
			  		const copy = { ...src, id: nid, x: src.x + 40, y: src.y + 40, data: { ...src.data } };
			  		const nn = [...nodes, copy];
			  		setNodes(nn); setSelected(nid); persist(nn, edges);
			  		showToast("已复制节点");
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
			
			  	// 收集该节点可用的音色（上游音频卡，最多 3 张；自身锁定的音色优先）
			  	// 音色引用（单一事实来源）：面板显示与提交都用这一个函数，保证 <Audio N> 下标一致
			  	const voiceRefsOf = (nodeId) => {
			  		const out = [];
			  		const seen = new Set();
			  		const push = (a) => {
			  			const file = a?.data?.file;
			  			if (!file || seen.has(file) || out.length >= 3) return;
			  			seen.add(file);
			  			out.push({
			  				file,
			  				name: a.data?.voice?.name || a.data?.title || "",
			  				locked: Boolean(a.data?.voice?.locked),
			  				nodeId: a.id,
			  			});
			  		};
			  		const self = nodes.find((x) => x.id === nodeId);
			  		if (self?.data?.voice?.locked) push(self);
			  		for (const e of edges.filter((x) => x.to === nodeId)) {
			  			const a = nodes.find((x) => x.id === e.from);
			  			if (a && a.type === "audio") push(a);
			  		}
			  		return out;
			  	};
			
			  	// 断开某条音色连线
			  	const unlinkVoice = (nodeId, fromId) => {
			  		pushHistory();
			  		const ne = edges.filter((x) => !(x.to === nodeId && x.from === fromId));
			  		setEdges(ne);
			  		persist(nodesRef.current, ne);
			  	};
			
			  	// <Audio N> 越界检查（N 超过实际音色条数时提示）
			  	const validateVoiceTags = (nodeId, text) => {
			  		const cnt = voiceRefsOf(nodeId).length;
			  		for (const m of String(text || "").matchAll(/<Audio\s+(\d+)>/gi)) {
			  			const n = Number(m[1]);
			  			if (n > cnt) return `提示词引用了 <Audio ${n}>，但只连接了 ${cnt} 条音色。`;
			  		}
			  		return null;
			  	};
			
				const retryNode = async (n) => {
			  		if (!current) return;
			  		const p = String(n?.data?.prompt || "").trim();
			  		if (!p) { setError("这条没有提示词，无法重试"); return; }
			  		try {
			  			setBusy("重新提交…");
			  			setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "queued", progress: 0, startedAt: Date.now(), error: "", elapsedMs: 0 } } : x));
			  			const talkMode = n.data?.videoMode === "talking";
			  			const r = n.type === "video"
			  				? await api("gen.video", talkMode ? {
			  					projectId: current.id, nodeId: n.id,
			  					mode: "talking",
			  					script: String(n.data?.script || n.data?.prompt || "").trim(),
			  					segmentSec: Number(n.data?.segmentSec) || 15,
			  					aspect: n.data?.aspect || "16:9",
			  					resolution: videoRes, refFiles: refsOf(n.id),
			  					voiceFiles: voiceRefsOf(n.id).map((v) => ({ file: v.file, name: v.name })),
								voiceFile: (voiceRefsOf(n.id)[0] || {}).file || "",
			  				} : {
			  					projectId: current.id, nodeId: n.id, prompt: p,
			  					duration: Number(n.data?.duration) || 4,
			  					aspect: n.data?.aspect || "16:9",
			  					resolution: videoRes, refFiles: refsOf(n.id),
			  					voiceFiles: voiceRefsOf(n.id).map((v) => ({ file: v.file, name: v.name })),
			  					voiceFile: (voiceRefsOf(n.id)[0] || {}).file || "",
			  					impl: n.data?.impl || undefined,
			  					mode: n.data?.videoMode && n.data.videoMode !== "auto" ? n.data.videoMode : undefined,
			  				})
			  				: await api("gen.image", {
			  					projectId: current.id, nodeId: n.id, prompt: p,
			  					model, aspect: n.data?.aspect || aspect, count,
			  					impl: n.data?.impl || undefined,
			  					resolution, refFiles: refsOf(n.id),
			  				});
			  			setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, jobId: r.jobId, progress: 0, status: "queued", startedAt: Date.now() } } : x));
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
			  				data: { prompt: "", status: "idle", aspect: n.data?.aspect || "16:9" } };
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
			  			setVideoMode("i2v");
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
			  				setTimeout(() => focusNode(id), 120);
			  				showToast("✅ 已抽帧，并定位到新图片");
			  			} else {
			  				showToast("❌ 抽帧没有返回图片");
			  			}
			  			setBusy("");
			  		} catch (e) { setBusy(""); setError(String(e.message || e)); }
			  	};
			
			  	/** latent 放大：把成片送进 H3 VAE → 3D latent 放大 → 解码（不动内容，50s 级） */
			  	const latentUpscale = async (n) => {
			  		if (!current || !n?.data?.file) return;
			  		const w0 = Number(n.data?.width) || 480;
			  		const h0 = Number(n.data?.height) || 864;
			  		const scale = window.__latentScale || 2;
			  		const w = Math.round((w0 * scale) / 32) * 32;
			  		const h = Math.round((h0 * scale) / 32) * 32;
			  		try {
			  			showToast(`latent 放大中 → ${w}×${h}（约 40–90 秒）…`);
			  			const r = await api("video.upscaleLatent", {
			  				projectId: current.id, nodeId: n.id, file: n.data.file,
			  				width: Math.min(w, 2048), height: Math.min(h, 2048), fps: 24,
			  			});
			  			if (r.error) throw new Error(r.error);
			  			setNodes((ns) => ns.map((x) => x.id === n.id ? { ...x, data: { ...x.data, status: "running" } } : x));
			  			pollJob(r.jobId, n.id);
			  			showToast("latent 放大已提交，完成后卡片会更新");
			  		} catch (e) { setError(String(e.message || e)); showToast("❌ latent 放大失败"); }
			  	};
			
			  	/** 原生高分重生成：有首帧就 i2v，没有就 t2v 同提示词重出（真采样，非插值） */
			  	const regenHighRes = async (n) => {
			  		if (!current || !n?.data?.file) return;
			  		const src = String(n.data?.refFrom || "");
			  		const res = "720p";
			  		const dur = Math.max(4, Math.min(10, Math.round(Number(n.data?.durationSec) || 4)));
			  		try {
			  			showToast("原生 720p 重生成中（约 90–120 秒）…");
			  			await openProject(current);
			  			const cur = nodes;
			  			const nid = `n-${Date.now().toString(36)}`;
			  			const node = {
			  				id: nid, type: "video", x: n.x + 380, y: n.y, w: 320, h: 420,
			  				data: { status: "queued", title: "720p 重生成" },
			  			};
			  			const nn = [...cur, node];
			  			const ee = [...edges];
			  			if (src) ee.push({ id: `e-${nid}`, from: n.id, to: nid });
			  			setNodes(nn); setEdges(ee); setSelected(nid); persist(nn, ee);
			  			focusNode(nid);
			  			const r = await api("gen.video", {
			  				projectId: current.id, nodeId: nid,
			  				prompt: String(n.data?.prompt || "").trim() || "延续同一镜头",
			  				duration: dur, aspect: "9:16", resolution: res,
			  				mode: src ? "i2v" : "t2v",
			  				refFiles: src ? [src] : [],
			  			});
			  			if (r.error) throw new Error(r.error);
			  			pollJob(r.jobId, nid);
			  		} catch (e) { setError(String(e.message || e)); showToast("❌ 重生失败"); }
			  	};
			
			  	const upscaleVideo = async (n) => {
			  		if (!current || !n?.data?.file) return;
			  		try {
			  			showToast("视频高清处理中（约 1–3 分钟）…");
			  			setBusy("视频超分中…");
			  			const r = await api("video.upscale", { projectId: current.id, nodeId: n.id, file: n.data.file });
			  			if (r.status === "failed") throw new Error(r.error || "视频超分失败");
			  			await openProject(current);
			  			setBusy("");
			  			showToast("✅ 视频高清已生成");
			  		} catch (e) { setBusy(""); setError(String(e.message || e)); }
			  	};
			
			  	// 提示词翻译（走 DSH 用户默认模型）
			  	// 拉一次提示词模板（失败静默，不打扰主流程）
			  	useEffect(() => {
			  		if (tpls.length) return;
			  		let alive = true;
			  		api("prompt.presets").then((r) => { if (alive) setTpls(r.presets || []); }).catch(() => {});
			  		return () => { alive = false; };
			  	}, [tpls.length]);
			
			  	const insertTemplate = (t) => {
			  		const ta = taRef.current;
			  		const raw = String(t?.text || "");
			  		if (!raw.trim()) return;
			  		const body = raw.endsWith("\n") ? raw : raw + "\n";
			  		const start = ta ? (ta.selectionStart ?? (prompt || "").length) : (prompt || "").length;
			  		const end = ta ? (ta.selectionEnd ?? start) : start;
			  		const before = String(prompt || "").slice(0, start);
			  		// 与已有内容之间补空行，避免模板和原文黏在一起
			  		const lead = before.trim().length > 0 && !/\n\s*\n$/.test(before) ? "\n" : "";
			  		const next = String(prompt || "").slice(0, start) + lead + body + String(prompt || "").slice(end);
			  		setPrompt(next);
			  		if (selected) { updateNodeData(selected, (d) => { d.prompt = next; }); persistSoon(); }
			  		setTplOpen(false);
			  		showToast("已插入模板：" + (t.name || ""));
			  	};
			
			  	/** 能力包：列表 + 预检 */
				const loadImpls = async (opts) => {
					try {
						const r = await api("impls.list", { includeUnbound: opts?.includeUnbound !== false });
						setImpls(r.impls || []);
						setImplStats(r.stats || {});
						return r;
					} catch (e) { setError(String(e.message || e)); return { impls: [], stats: {} }; }
				};
			
				const makeImplDefault = async (item) => {
					try {
						setImplBusy("设置默认…");
						await api("impls.setDefault", { id: item.id, capabilities: item.capabilities });
						await loadImpls();
						await loadBindings();
						showToast(`已设为默认：${item.name}`);
					} catch (e) { setError(String(e.message || e)); }
					setImplBusy("");
				};
			
				const bindImpl = async (item, capability) => {
					try {
						setImplBusy("绑定中…");
						await api("impls.bind", { workflowFile: item.workflowFile, capability, name: item.name });
						await loadImpls();
						await loadBindings();
						showToast("已绑定，可在上面设为默认");
					} catch (e) { setError(String(e.message || e)); }
					setImplBusy("");
				};
			
				const loadPacks = async () => {
					try {
						const r = await api("pack.list", { includeUser: showMyPacks });
						setPacks(r.packs || []);
						return r.packs || [];
					} catch (e) { setError(String(e.message || e)); return []; }
				};
			
			
				/** 下载某包缺失的模型，轮询进度 */
				const downloadPack = async (p) => {
					try {
						setPackBusy("开始下载…");
						const r = await api("pack.download", { id: p.id });
						const started = (r.started || []).filter((x) => x.taskId);
						const manual = r.manual || [];
						if (!started.length) {
							if (manual.length) {
								setManualDl(manual);      // 展示"手动下载指引"
							} else {
								setError("没有可下载的模型");
							}
							setPackBusy("");
							return;
						}
						if (manual.length) setManualDl(manual);
						for (let i = 0; i < 600; i += 1) {
							await new Promise((res) => setTimeout(res, 1000));
							const d = await api("pack.downloads");
							setDlTasks(d.tasks || []);
							const mine = (d.tasks || []).filter((t) => started.some((x) => x.taskId === t.id));
							if (mine.length && mine.every((t) => ["done", "failed"].includes(t.status))) break;
						}
						await loadPacks();
						setPackBusy("");
					} catch (e) { setError(String(e.message || e)); setPackBusy(""); }
				};
			
				/** 生成前机检：复述素材特征会削弱参考图/音色 */
				const lintNow = async (text, nodeId) => {
					try {
						const r = await api("prompt.lint", {
							text: String(text != null ? text : prompt || ""),
							hasRefImages: refsOf(nodeId || selected).length > 0,
							hasRefAudios: voiceRefsOf(nodeId || selected).length > 0,
						});
						setLintWarn(r.warnings || []);
						return r.warnings || [];
					} catch { setLintWarn([]); return []; }
				};
			
				const translatePrompt = async (direction = "en2zh", text) => {
			  		const src = String(text != null ? text : prompt || "").trim();
			  		if (!src) { setZhText(""); return ""; }
			  		setTrBusy(true); setTrErr("");
			  		try {
			  			const r = await api("prompt.translate", { text: src, direction });
			  			const out = r.text || "";
			  			if (direction === "en2zh") {
			  				setZhText(out);
			  				setBigTab("zh");            // 立刻切到双语栏，否则用户看不到译文
			  				if (!out) showToast("翻译返回为空");
			  			}
			  			return out;
			  		} catch (e) {
			  			const msg = String(e.message || e);
			  			setTrErr(msg);
			  			setBigTab("zh");            // 让错误也可见
			  			showToast("翻译失败：" + msg.slice(0, 60));
			  			return "";
			  		} finally { setTrBusy(false); }
			  	};
			
			  	const openBig = () => { setBigSnap(prompt || ""); setBigOpen(true); setTrErr(""); void lintNow(prompt, selected); };
			  	const closeBig = () => {
			  		if ((prompt || "") !== bigSnap && !window.confirm("提示词有未保存的修改，确认丢弃？")) return;
			  		setBigOpen(false);
			  	};
			
			  	const genVoicePreview = async (n) => {
					if (!current) return;
					try {
						setVoiceBusy("合成中…");
						const vd = voiceOf(n);
						const r = await api("voice.preview", {
							projectId: current.id, mode: "design",
							desc: vd.desc, text: vd.text,
						});
						// 把生成的音频落到该音频卡上（可直接播放、可被视频引用）
						await api("canvas.save", {
							id: current.id,
							canvas: {
								nodes: nodes.map((x) => x.id === n.id
									? { ...x, data: { ...x.data, file: r.file, status: "done", title: x.data?.title || "音色样本",
										voice: { desc: vd.desc, text: vd.text, file: r.file, provider: "mimo" } } }
									: x),
								edges,
							},
						});
						const c = await api("canvas.get", { id: current.id });
						setNodes(c.canvas.nodes || []);
						showToast("音色已生成，可试听");
					} catch (e) {
						setError(String(e.message || e));
						showToast("❌ 音色生成失败");
					} finally { setVoiceBusy(""); }
				};
			
				const lockVoiceForNode = async (n) => {
					if (!current || !n?.data?.file) return;
					try {
						const nextNodes = nodes.map((x) => x.id === n.id
							? { ...x, data: { ...x.data, voice: { ...(x.data?.voice || {}), locked: true } } }
							: x);
						await api("canvas.save", { id: current.id, canvas: { nodes: nextNodes, edges } });
						setNodes(nextNodes);
						setVoiceOpenId(null);
						showToast("音色已锁定：之后用这条音频生成的视频会沿用它");
					} catch (e) { setError(String(e.message || e)); }
				};
			
				const upscaleNode = async (n) => {
			  		if (!current || !n?.data?.file) return;
			  		try {
			  			showToast("图片超分处理中…");
			  			setBusy("超分中…");
			  			const r = await api("image.upscale", { projectId: current.id, nodeId: n.id, file: n.data.file, model: upModel, scale: upScale });
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
			
				const loadAssets = useCallback(async (patch) => {
					if (!current) return;
					const q = { ...assetQRef.current, ...(patch || {}) };
					assetQRef.current = q;
					setAssetQ(q);
					try {
						const r = await api("asset.query", { projectId: current.id, ...q, limit: 300 });
						setAssets(r.items || []);
						setAssetFacets(r.facets || { kinds: [], roles: [], scenes: [] });
					} catch (e) {
						// 兜底：老宿主没有 asset.query 时退回 asset.list，至少能看到东西
						try {
							const r2 = await api("asset.list", { id: current.id });
							setAssets(r2.assets || []);
							setAssetFacets({ kinds: [], roles: [], scenes: [] });
						} catch {
							setError(`资产加载失败：${String(e.message || e)}`);
						}
					}
				}, [current]);
			
			  	useEffect(() => { if (assetsOpen) loadAssets(); }, [assetsOpen, loadAssets]);
				useEffect(() => { void loadPacks(); void loadImpls(); }, []);   // 首页提示 & 设置列表
			
			  	/** 把资产放回画布（新建一个引用节点） */
			  	/** 在指定画布坐标放一张资产（拖拽/批量用） */
			  	const placeAssetAt = (asset, x, y) => {
			  		const w = 320;
			  		const ratio = (asset.params?.height && asset.params?.width)
			  			? asset.params.height / asset.params.width
			  			: (asset.height && asset.width ? asset.height / asset.width : 1);
			  		setNodes((prev) => [...prev, {
			  			id: uid("n"),
			  			type: asset.kind === "video" ? "video" : "image",
			  			x: Math.round(x - w / 2),
			  			y: Math.round(y - (w * ratio) / 2),
			  			w,
			  			h: Math.round(w * ratio),
			  			data: {
			  				title: String(asset.file || "").split("/").pop(),
			  				file: asset.file,
			  				assetId: asset.id,
			  				status: "done",
			  				prompt: asset.prompt || "",
			  				role: asset.role && asset.role !== "other" ? asset.role : "",
			  			},
			  		}]);
			  		persistSoon();
			  	};
			
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
			
			  	const promptSaveTimer = useRef(null);
			  	const persistSoon = () => {
			  		if (promptSaveTimer.current) clearTimeout(promptSaveTimer.current);
			  		promptSaveTimer.current = setTimeout(() => { promptSaveTimer.current = null; persist(); }, 700);
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
			  					let target = null;
			  					try {
			  						const pr = await api("job.progress", { jobId });
			  						target = pr?.percent == null ? null : Number(pr.percent);
			  					} catch {}
			  					setNodes((ns) => ns.map((n) => {
			  						if (n.id !== nodeId) return n;
			  						const shown = Number(n.data?.progress) || 0;
			  						// 缓冲：显示值向目标缓动，单次最多 +6，避免前面暴涨后面停滞
			  						const next = target == null
			  							? shown
			  							: shown + Math.max(0.6, Math.min(6, (target - shown) * 0.35));
			  						return { ...n, data: { ...n.data, status: job.status, progress: Math.min(97, next) } };
			  					}));
			  					setTimeout(tick, 1500);
			  					return;
			  				}
			  				setBusy("");
			  				if (job.status === "failed") {
			  					setNodes((ns) => ns.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, status: "failed" } } : n));
			  					setError(job.error || "生成失败");
			  					showToast("❌ 失败：" + String(job.error || "生成失败").slice(0, 60));
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
			  					if (c?.canvas?.rev) setCanvasRev(Number(c.canvas.rev));
			  					if (assetsOpen) void loadAssets();
			  					showToast("✅ 完成：" + (job.asset?.file ? String(job.asset.file).split("/").pop().slice(0, 24) : "已生成"));
			  				}
			  			} catch (e) { setBusy(""); setError(String(e.message || e)); }
			  		};
			  		tick();
			  	}, [current]);
			
			  	/** 上游连线（= 参考图） */
			  	const insertToken = (index, kind = "picture") => {
			  		const ta = taRef.current;
			  		const token = kind === "image" ? `<image${index}> `
						: kind === "audio" ? `<Audio ${index}> `
						: `<Picture ${index}> `;
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
			  			// 音频/文本卡不能当参考图传给 H3（wav 会被当图片解码而报错），音频走 voiceFile
			  			.filter((n) => n && n.type !== "audio" && n.type !== "text")
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
			  		if (!current || !prompt.trim()) return;
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
			  				data: { prompt, model, aspect, count, status: "queued", progress: 0, startedAt: Date.now() } };
			  			nn = [...nodes, n]; nodeId = n.id;
			  			setNodes(nn); setSelected(nodeId);
			  		} else {
			  			nn = nodes.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, prompt, model, aspect, count, videoRes, status: "queued", progress: 0, startedAt: Date.now() } } : n);
			  			setNodes(nn);
			  		}
			  		await persist(nn, edges);
			  		setBusy("提交中…"); setError("");
			  		try {
			  			const refs = refsOf(nodeId);
			  			if (isVideo) {
			  				const need = { t2v: [0, 0], i2v: [1, 2], r2v: [1, 9], fl2v: [2, 2], talking: [1, 2] }[videoMode];
			  				if (need && (refs.length < need[0] || refs.length > need[1])) {
			  					const label = { t2v: "文生视频", i2v: "图生视频", r2v: "参考生视频", fl2v: "首尾帧", talking: "数字人口播" }[videoMode];
			  					throw new Error(`${label}需要 ${need[0]}${need[1] === need[0] ? "" : "–" + need[1]} 张参考图，当前连了 ${refs.length} 张`);
			  				}
			  			}
			  			const selNode = nodes.find((x) => x.id === nodeId);
			  			const isTalking = videoMode === "talking" || selNode?.data?.videoMode === "talking";
			  			const r = isVideo ? await api("gen.video", isTalking ? {
			  				projectId: current.id, nodeId,
			  				mode: "talking",
			  				script: String(selNode?.data?.script || prompt || "").trim(),
			  				segmentSec: Number(selNode?.data?.segmentSec) || 15,
			  				preset: selNode?.data?.preset || "talking-combined",
			  				aspect, resolution: videoRes, refFiles: refs,
			  			} : {
			  				projectId: current.id, nodeId, prompt: finalPrompt,
			  				duration, aspect, mode: videoMode === "auto" ? undefined : videoMode,
			  				resolution: videoRes, refFiles: refs,
			  				impl: selNode?.data?.impl || undefined,
			  			}) : await api("gen.image", {
			  				projectId: current.id, nodeId, prompt, model, aspect, count,
			  				impl: nodes.find((x) => x.id === nodeId)?.data?.impl || undefined,
			  				seed: seed === "" ? undefined : Number(seed),
			  				resolution,
			  				refFiles: refsOf(nodeId),
			  			});
			  			setBusy("生成中…");
			  			setNodes((ns) => ns.map((x) => x.id === nodeId ? { ...x, data: { ...x.data, jobId: r.jobId, progress: 0, status: "queued", startedAt: Date.now() } } : x));
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
			  		if (!sel || sel.type === "script" || sel.type === "text" || sel.type === "audio") return null;
			  		const x = sel.x * vp.zoom + vp.x;
			  		const cs = cardSize(sel);
			  		const cardW = cs.w * vp.zoom;
			  		const y = (sel.y + cs.h) * vp.zoom + vp.y + 10;
			  		const width = expanded ? Math.max(640, Math.min(880, cardW)) : Math.max(470, Math.min(700, cardW));
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
			  		api("impl.list", {}).then((r) => setImpls(r.impls || [])).catch(() => setImpls([]));
			  	}, [view, current?.id]);
			
			  	useEffect(() => {
			  		if (page !== "projects") return undefined;
			  		loadTrash().catch(() => {});
			  	}, [page]);
			
			  	// 不再轮询显存：ComfyUI 新工作流自动释放，无需提示与手动释放
			
			  	const loadEnv = async () => {
			  		try {
			  			const r = await api("env.check", {});
			  			setEnvChecks(r.items || []);
			  		} catch { setEnvChecks([]); }
			  	};
			
			  	const loadBackups = async () => {
			  		if (!current) { setBackups([]); return; }
			  		try {
			  			const r = await api("backup.list", { projectId: current.id });
			  			setBackups(r.days || []);
			  		} catch { setBackups([]); }
			  	};
			
			  	useEffect(() => {
			  		if (page !== "settings") return undefined;
			  		loadBindings().catch(() => {});
			  		loadJobs().catch(() => {});
			  		loadBackups().catch(() => {});
			  		loadEnv().catch(() => {});
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
			  			h("button", {
			  				className: "ccv-home-cta small ghost", title: "回收站（已删除的项目）",
			  				onClick: async () => { await loadTrash(); setTrashOpen(true); },
			  			}, `🗑 回收站${trash.length ? " " + trash.length : ""}`),
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
			  						}, "导出"),
			  						h("button", {
			  							className: "ccv-card-act", title: "移入回收站（可恢复）",
			  							onClick: (e) => { e.stopPropagation(); trashProject(pj); },
			  						}, "删除"))))))
			  			: h("div", { className: "ccv-empty" }, "还没有项目"));
			  	// 回收站弹层
			  	const trashModal = trashOpen
			  		? h("div", { className: "ccv-overlay", onClick: () => setTrashOpen(false) },
			  			h("div", { className: "ccv-modal", onClick: (e) => e.stopPropagation() },
			  				h("div", { className: "ccv-modal-head" },
			  					h("span", null, `回收站（${trash.length}）`),
			  					h("span", { style: { flex: 1 } }),
			  					h("button", { className: "ccv-modal-x", onClick: () => setTrashOpen(false) }, "✕")),
			  				trash.length
			  					? h("div", { className: "ccv-modal-body" },
			  						trash.map((t) => h("div", { key: t.id, className: "ccv-trashrow" },
			  							h("span", { className: "ccv-trashtime" }, String(t.deletedAt || "").slice(0, 16).replace("T", " ")),
			  							h("span", { className: "ccv-trashname" }, t.name),
			  							h("span", { className: "ccv-trashtime" }, `${t.assets || 0} 素材`),
			  							h("span", { style: { flex: 1 } }),
			  							h("button", { className: "ccv-card-act", onClick: () => restoreProject(t.id) }, "恢复"),
			  							h("button", { className: "ccv-card-act danger", onClick: () => purgeProject(t.id, t.name) }, "彻底删除"))))
			  					: h("div", { className: "ccv-empty", style: { padding: "26px 0" } }, "回收站是空的")))
			  		: null;
			
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
			  				title: a.prompt || "",
			  				style: (() => {
			  					const w = Number(a.width || a.params?.width || 0);
			  					const hh = Number(a.height || a.params?.height || 0);
			  					const ar = w > 0 && hh > 0 ? w / hh : (a.kind === "video" ? 16 / 9 : 1);
			  					return { aspectRatio: String(Math.max(0.45, Math.min(2.2, ar))) };
			  				})(),
			  				onClick: () => setPreview({ file: a.file, kind: a.kind, projectId: a.projectId, asset: a }),
			  				contextMenu: (e) => { e.preventDefault(); placeAssetToProject(a); },
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
			  			"2. 严格按 dsh-omni-canvas/docs/工作流绑定流程.md 执行，不要凭记忆：",
			  			"   · §0 先问我：用内置模板，还是绑我自己的工作流；",
			  			"   · §1 检查环境与自定义节点（选内置时必须做，缺节点先问我是否安装）；",
			  			"   · §3 按能力逐项绑定参数——文生图必须绑 prompt/seed/width/height/count(batch_size)/输出；",
			  			"     缺 count 就要明说「该工作流不支持多张」，不要留空；",
			  			"   · §5 推断只用来给候选，列出表格让我确认；",
			  			"   · §6 校验节点/字段/hash，§7 试跑（文生图必须试 count=4 真出 4 张），§8 保存并设默认；",
			  			"   · §4 模型版本不一致按族名适配：缺 LoRA 跳过，缺主模型就停并告诉我缺什么；",
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
			  	const setupCard = h("div", { className: "ccv-assist" },
			  		h("div", { className: "ccv-assist-head" },
			  			h("span", { className: "ccv-set-title", style: { marginBottom: 0 } }, "一键配置"),
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
			  				"① 复制右侧指令  ② 粘贴发给 AI 助手  ③ 回这里点「刷新状态」。全程不用手动改任何配置。"),
			  		assistOpen
			  			? h("div", { className: "ccv-set-hint", style: { marginTop: 6 } },
			  				"内容按当前扫描结果动态生成（目录 / 端口 / 版本 / 工作流数量），换机器会自动变化。")
			  			: null);
			
			  	// 能力中心（导航一级页面）
				// 模型与依赖（原「能力中心」，合并进设置）
			
				// 能力与实现：一个列表，不再区分"绑定/出厂包/工作流文件"
				const implCard = h("div", { className: "ccv-set-card impls" },
					h("div", { className: "ccv-set-title" }, "能力与实现",
						h("span", { className: "ccv-set-hint", style: { marginLeft: 10 } },
							`${implStats.bound || 0} 个可用 · ${implStats.unbound || 0} 个未绑定`),
						h("span", { style: { flex: 1 } }),
						h("button", { className: "ccv-chip", disabled: !!implBusy, onClick: async () => { setImplBusy("检查中…"); await loadImpls(); setImplBusy(""); } }, implBusy || "重新检查")),
					h("div", { className: "ccv-cap-hint" },
						"每个能力用哪个工作流。标「默认」的就是现在出图/出片用的那个；展开可以看到它需要哪些模型文件。"),
			
					[["生图", ["image-t2i", "image-edit", "image-upscale"]],
					  ["视频", ["video-t2v", "video-i2v", "video-r2v", "video-fl2v"]],
					  ["音频", ["audio-speech"]]].map(([title, caps]) => {
						const items = impls.filter((x) => (x.capabilities || []).some((c) => caps.includes(c)));
						if (!items.length) return null;
						return h("div", { key: title, className: "ccv-implgroup" },
							h("div", { className: "ccv-implgroup-title" }, `${title} · ${items.length} 个`),
							items.map((it) => h("div", { key: it.id, className: "ccv-impl" + (it.isDefault ? " def" : "") + (it.bound ? "" : " off") },
								h("div", { className: "ccv-impl-head" },
									it.isDefault ? h("span", { className: "ccv-pack-def" }, "默认") : null,
									h("span", { className: "ccv-impl-name" }, it.name),
									(it.capabilities || []).slice(0, 4).map((c) => h("span", { key: c, className: "ccv-pack-cap" }, c)),
									h("span", { style: { flex: 1 } }),
									!it.bound
										? h("span", { className: "ccv-impl-state off" }, "未绑定")
										: (it.ready
											? h("span", { className: "ccv-impl-state ok" }, "就绪")
											: h("span", { className: "ccv-impl-state bad" }, `缺 ${(it.missing || []).length} 个模型`))),
			
								h("div", { className: "ccv-impl-acts" },
									it.bound && !it.isDefault
										? h("button", { className: "ccv-chip tiny", disabled: !!implBusy, onClick: () => makeImplDefault(it) }, "设为默认")
										: null,
									it.bound && (it.deps || []).length
										? h("button", { className: "ccv-chip tiny", onClick: () => setImplOpen((m) => ({ ...m, [it.id]: !m[it.id] })) },
											implOpen[it.id] ? "收起依赖" : `${(it.deps || []).length} 个文件`)
										: null,
									it.bound && !it.ready
										? h("button", {
											className: "ccv-chip tiny primary", disabled: !!implBusy,
											onClick: async () => { setPackBusy("下载中…"); await downloadPack({ id: it.packIds?.[0] || it.id }); setPackBusy(""); },
										}, "下载模型")
										: null,
									!it.bound
										? h("span", { className: "ccv-impl-bind" },
											h("span", null, "绑到"),
											["image-t2i", "image-edit", "image-upscale", "video-r2v", "video-i2v", "video-fl2v", "video-t2v"].map((c) =>
												h("button", { key: c, className: "ccv-chip tiny", disabled: !!implBusy, onClick: () => bindImpl(it, c) }, c)))
										: null),
			
								implOpen[it.id]
									? h("div", { className: "ccv-dep-list" },
										(it.deps || []).map((dep) => h("div", { key: dep.file, className: "ccv-dep-row " + (dep.ok ? "ok" : "bad") },
											h("span", { className: "ccv-dep-mark" }, dep.ok ? "✓" : "✗"),
											h("span", { className: "ccv-dep-file" }, dep.file),
											h("span", { className: "ccv-dep-dir" }, dep.dir || ""))))
									: null)));
					}).filter(Boolean),
			
					h("div", { className: "ccv-pack-foot" },
						h("span", { className: "ccv-set-hint" },
							"出厂模板随插件自带；你自己导入的工作流会出现在下面「未绑定」里，绑一次即可选用。"),
						h("span", { style: { flex: 1 } }),
						h("button", {
							className: "ccv-chip",
							onClick: async () => {
								setImplBusy("导出中…");
								try {
									const r = await api("pack.export", {});
									showToast(`已导出 ${(r.exported || []).length} 个能力包`);
								} catch (e) { setError(String(e.message || e)); }
								setImplBusy("");
							},
						}, "导出我的配置（可选）")));
			
				const packsCard = h("div", { className: "ccv-set-card packs" },
					h("div", { className: "ccv-set-title" }, "模型与依赖",
						h("span", { className: "ccv-pack-sum " + (packs.every((x) => x.ready) ? "ok" : "need") },
							`${packs.filter((x) => x.ready).length}/${packs.length} 就绪` +
							(packs.some((x) => !x.ready)
								? ` · 缺 ${packs.reduce((n, x) => n + x.missing.length, 0)} 个模型`
								: " · 全部就绪")),
						h("span", { style: { flex: 1 } }),
						packs.some((x) => !x.ready)
							? h("button", {
								className: "ccv-chip primary", disabled: !!packBusy,
								onClick: () => downloadPack({ id: packs.find((x) => !x.ready).id }),
							}, "安装缺失模型")
							: null,
						h("button", {
							className: "ccv-chip" + (showMyPacks ? " on" : ""),
							title: "显示你自己导入/绑定的工作流",
							onClick: async () => { setShowMyPacks((v) => !v); setPackBusy("…"); await loadPacks(); setPackBusy(""); },
						}, showMyPacks ? "隐藏我导入的" : "显示我导入的"),
						h("button", {
							className: "ccv-chip", disabled: !!packBusy,
							onClick: async () => { setPackBusy("检查中…"); await loadPacks(); setPackBusy(""); },
						}, packBusy || "重新检查")),
					h("div", { className: "ccv-cap-hint" },
						"每个工作流要用哪些模型文件。缺的会列出来可直接下载；也能整包导出，发给别人复现。"),
			
					packs.length === 0
						? h("div", { className: "ccv-set-hint" },
							"还没有能力包。先在上面「默认模型」里配好工作流，再导出成能力包。")
						: h("div", { className: "ccv-packlist" },
							(() => {
								// 按能力分组，默认实现排最前；不再区分"内置/我的"
								const GROUPS = [
									{ key: "image", title: "生图", caps: ["image-t2i", "image-edit", "image-upscale"] },
									{ key: "video", title: "视频", caps: ["video-t2v", "video-i2v", "video-r2v", "video-fl2v"] },
									{ key: "audio", title: "音频", caps: ["audio-speech"] },
								];
								const used = new Set();
								const out = [];
								for (const g of GROUPS) {
									const items = packs.filter((pk) => (pk.capabilities || [pk.capability]).some((c) => g.caps.includes(c)));
									if (!items.length) continue;
									items.forEach((x) => used.add(x.id));
									items.sort((x, y) => (y.isDefault ? 1 : 0) - (x.isDefault ? 1 : 0) || (y.ready ? 1 : 0) - (x.ready ? 1 : 0));
									out.push(h("div", { key: g.key, className: "ccv-packgroup" },
										h("div", { className: "ccv-packgroup-title" },
											`${g.title} · ${items.length} 个可选`,
											items.some((x) => x.isDefault)
												? h("span", { className: "ccv-packgroup-def" },
													"默认：" + (items.find((x) => x.isDefault)?.name || "").slice(0, 18))
												: null),
										items.map((pk) => h("div", {
								key: pk.id, className: "ccv-pack" + (pk.ready ? " ok" : " need"),
							},
								h("div", { className: "ccv-pack-head" },
									h("span", { className: "ccv-pack-dot" }, pk.ready ? "●" : "○"),
									pk.isDefault ? h("span", { className: "ccv-pack-def" }, "默认") : null,
									h("span", { className: "ccv-pack-name" }, pk.name),
									(pk.capabilities || [pk.capability]).slice(0, 4).map((c) =>
										h("span", { key: c, className: "ccv-pack-cap" }, c)),
									h("button", {
										className: "ccv-chip tiny",
										onClick: () => setPackOpenIds((m) => ({ ...m, [pk.id]: !m[pk.id] })),
									}, packOpenIds[pk.id] ? "收起依赖" : `${(pk.deps || []).length} 个文件`),
									h("span", { style: { flex: 1 } }),
									pk.ready
										? h("span", { className: "ccv-pack-ok" }, "就绪")
										: h("span", { className: "ccv-pack-need" },
											`缺 ${pk.missing.length} 个模型 · ${(Number(pk.needBytes || 0) / 1e9).toFixed(2)}GB`)),
								packOpenIds[pk.id]
									? h("div", { className: "ccv-dep-list" },
										(pk.deps || []).map((dep) => h("div", { key: dep.file, className: "ccv-dep-row " + (dep.ok ? "ok" : "bad") },
											h("span", { className: "ccv-dep-mark" }, dep.ok ? "✓" : "✗"),
											h("span", { className: "ccv-dep-file" }, dep.file),
											h("span", { className: "ccv-dep-dir" }, dep.dir || ""),
											h("span", { className: "ccv-dep-size" },
												dep.bytes ? (dep.bytes / 1e9).toFixed(2) + "GB" : "—"))))
									: null,
								pk.missing.length
									? h("div", { className: "ccv-pack-miss" },
										pk.missing.slice(0, 8).map((m) => h("div", { key: m.file, className: "ccv-pack-mrow" },
											h("span", { className: "ccv-pack-mfile" }, m.file),
											h("span", { className: "ccv-pack-mmeta" },
												`${m.dir || "unet"}${m.bytes ? " · " + (m.bytes / 1e9).toFixed(2) + "GB" : ""}`))),
										h("button", {
											className: "ccv-btn primary ccv-pack-dl", disabled: !!packBusy,
											onClick: () => downloadPack(pk),
										}, "下载缺失模型"))
									: null,
								(pk.customNodes || []).filter((n) => !n.ok).length
									? h("div", { className: "ccv-pack-nodes" },
										"缺少自定义节点：" + pk.customNodes.filter((n) => !n.ok).map((n) => n.name).join("、"))
									: null))));
								}
								return out;
							})()),
			
					manualDl.length
						? h("div", { className: "ccv-manual" },
							h("div", { className: "ccv-manual-head" },
								h("span", null, `有 ${manualDl.length} 个模型需要手动下载`),
								h("span", { style: { flex: 1 } }),
								h("button", { className: "ccv-chip tiny", onClick: async () => { setManualDl([]); await loadPacks(); } }, "我放好了，重新检查")),
							manualDl.slice(0, 8).map((m) => h("div", { key: m.file, className: "ccv-manual-row" },
								h("span", { className: "ccv-dep-file" }, m.file),
								h("span", { className: "ccv-dep-dir" }, m.hint || ""),
								m.hfSearch
									? h("a", { className: "ccv-manual-link", href: m.hfSearch, target: "_blank", rel: "noreferrer" }, "去找 ↗")
									: null)))
						: null,
					dlTasks.length
						? h("div", { className: "ccv-dl-list" },
							dlTasks.map((t) => h("div", { key: t.id, className: "ccv-dl-row" },
								h("span", { className: "ccv-dl-name" }, t.file),
								h("span", { className: "ccv-dl-bar" }, h("span", { style: { width: (t.percent || 0) + "%" } })),
								h("span", { className: "ccv-dl-pct" }, `${t.percent || 0}%`),
								h("span", { className: "ccv-dl-st" }, t.status === "done" ? "✓" : t.status === "failed" ? "✗" : "…"))))
						: null,
			
					h("div", { className: "ccv-pack-foot" },
						h("span", { className: "ccv-set-hint" },
							"出厂模板随插件自带，新用户点上面的「安装缺失模型」就能用；导出只是把你自己配好的发给别人。"),
						h("span", { style: { flex: 1 } }),
						h("button", {
							className: "ccv-chip",
							onClick: async () => {
								setPackBusy("导出中…");
								try {
									const r = await api("pack.export", {});
									showToast(`已导出 ${(r.exported || []).length} 个能力包`);
									await loadPacks();
								} catch (e) { setError(String(e.message || e)); }
								setPackBusy("");
							},
						}, "导出我的配置（可选）")));
			
				const settingsPage = h("div", { className: "ccv-page" },
			  		h("div", { className: "ccv-page-head" },
			  			h("div", { className: "ccv-page-title" }, "设置"),
			  			h("span", { style: { flex: 1 } })),
					h("div", { className: "ccv-set-grid" },
							setupCard,
							h("div", { className: "ccv-set-card" },
								h("div", { className: "ccv-set-title" }, "ComfyUI 连接",
									h("span", { style: { flex: 1 } }),
									h("span", { className: "ccv-set-statusline" },
										diag && diag.comfy && diag.comfy.ok
											? `● 已连接 · v${diag.comfy.version || "?"} · ${diag.comfy.vramTotalGB || "?"} GB 显存`
											: (diag ? (diag.error || "未连接") : "尚未检查")),
									h("button", { className: "ccv-chip", onClick: () => loadEnv() }, "重新检查")),
								h("div", { className: "ccv-set-row" },
									h("span", { className: "ccv-set-label" }, "地址"),
									h("input", { className: "ccv-input", readOnly: true, value: (diag && diag.comfy && diag.comfy.url) || "—" })),
								(envChecks || []).map((it) => h("div", { key: it.id, className: "ccv-envrow" },
									h("span", { className: "ccv-envmark " + (it.ok ? "ok" : "bad") }, it.ok ? "✓" : "✗"),
									h("span", { className: "ccv-envlabel" }, it.label),
									h("span", { className: "ccv-envdetail" }, it.detail || ""),
									!it.ok && it.fix ? h("span", { className: "ccv-envfix" }, it.fix) : null)),
							),
							implCard,
						),
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
			  			// 首页配置提示：没连 ComfyUI / 没能力包 / 缺模型 → 首页直接说明并给入口
					(() => {
						const ready = (packs || []).filter((p) => p.ready).length;
						const missing = (packs || []).reduce((n, p) => n + (p.missing || []).length, 0);
						let tone = "", title = "", desc = "", cta = null;
						if (!health.ok) {
							tone = "bad"; title = "ComfyUI 没有连上";
							desc = health.error || "先启动 ComfyUI，再回来检查";
							cta = h("button", { className: "ccv-btn", onClick: () => { setPage("settings"); loadDiag(); } }, "去设置");
						} else if (!(packs || []).length) {
							tone = "warn"; title = "还没有能力包";
							desc = "能力包 = 工作流 + 依赖模型；配好之后画布才能出图出片";
							cta = h("button", { className: "ccv-btn primary", onClick: () => { setPage("settings"); void loadPacks(); } }, "去配置");
						} else if (missing > 0) {
							tone = "warn"; title = `有 ${missing} 个模型没下载`;
							desc = `已就绪 ${ready}/${packs.length} 个能力包，点进去可一键下载`;
							cta = h("button", { className: "ccv-btn", onClick: () => { setPage("settings"); void loadPacks(); } }, "查看缺失");
						}
						if (!title) return null;
						return h("div", { className: "ccv-banner " + tone },
							h("span", { className: "ccv-banner-dot" }),
							h("div", { className: "ccv-banner-body" },
								h("div", { className: "ccv-banner-title" }, title),
								h("div", { className: "ccv-banner-desc" }, desc)),
							h("span", { style: { flex: 1 } }),
							cta);
					})(),
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
			  							: homeEl),
			  			trashModal);
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
			
			  				selBox ? h("div", { className: "ccv-selbox", style: {
			  					left: selBox.x, top: selBox.y, width: selBox.w, height: selBox.h,
			  				} }) : null,
			  				(multiSel.length > 1) ? (() => {
			  					const picked = nodes.filter((n) => multiSel.includes(n.id));
			  					if (!picked.length) return null;
			  					const bx = Math.min(...picked.map((n) => n.x));
			  					const by = Math.min(...picked.map((n) => n.y));
			  					return h("div", {
			  						className: "ccv-multibar",
			  						style: { position: "absolute", left: bx, top: Math.max(-40, by - 46), zIndex: 40 },
			  						onMouseDown: (e) => e.stopPropagation(),
			  					},
			  						h("span", { className: "ccv-multibar-n" }, `已选 ${picked.length}`),
			  						h("span", { className: "ccv-multibar-hint" }, "按 Delete 删除 · Esc 取消"));
			  				})() : null,
			  				nodes.map((n) => {
			  					if (n.type === "audio") {
			  						const d = n.data || {};
			  						return h(react.Fragment, { key: n.id },
			  							h("div", {
			  								key: n.id + "-card",
			  								"data-node": n.id,
			  								className: "ccv-audio" + (isSel(n.id) ? " sel" : "") + (linkTarget === n.id ? " drop" : ""),
			  								style: { left: n.x, top: n.y, width: n.w || 320 },
			  								onMouseDown: (e) => onCardDown(e, n),
			  							},
			  								h("div", { className: "ccv-audio-head" },
			  									h("span", { className: "ccv-text-ico" }, "♫"),
			  									h("span", { className: "ccv-text-title" }, d.title || "音频")),
			  								d.file ? h("audio", {
			  									className: "ccv-audio-player",
			  									src: `/omni-canvas/media/${current?.id}/${d.file}`,
			  									controls: true,
			  									onMouseDown: (e) => e.stopPropagation(),
			  								}) : null,
			  								h("div", { className: "ccv-voice", onMouseDown: (e) => e.stopPropagation() },
			  									h("div", { className: "ccv-voice-row" },
			  										h("span", { className: "ccv-voice-label" }, "音色"),
			  										d.voice?.locked
			  											? h("span", { className: "ccv-voice-lock" }, "已锁定")
			  											: h("span", { className: "ccv-voice-hint" }, "描述嗓音 → 生成试听 → 锁定")),
			  									h("textarea", {
			  										className: "ccv-voice-desc",
			  										value: voiceOf(n).desc,
			  										placeholder: "例如：60岁左右男性，声音苍老、沙哑、语速偏慢",
			  										onChange: (e) => setVoiceField(n.id, "desc", e.target.value),
			  									}),
			  									h("input", {
			  										className: "ccv-voice-text",
			  										value: voiceOf(n).text,
			  										placeholder: "测试台词",
			  										onChange: (e) => setVoiceField(n.id, "text", e.target.value),
			  									}),
			  									h("div", { className: "ccv-voice-acts" },
			  										h("button", { className: "ccv-btn", disabled: !!voiceBusy, onClick: () => genVoicePreview(n) },
			  											voiceBusy || "生成试听"),
			  										d.file ? h("button", { className: "ccv-btn primary", onClick: () => lockVoiceForNode(n) }, "锁定音色") : null,
			  										h("span", { className: "ccv-audio-hint" }, d.file ? "可作为视频的音色参考" : "先生成一段试听"))
			  								)
			  							),
			  						selected === n.id
			  							? h("div", {
			  								key: n.id + "-dot",
			  								className: "ccv-dotport",
			  								title: "拖到目标卡片完成连线",
			  								style: { left: n.x + (n.w || 320) + 6, top: n.y + Math.max(60, (n.h || 220) / 2) - 8 },
			  								onMouseDown: (e) => {
			  									e.stopPropagation();
			  									dragRef.current = { mode: "dot", id: n.id, sx: e.clientX, sy: e.clientY };
			  								},
			  							}, "+")
			  							: null);
			  					}
			
			  					if (n.type === "text") {
			  						const d = n.data || {};
			  						const editing = editingTextId === n.id;
			  						const acts = [
			  							["自己编写内容", () => setEditingTextId(n.id)],
			  							["文生视频", () => addNode("video", { x: n.x + 460, y: n.y })],
			  							["图片反推提示词", () => setError("图片反推提示词：暂未接入")],
			  						];
			  						return h("div", {
			  							key: n.id,
			  							className: "ccv-text" + (isSel(n.id) ? " sel" : ""),
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
			  							className: "ccv-script" + (isSel(n.id) ? " sel" : ""),
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
			  					const rawTitle = String(n.data?.title || assetName(n) || "").trim();
			  					const titleText = rawTitle;
			  					const titleEl = renaming === n.id
			  						? h("input", {
			  							key: n.id + "-title-edit",
			  							className: "ccv-card-title-edit",
			  							defaultValue: rawTitle,
			  							placeholder: "给这张卡起个名",
			  							autoFocus: true,
			  							onMouseDown: (e) => e.stopPropagation(),
			  							onKeyDown: (e) => {
			  								e.stopPropagation();
			  								const v = String(e.currentTarget.value || "").trim();
			  								if (e.key === "Enter") {
			  									updateNodeData(n.id, (d) => { d.title = v; });
			  									setRenaming(null);
			  								} else if (e.key === "Escape") {
			  									setRenaming(null);
			  								}
			  							},
			  							onBlur: (e) => {
			  								const v = String(e.currentTarget.value || "").trim();
			  								updateNodeData(n.id, (d) => { d.title = v; });
			  								setRenaming(null);
			  							},
			  						})
			  						: h("div", {
			  							key: n.id + "-title",
			  							className: "ccv-card-title" + (titleText ? "" : " empty"),
			  							title: titleText ? "双击改名" : "双击命名",
			  							onMouseDown: (e) => e.stopPropagation(),
			  							onDoubleClick: (e) => { e.stopPropagation(); setRenaming(n.id); },
			  						}, titleText || "");
			
			  					const card = h("div", {
			  						key: n.id + "-card",
			  						"data-node": n.id,
			  						className: "ccv-card" + (isSel(n.id) ? " sel" : "") + (linkTarget === n.id ? " drop" : "") + (n.data?.status === "running" ? " run" : "") + (n.data?.status === "queued" ? " wait" : ""),
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
			  								h("span", { className: "ccv-rundot" + (n.data.status === "queued" ? " wait" : "") }),
			  								h("span", { className: "ccv-run-label" },
			  									n.data.status === "queued" ? "排队中" : "生成中"),
			  								n.data.status === "queued"
			  									? null
			  									: (() => {
			  										const started = Number(n.data?.startedAt) || 0;
			  										const el = started ? Math.max(0, Math.round((Date.now() - started) / 1000)) : 0;
			  										const mm = String(Math.floor(el / 60)).padStart(2, "0");
			  										const ss = String(el % 60).padStart(2, "0");
			  										return h("span", { className: "ccv-run-elapsed" }, `${mm}:${ss}`);
			  									})(),
			  								Number(n.data?.progress) > 0
			  									? h("span", { className: "ccv-run-pct" },
			  										`${Math.min(97, Math.round(Number(n.data.progress)))}%`)
			  									: null)
			  							: null,
			  						(n.data?.status === "running")
			  							? h("div", {
			  								className: "ccv-dots",
			  								style: { clipPath: `inset(0 ${100 - Math.max(2, Math.min(99, Number(n.data?.progress) || 0))}% 0 0)` },
			  							})
			  							: null,
			  						(n.data?.status === "running")
			  							? h("div", { className: "ccv-pbar" },
			  								h("div", { className: "ccv-pbar-fill", style: { width: `${Math.max(2, Math.min(99, Number(n.data?.progress) || 0))}%` } }))
			  							: null,
			  						h("div", { className: "ccv-card-head", onMouseDown: (e) => e.stopPropagation(),
			  							onDoubleClick: (e) => e.stopPropagation() },
			
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
			  							n.data?.editFrom
			  								? h("span", {
			  									className: "ccv-card-tag", title: "点击跳到被编辑的原图",
			  									onClick: (e) => {
			  										e.stopPropagation();
			  										const src = nodes.find((x) => x.data?.file === n.data.editFrom);
			  										if (src) focusNode(src.id);
			  									},
			  								}, "编辑自")
			  								: null,
			  							["i2v", "fl2v"].includes(n.data?.genMode) && n.data?.refFrom
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
			  									].filter(Boolean).join(" · "))
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
			  					const rawW = n.data?.width || n.data?.params?.width;
			  					const rawH = n.data?.height || n.data?.params?.height;
			  					const resText = rawW && rawH ? `${rawW}×${rawH}` : "";
			  					return h(react.Fragment, { key: n.id }, h("div", {
			  						key: n.id + "-titlewrap",
			  						className: "ccv-titlewrap",
			  						style: { left: n.x, top: n.y, width: cs.w, transform: "translateY(-100%)", paddingBottom: 4 },
			  					}, titleEl, resText ? h("div", { key: n.id + "-res", className: "ccv-card-res" }, resText) : null), card, dot);
			  				}),
			  					(() => {
			  						const parts = [];
			  						for (const edge of edges) {
			  							const a = nodes.find((n) => n.id === edge.from);
			  							const b = nodes.find((n) => n.id === edge.to);
			  							if (!a || !b) continue;
			  							const csa = cardSize(a), csb = cardSize(b);
			  							const x1 = a.x + csa.w + 14, y1 = a.y + csa.h / 2;
			  							const x2 = b.x - 4, y2 = b.y + csb.h / 2;
			  							const mx = (x1 + x2) / 2;
			  							const d = `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
			  							const isSelEdge = edgeSel === edge.id;
			  							const isRelated = selected === edge.from || selected === edge.to;
			  							const stroke = isSelEdge ? "#ffb454" : isRelated ? "#7f93c4" : "#4a5464";
			  							const width = isSelEdge ? 2.8 : isRelated ? 2.4 : 1.6;
			  							parts.push(h("path", {
			  								key: (edge.id || `${edge.from}-${edge.to}`) + "-hit",
			  								d, stroke: "transparent", strokeWidth: 16, fill: "none",
			  								style: { pointerEvents: "stroke", cursor: "pointer" },
			  								onClick: (e) => { e.stopPropagation(); setEdgeSel(edge.id); },
			  							}));
			  							parts.push(h("path", {
			  								key: edge.id || `${edge.from}-${edge.to}`,
			  								d, stroke, strokeWidth: width, fill: "none",
			  								strokeDasharray: isSelEdge ? "6 4" : undefined,
			  								style: { pointerEvents: "none" },
			  							}));
			  							if (isSelEdge) {
			  								const dcx = (x1 + x2) / 2, dcy = (y1 + y2) / 2;
			  								parts.push(h("g", { key: (edge.id || "e") + "-del",
			  									style: { pointerEvents: "all", cursor: "pointer" },
			  									onClick: (e) => { e.stopPropagation(); deleteEdge(edge.id); } },
			  									h("circle", { cx: dcx, cy: dcy, r: 11, fill: "#1a1a21", stroke: "#ffb454", strokeWidth: 1.4 }),
			  									h("text", { x: dcx, y: dcy + 4, textAnchor: "middle", fontSize: 12, fill: "#ffb454" }, "✕")));
			  							}
			  						}
			  						if (linking && linkPos) {
			  							const a = nodes.find((n) => n.id === linking);
			  							if (a) {
			  								const csa = cardSize(a);
			  								const x1 = a.x + csa.w + 14, y1 = a.y + csa.h / 2;
			  								const mx = (x1 + linkPos.x) / 2;
			  								parts.push(h("path", {
			  									key: "temp-link",
			  									d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${linkPos.y}, ${linkPos.x} ${linkPos.y}`,
			  									stroke: "#4d7cfe", strokeWidth: 1.8, fill: "none", strokeDasharray: "5 4",
			  								}));
			  							}
			  						}
			  						return h("svg", {
			  							key: "links",
			  							style: { position: "absolute", left: 0, top: 0, width: 1, height: 1, overflow: "visible", pointerEvents: "none", zIndex: 5 },
			  						}, parts);
			  					})(),
			
			  			),
			
			  			// —— 已选片段合成条 ——
						(() => {
							const vids = pickedVideos();
							if (vids.length < 2) return null;
							const totalSec = vids.reduce((a, n) => a + (Number(n.data?.durationSec) || Number(n.data?.duration) || 0), 0);
							return h("div", { className: "ccv-compose", onMouseDown: (e) => e.stopPropagation() },
								h("span", { className: "ccv-compose-n" }, `已选 ${vids.length} 段`),
								totalSec > 0 ? h("span", { className: "ccv-compose-sec" }, `≈ ${totalSec.toFixed(1)} 秒`) : null,
								h("span", { className: "ccv-compose-list" },
									vids.map((n, i) => h("div", {
										key: n.id,
										className: "ccv-compose-item" + (composeDrag === i ? " dragging" : ""),
										draggable: true,
										title: "拖动调整顺序 · 点 × 移出",
										onDragStart: (e) => {
											setComposeDrag(i);
											try { e.dataTransfer.effectAllowed = "move"; } catch {}
										},
										onDragOver: (e) => {
											e.preventDefault();
											e.stopPropagation();
											if (composeDrag === null || composeDrag === i) return;
											setMultiSel((prev) => {
												const ids = prev.filter((id) => id !== n.id);
												const [moved] = prev.filter((id) => id === prev[composeDrag]);
												if (!moved) return prev;
												const rest = ids.filter((id) => id !== moved);
												const at = rest.indexOf(n.id);
												const insertAt = at < 0 ? rest.length : at;
												return [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)];
											});
											setComposeDrag(i);
										},
										onDragEnd: () => setComposeDrag(null),
									},
										h("span", { className: "ccv-compose-idx" }, String(i + 1)),
										h("video", {
											className: "ccv-compose-thumb",
											src: `/omni-canvas/media/${current?.id}/${n.data.file}#t=0.3`,
											muted: true, preload: "metadata", playsInline: true,
											onMouseDown: (e) => e.stopPropagation(),
										}),
										h("span", {
											className: "ccv-compose-x", title: "移出选择",
											onClick: (e) => { e.stopPropagation(); setMultiSel((prev) => prev.filter((id) => id !== n.id)); },
										}, "×")))),
								h("button", {
									className: "ccv-btn primary",
									title: "按上面的顺序拼成一条成片（硬切）",
									onClick: async () => {
										const ids = pickedVideos().map((n) => n.id);
										if (ids.length < 2) { setError("至少选两段视频"); return; }
										try {
											setBusy("合成中…");
											const r = await api("video.concat", { projectId: current.id, nodeIds: ids, title: "选中片段合成" });
											if (r.error) throw new Error(r.error);
											const c = await api("canvas.get", { id: current.id });
											setNodes(c.canvas.nodes || []); setEdges(c.canvas.edges || []);
											setMultiSel([]);
											showToast(`已合成 ${ids.length} 段`);
										} catch (e2) { setError(String(e2.message || e2)); }
										finally { setBusy(""); }
									},
								}, busy || "合成视频"),
								h("button", { className: "ccv-btn", onClick: () => setMultiSel([]) }, "清空"));
						})(),
			
						// —— 首次上手向导 ——
						wizardOpen ? h("div", {
							className: "ccv-modal-mask",
							onMouseDown: (e) => { if (e.target === e.currentTarget) setWizardOpen(false); },
						},
							h("div", { className: "ccv-modal ccv-wizard", onMouseDown: (e) => e.stopPropagation() },
								h("div", { className: "ccv-modal-head" },
									h("span", { className: "ccv-modal-title" }, "开始使用 · 3 步"),
									h("span", { className: "sp" }),
									h("button", { className: "ccv-expand", onClick: () => setWizardOpen(false) }, "✕")),
								h("div", { className: "ccv-wiz-body" },
									h("div", { className: "ccv-wiz-step" + (wizardStep === 0 ? " on" : "") },
										h("span", { className: "ccv-wiz-n" }, "1"),
										h("div", null,
											h("div", { className: "ccv-wiz-t" }, "确认本地 ComfyUI 连得上"),
											h("div", { className: "ccv-wiz-d" }, health.ok ? `已连接 ${health.comfy || "127.0.0.1:8188"}` : (health.error || "未连接"))),
										h("span", { className: "sp" }),
										h("span", { className: "ccv-wiz-badge" + (health.ok ? " ok" : " bad") }, health.ok ? "✓" : "✗")),
									h("div", { className: "ccv-wiz-step" + (wizardStep === 1 ? " on" : "") },
										h("span", { className: "ccv-wiz-n" }, "2"),
										h("div", null,
											h("div", { className: "ccv-wiz-t" }, "检查能力包与模型"),
											h("div", { className: "ccv-wiz-d" },
												packs.length ? `共 ${packs.length} 个能力包 · 就绪 ${packs.filter((p) => p.ready).length}` : "还没有能力包")),
										h("span", { className: "sp" }),
										h("button", {
											className: "ccv-btn",
											onClick: () => { setWizardStep(1); setWizardOpen(false); setPage("settings"); void loadImpls(); },
										}, "打开能力中心")),
									h("div", { className: "ccv-wiz-step" + (wizardStep === 2 ? " on" : "") },
										h("span", { className: "ccv-wiz-n" }, "3"),
										h("div", null,
											h("div", { className: "ccv-wiz-t" }, "开始创作"),
											h("div", { className: "ccv-wiz-d" }, "选「图片生成」写一句话，或「分镜脚本」批量出片")),
										h("span", { className: "sp" }),
										h("button", {
											className: "ccv-btn primary",
											onClick: () => { setWizardOpen(false); try { localStorage.setItem("omni.wizard.done", "1"); } catch {} },
										}, "知道了"))),
								h("div", { className: "ccv-modal-foot" },
									h("span", { className: "ccv-modal-meta" }, "提示：随时可在左上「⛁ 能力中心」查看缺哪些模型"),
									h("span", { className: "sp" }),
									h("button", {
										className: "ccv-btn",
										onClick: () => { setWizardOpen(false); try { localStorage.setItem("omni.wizard.done", "1"); } catch {} },
									}, "不再提示"))))
						: null,
			
						// —— 能力中心 ——
			
						// —— 提示词大窗（蒙板；点蒙板/Esc/× 关闭；中英对照）——
			  			bigOpen ? h("div", {
			  				className: "ccv-modal-mask",
			  				onMouseDown: (e) => { if (e.target === e.currentTarget) closeBig(); },
			  			},
			  				h("div", { className: "ccv-modal", onMouseDown: (e) => e.stopPropagation() },
			  					h("div", { className: "ccv-modal-head" },
			  						h("span", { className: "ccv-modal-title" }, `提示词 · ${(current && current.name) || ""}`),
			  						h("span", { className: "sp" }),
			  						h("button", {
			  							className: "ccv-modal-tab" + (bigTab === "zh" ? " on" : ""),
			  							onClick: () => { setBigTab(bigTab === "zh" ? "en" : "zh"); if (bigTab !== "zh" && !zhText.trim()) translatePrompt("en2zh"); },
			  						}, bigTab === "zh" ? "双语对照" : "仅英文"),
			  						h("button", { className: "ccv-expand", onClick: closeBig, title: "关闭" }, "✕")),
			  					h("div", { className: "ccv-modal-body" },
			  						h("textarea", {
			  							className: "ccv-modal-ta", value: prompt,
			  							placeholder: "在这里写完整提示词（六段式）…",
			  							onChange: (e) => {
			  								const v = e.target.value;
			  								setPrompt(v);
			  								if (selected) { updateNodeData(selected, (d) => { d.prompt = v; }); persistSoon(); }
			  							},
			  							onKeyDown: (e) => {
			  								if (e.key === "Escape") { e.preventDefault(); closeBig(); }
			  								if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); persist(); }
			  								if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); persist(); closeBig(); generate(); }
			  							},
			  						}),
			  						bigTab === "zh"
			  							? h("div", { className: "ccv-modal-zh" },
			  								trBusy ? h("div", { className: "ccv-modal-hint" }, "翻译中…（DSH 默认模型）")
			  									: trErr ? h("div", { className: "ccv-modal-err" }, trErr)
			  									: h("pre", { className: "ccv-modal-pre" }, zhText || "（还没有译文，点下方「翻译」）"))
			  							: null),
			  					lintWarn.length
								? h("div", { className: "ccv-lintbar" },
									h("span", { className: "ccv-lint-ico" }, "⚠"),
									h("span", null, lintWarn[0].msg),
									lintWarn.length > 1 ? h("span", { className: "ccv-lint-more" }, `（共 ${lintWarn.length} 条）`) : null)
								: null,
							h("div", { className: "ccv-modal-foot" },
			  						h("span", { className: "ccv-modal-meta" }, `${(prompt || "").length} 字 · ${(prompt || "").split(/\n\s*\n/).filter(Boolean).length} 段`),
			  						h("span", { className: "sp" }),
			  						h("button", { className: "ccv-btn", disabled: trBusy, onClick: () => translatePrompt("en2zh") }, trBusy ? "翻译中…" : "翻译成中文"),
			  						h("button", { className: "ccv-btn", onClick: () => { try { navigator.clipboard.writeText(zhText || prompt || ""); showToast("已复制"); } catch {} } }, "复制中文"),
			  						h("button", { className: "ccv-btn", onClick: () => { persist(); closeBig(); } }, "保存"),
			  						h("button", { className: "ccv-btn primary", onClick: () => { persist(); setBigOpen(false); generate(); } }, "保存并生成")))) : null,
						assetsOpen ? h("div", { className: "ccv-assets", onMouseDown: (e) => e.stopPropagation() },
							h("div", { className: "ccv-assets-head" },
								h("span", null, `资产库 · ${assets.length}`),
								h("span", { className: "sp" }),
								h("button", {
									className: "ccv-chip" + (assetView === "grid" ? " on" : ""),
									onClick: () => { setAssetView("grid"); loadAssets({}); },
								}, "▦ 网格"),
								h("button", {
									className: "ccv-chip" + (assetView === "board" ? " on" : ""),
									onClick: async () => {
										setAssetView("board");
										try {
											const b = await api("asset.scenes", { projectId: current?.id });
											setAssetBoard(b.scenes || []);
										} catch {}
									},
								}, "☰ 流程"),
								h("button", { className: "ccv-expand", onClick: () => setAssetsOpen(false) }, "✕")),
			
							h("div", { className: "ccv-assets-search" },
								h("input", {
									className: "ccv-search", value: assetQ.q || "",
									placeholder: "搜索提示词 / 镜号 / 场次 / 标签…",
									onChange: (e) => loadAssets({ q: e.target.value }),
								}),
								h("button", {
									className: "ccv-chip" + (assetQ.favorite ? " on" : ""),
									title: "只看收藏",
									onClick: () => loadAssets({ favorite: !assetQ.favorite }),
								}, "★")),
							(assetQ.kind || assetQ.role || assetQ.sceneId || assetQ.favorite || assetQ.q)
								? h("div", { className: "ccv-assets-active" },
									h("span", null, "筛选中"),
									h("span", { style: { flex: 1 } }),
									h("button", {
										className: "ccv-chip tiny",
										onClick: () => loadAssets({ kind: "", role: "", sceneId: "", favorite: false, q: "" }),
									}, "清除筛选"))
								: null,
			
							h("div", { className: "ccv-assets-filter" },
								h("span", { className: "ccv-facet-label" }, "类型"),
								[{ value: "", label: "全部" },
								 { value: "image", label: "图片" },
								 { value: "video", label: "视频" },
								 { value: "audio", label: "音频" }]
									.map((f) => h("button", {
										key: "k" + f.value, className: "ccv-chip" + (assetQ.kind === f.value ? " on" : ""),
										onClick: () => loadAssets({ kind: f.value }),
									}, f.label))),
			
							h("div", { className: "ccv-assets-filter" },
								h("span", { className: "ccv-facet-label" }, "角色"),
								[{ value: "", label: "全部" },
								 { value: "character", label: "角色" },
								 { value: "scene", label: "场景" },
								 { value: "prop", label: "道具" },
								 { value: "shot", label: "镜头" },
								 { value: "voice", label: "音色" }]
									.map((f) => h("button", {
										key: "r" + f.value, className: "ccv-chip" + (assetQ.role === f.value ? " on" : ""),
										onClick: () => loadAssets({ role: f.value }),
									}, f.label))),
			
							((assetFacets.scenes || []).length > 0 || assetQ.sceneId)
								? h("div", { className: "ccv-assets-filter ccv-facet-scenes" },
									h("span", { className: "ccv-facet-label" }, "场次"),
									[{ sceneId: "", sceneTitle: "全部" }, ...(assetFacets.scenes || [])]
										.slice(0, 10)
										.map((sc, i) => h("button", {
											key: "s" + i + (sc.sceneId || ""),
											className: "ccv-chip" + (assetQ.sceneId === (sc.sceneId || "") ? " on" : ""),
											title: sc.sceneTitle || "",
											onClick: () => loadAssets({ sceneId: sc.sceneId || "" }),
										}, `${(sc.sceneTitle || "未归场").slice(0, 10)}${sc.count ? " " + sc.count : ""}`)))
								: null,
			
							assetView === "grid"
								? h("div", { className: "ccv-assets-grid" },
									assets.map((a) => h("div", {
										key: a.id, className: "ccv-asset", title: a.prompt || "",
										style: (() => {
											const w = Number(a.width || a.params?.width || 0);
											const hh = Number(a.height || a.params?.height || 0);
											const ar = w > 0 && hh > 0 ? w / hh : (a.kind === "video" ? 16 / 9 : 1);
											return { aspectRatio: String(Math.max(0.4, Math.min(2.4, ar))) };
										})(),
										draggable: true,
										onDragStart: (e) => {
											try {
												e.dataTransfer.setData("application/x-omni-asset", a.id);
												e.dataTransfer.effectAllowed = "copy";
											} catch {}
										},
									},
										h("span", { className: "ccv-asset-role" + (a.role ? " " + a.role : "") },
											a.role === "character" ? "角色" : a.role === "scene" ? "场景"
												: a.role === "prop" ? "道具" : a.role === "shot" ? "镜头"
												: a.role === "voice" ? "音色" : (a.kind === "video" ? "视频" : "图片")),
										a.shotLabel ? h("span", { className: "ccv-asset-shot" }, String(a.shotLabel).slice(0, 18)) : null,
										a.variantCount > 1
											? h("span", {
												className: "ccv-asset-var",
												title: `这张卡共 ${a.variantCount} 个版本，点击切换`,
												onClick: async (e) => {
													e.stopPropagation();
													const r = await api("asset.query", { projectId: current?.id, nodeId: a.nodeId, limit: 50 }).catch(() => null);
													setAssetVariants(r ? { nodeId: a.nodeId, items: r.items || [] } : null);
												},
											}, `v${a.variantIndex}/${a.variantCount}`)
											: null,
										a.favorite ? h("span", { className: "ccv-asset-fav" }, "★") : null,
										h(a.kind === "video" ? "video" : "img", {
											className: "ccv-asset-media",
											src: `/omni-canvas/media/${current?.id}/${a.file}`,
											...(a.kind === "video" ? { muted: true, preload: "metadata" } : {}),
											onClick: () => setPreview({ file: a.file, kind: a.kind, asset: a }),
										}),
										h("div", { className: "ccv-asset-actions" },
											h("button", {
												title: a.favorite ? "取消收藏" : "收藏",
												onClick: async (e) => {
													e.stopPropagation();
													await api("asset.update", { projectId: current?.id, assetId: a.id, patch: { favorite: !a.favorite } }).catch(() => {});
													loadAssets({});
												},
											}, a.favorite ? "★" : "☆"),
											h("button", {
												title: "放到画布",
												onClick: (e) => { e.stopPropagation(); placeAsset(a); },
											}, "＋"),
											h("button", {
												title: "详情 / 复用",
												onClick: (e) => { e.stopPropagation(); setAssetDetail(a); },
											}, "ⓘ"),
											h("button", {
												title: "定位到画布",
												onClick: (e) => {
													e.stopPropagation();
													const n = nodes.find((x) => x.id === a.nodeId);
													if (!n) { setError("该资产对应的卡片已被删除"); return; }
													const rect = stageRef.current?.getBoundingClientRect();
													const zoom = 1;
													if (rect) {
														setVp({ zoom, x: rect.width / 2 - (n.x + n.w / 2) * zoom, y: rect.height / 2 - (n.y + n.h / 2) * zoom });
													}
													setSelected(n.id);
													setAssetsOpen(false);
												},
											}, "◎"),
											h("button", {
												title: "查看血缘",
												onClick: async (e) => {
													e.stopPropagation();
													const r = await api("asset.lineage", { projectId: current?.id, assetId: a.id }).catch(() => null);
													setAssetLineage(r || null);
												},
											}, "⌘"),
											h("a", {
												className: "ccv-asset-dl", title: "下载",
												href: `/omni-canvas/media/${current?.id}/${a.file}`,
												download: String(a.file || "").split("/").pop(),
											}, "↓"),
											h("button", {
												title: "从资产库删除（不影响画布）",
												onClick: async (e) => {
													e.stopPropagation();
													if (!window.confirm("从资产库删除这条记录？（画布上已放置的节点不受影响）")) return;
													await api("asset.delete", { id: current.id, assetId: a.id }).catch(() => {});
													loadAssets({});
												},
											}, "✕")))))
								: h("div", { className: "ccv-board" },
									(assetBoard || []).map((sc) => h("div", { key: sc.key, className: "ccv-board-scene" },
										h("div", { className: "ccv-board-title" }, `${sc.sceneTitle}`,
											h("span", { className: "ccv-board-count" }, `${sc.shots.length}`)),
										h("div", { className: "ccv-board-strip" },
											sc.shots.map((sh) => h("div", { key: sh.id, className: "ccv-board-shot", title: sh.shot || "" },
												h(sh.kind === "video" ? "video" : "img", {
													className: "ccv-board-thumb",
													src: `/omni-canvas/media/${current?.id}/${sh.file}`,
													...(sh.kind === "video" ? { muted: true, preload: "metadata" } : {}),
												}),
												h("span", { className: "ccv-board-label" }, String(sh.shot || "").slice(0, 14)),
												(sh.refs && sh.refs.length)
													? h("span", { className: "ccv-board-refs" },
														sh.refs.map((rf, ri) => h("img", {
															key: ri, className: "ccv-board-ref",
															src: `/omni-canvas/media/${current?.id}/${rf.file}`,
															title: rf.role || "",
														})))
													: null,
												sh.durationSec ? h("span", { className: "ccv-board-dur" }, `${sh.durationSec}s`) : null)))))),
			
							assetDetail
								? h("div", { className: "ccv-detail", onMouseDown: (e) => e.stopPropagation() },
									h("div", { className: "ccv-lineage-head" },
										h("span", null, assetDetail.role || assetDetail.kind),
										h("span", { className: "sp" }),
										h("button", { className: "ccv-expand", onClick: () => setAssetDetail(null) }, "✕")),
									h("div", { className: "ccv-detail-body" },
										h(assetDetail.kind === "video" ? "video" : "img", {
											className: "ccv-detail-media",
											src: `/omni-canvas/media/${current?.id}/${assetDetail.file}`,
											...(assetDetail.kind === "video" ? { muted: true, preload: "metadata" } : {}),
										}),
										h("div", { className: "ccv-detail-meta" },
											h("div", null, `文件：${String(assetDetail.file).split("/").pop()}`),
											assetDetail.shotLabel ? h("div", null, `镜头：${assetDetail.shotLabel}`) : null,
											assetDetail.sceneTitle ? h("div", null, `场次：${assetDetail.sceneTitle}`) : null,
											assetDetail.model ? h("div", null, `模型：${assetDetail.model}`) : null,
											assetDetail.params?.seed !== undefined ? h("div", null, `seed：${assetDetail.params.seed}`) : null,
											assetDetail.createdAt ? h("div", null, `时间：${String(assetDetail.createdAt).slice(0, 19).replace("T", " ")}`) : null),
										h("details", { className: "ccv-detail-prompt" },
											h("summary", null, "提示词"),
											h("pre", null, assetDetail.prompt || "（无）")),
										h("div", { className: "ccv-detail-actions" },
											h("button", { className: "ccv-btn primary", onClick: () => { placeAsset(assetDetail); setAssetDetail(null); } }, "放到画布"),
											h("button", {
												className: "ccv-btn",
												onClick: () => { try { navigator.clipboard.writeText(assetDetail.prompt || ""); showToast("提示词已复制"); } catch {} },
											}, "复制提示词"),
											h("button", {
												className: "ccv-btn",
												title: "把这条资产的提示词填到当前选中卡片",
												onClick: () => {
													if (!selected) { setError("先选中一张卡片"); return; }
													updateNodeData(selected, { prompt: assetDetail.prompt || "" });
													setPrompt(assetDetail.prompt || "");
													setAssetDetail(null);
													setAssetsOpen(false);
													showToast("已填入当前卡片");
												},
											}, "填入当前卡片"),
											h("a", {
												className: "ccv-btn",
												href: `/omni-canvas/media/${current?.id}/${assetDetail.file}`,
												download: String(assetDetail.file).split("/").pop(),
											}, "下载"))))
								: null,
			
							assetVariants
								? h("div", { className: "ccv-lineage", onMouseDown: (e) => e.stopPropagation() },
									h("div", { className: "ccv-lineage-head" },
										h("span", null, `版本 ${assetVariants.items.length}`),
										h("span", { className: "sp" }),
										h("button", { className: "ccv-expand", onClick: () => setAssetVariants(null) }, "✕")),
									h("div", { className: "ccv-var-grid" },
										assetVariants.items.map((v) => h("div", {
											key: v.id, className: "ccv-var-item", title: v.createdAt || "",
											onClick: () => { placeAsset(v); setAssetVariants(null); },
										},
											h(v.kind === "video" ? "video" : "img", {
												className: "ccv-var-thumb",
												src: `/omni-canvas/media/${current?.id}/${v.file}`,
												...(v.kind === "video" ? { muted: true, preload: "metadata" } : {}),
											}),
											h("span", { className: "ccv-var-label" }, v.variantIndex ? "v" + v.variantIndex : "")))))
								: null,
			
							assetLineage
								? h("div", { className: "ccv-lineage", onMouseDown: (e) => e.stopPropagation() },
									h("div", { className: "ccv-lineage-head" },
										h("span", null, "血缘"),
										h("span", { className: "sp" }),
										h("button", { className: "ccv-expand", onClick: () => setAssetLineage(null) }, "✕")),
									h("div", { className: "ccv-lineage-body" },
										...(assetLineage.parents || []).map((p) => h("div", { key: p.id, className: "ccv-lineage-row" },
											h("span", { className: "ccv-lineage-tag" }, p.role || p.kind), String(p.file).split("/").pop())),
										h("div", { className: "ccv-lineage-row cur" },
											h("span", { className: "ccv-lineage-tag" }, assetLineage.self?.role || assetLineage.self?.kind),
											String(assetLineage.self?.file || "").split("/").pop()),
										...(assetLineage.children || []).map((c) => h("div", { key: c.id, className: "ccv-lineage-row" },
											h("span", { className: "ccv-lineage-tag" }, c.role || c.kind), "↳ " + String(c.file).split("/").pop()))))
								: null,
						) : null,
			
			  			error ? h("div", { className: "ccv-err", style: { position: "absolute", left: 12, right: 12, top: 12, zIndex: 30 } }, error) : null,
			
			  			floatStyle ? h("div", {
			  				className: "ccv-float", style: floatStyle,
			  				onMouseDown: (e) => e.stopPropagation(), onWheel: (e) => e.stopPropagation(),
			  			},
			  				h("div", { className: "ccv-float-head" },
			  					h("span", { className: "sp" }),
			  					h("button", {
			  					className: "ccv-expand", title: "大字编辑与中英对照",
			  					onClick: (e) => { e.stopPropagation(); openBig(); },
			  					}, "⤢"),
			  				),
			  				(sel.type === "video" && videoMode !== "auto")
			  					? (() => {
			  						const refs = refsOf(selected).length;
			  						const need = { t2v: [0, 0], i2v: [1, 2], r2v: [1, 9], fl2v: [2, 2], talking: [1, 2] }[videoMode];
			  						if (!need || (refs >= need[0] && refs <= need[1])) return null;
			  						const label = { t2v: "文生视频", i2v: "图生视频", r2v: "参考生视频", fl2v: "首尾帧", talking: "数字人口播" }[videoMode];
			  						return h("div", { className: "ccv-envbar" },
			  							h("span", { className: "ccv-envdot" }, "⚠"),
			  							h("span", { className: "ccv-envtext" },
			  								`${label}需要 ${need[0]}${need[1] === need[0] ? "" : "–" + need[1]} 张参考图，当前连了 ${refs} 张`));
			  					})()
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
			  				// 音色引用（方案 A）：编号与 refAudios 下标一致，点徽标插入 <Audio N>
			  				(() => {
			  					const vs = voiceRefsOf(selected);
			  					if (!vs.length) return null;
			  					const warn = validateVoiceTags(selected, prompt);
			  					return h("div", { className: "ccv-voice-refs" },
			  						vs.map((v, i) => h("div", {
			  							key: v.file, className: "ccv-voice-chip" + (v.locked ? " locked" : ""),
			  							title: `${v.name || "音色"}｜点击插入 <Audio ${i + 1}>`,
			  							onClick: () => insertToken(i + 1, "audio"),
			  						},
			  							h("span", { className: "ccv-vc-i" }, `♫${i + 1}`),
			  							h("span", { className: "ccv-vc-name" }, v.name || `音色${i + 1}`),
			  							h("span", { className: "ccv-vc-lock", title: v.locked ? "已锁定" : "未锁定（还没试听确认）" }, v.locked ? "🔒" : "○"),
			  							h("button", {
			  								className: "ccv-vc-btn", title: "试听",
			  								onClick: (e) => {
			  									e.stopPropagation();
			  									const a2 = document.createElement("audio");
			  									a2.src = `/omni-canvas/media/${current?.id}/${v.file}`;
			  									a2.play().catch(() => {});
			  								},
			  							}, "▶"),
			  							h("button", {
			  								className: "ccv-vc-btn", title: "断开这条音色",
			  								onClick: (e) => { e.stopPropagation(); unlinkVoice(selected, v.nodeId); },
			  							}, "×"))),
			  						h("span", { className: "ccv-refcount" }, `×${vs.length}`),
			  					warn ? h("span", { className: "ccv-voice-warn" }, warn) : null);
			  				})(),
			  				h("textarea", {
			  					ref: taRef, className: "ccv-ta", value: prompt,
			  					placeholder: videoMode === "talking" ? "把口播文案粘贴到这里（按句自动分段，最长 120 秒）…" : "可直接文字生图，或上传图片后输入文字指令对图片进行编辑…",
			  					onChange: (e) => {
			  						const v = e.target.value;
			  						setPrompt(v);
			  						if (videoMode === "talking" && selected) {
			  							updateNodeData(selected, (d) => { d.script = v; });
			  						}
			  						if (sel?.id) { updateNodeData(sel.id, (d) => { d.prompt = v; }); persistSoon(); }
			  					},
			  					onBlur: () => { if (sel?.id) persist(); },
			  					onKeyDown: (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); generate(); } },
			  				}),
			  				h("div", { className: "ccv-row" },
			  					// 提示词模板：底部按钮 → 向上弹层
			  					h("div", { className: "ccv-tplwrap" },
			  						h("button", {
			  							className: "ccv-select ccv-tplbtn" + (tplOpen ? " on" : ""),
			  							title: "插入预设提示词",
			  							onClick: (e) => { e.stopPropagation(); setTplOpen((v) => !v); },
			  						}, "◎ 模板 ▾"),
			  						tplOpen
			  							? h("div", { className: "ccv-tplpop", onClick: (e) => e.stopPropagation() },
			  								h("div", { className: "ccv-tplpop-head" }, "预设提示词"),
			  								tpls.map((t) => h("button", {
			  									key: t.id, className: "ccv-tplpop-item", title: String(t.text || "").slice(0, 160),
			  									onClick: () => insertTemplate(t),
			  								}, h("span", { className: "ccv-tplpop-ico" }, "▤"), t.name)),
			  								tpls.length ? null : h("div", { className: "ccv-tplpop-head" }, "（模板未加载，重启 DSH 后再试）"))
			  							: null),
			  					(() => {
			  						const modeForImpl = videoMode === "auto"
			  							? (refsOf(selected).length ? "r2v" : "t2v")
			  							: videoMode;
			  						const cap = sel.type === "video"
			  							? `video-${modeForImpl}`
			  							: (refsOf(selected).length ? "image-edit" : "image-t2i");
			  						const list = impls.filter((x) => x.capability === cap);
			  						// 视频默认就是导演台：只有你额外绑定了自定义工作流，才显示这个下拉
			  						const hasCustom = list.some((x) => x.kind !== "内置模板");
			  						if (sel.type === "video" && !hasCustom) return null;
			  						if (!list.length) {
			  							if (sel.type === "video") return null;
			  							return h("select", {
			  								className: "ccv-select", value: model,
			  								onChange: (e) => { const v = e.target.value; setModel(v); if (sel?.id) { updateNodeData(sel.id, (d) => { d.model = v; }); persistSoon(); } },
			  							}, MODELS.map((m) => h("option", { key: m.id, value: m.id }, m.label)));
			  						}
			  						return h("select", {
			  							className: "ccv-select", title: "这张卡用哪个工作流生成",
			  							value: String(sel.data?.impl || ""),
			  							onChange: (e) => {
			  								const v = e.target.value;
			  								updateNodeData(sel.id, (d) => { d.impl = v || undefined; });
			  							},
			  						},
			  							h("option", { value: "" }, "默认工作流"),
			  							list.map((i2) => h("option", { key: i2.id, value: i2.id },
			  								`${i2.name}${i2.kind === "内置模板" ? "" : " · 工作流"}`)));
			  					})(),
			  					sel.type === "video"
			  						? h("select", {
			  							className: "ccv-select", value: videoMode, title: "生成方式",
			  							onChange: (e) => {
			  								const v = e.target.value;
			  								setVideoMode(v);
			  								if (sel?.id) {
			  									updateNodeData(sel.id, (d) => {
			  										d.videoMode = v;
			  										if (v === "talking" && !d.script) d.script = String(prompt || "");
			  									});
			  								}
			  							},
			  						},
			  							h("option", { value: "auto" },
			  								`自动·${refsOf(selected).length ? "参考" : "文生"}`),
			  							h("option", { value: "t2v" }, "文生视频"),
			  							h("option", { value: "i2v" }, "图生视频"),
			  							h("option", { value: "r2v" }, "参考生视频"),
			  							h("option", { value: "fl2v" }, "首尾帧"),
			  							h("option", { value: "talking" }, "数字人口播"))
			  						: null,
			  					h("select", {
			  						className: "ccv-select", title: "画幅",
			  						value: sel.type === "video" ? (sel.data?.aspect || "9:16") : aspect,
			  						onChange: (e) => {
			  							const v = e.target.value;
			  							if (sel?.id) { updateNodeData(sel.id, (d) => { d.aspect = v; }); persistSoon(); }
			  							setAspect(v);
			  						},
			  					}, ASPECTS.map((a) => h("option", { key: a, value: a }, a))),
			  					sel.type === "video" ? null : h("select", { className: "ccv-select", value: count, onChange: (e) => { const v = Number(e.target.value); setCount(v); if (sel?.id) { updateNodeData(sel.id, (d) => { d.count = v; }); persistSoon(); } } },
			  						COUNTS.map((c) => h("option", { key: c, value: c }, `${c} 张`))),
			  					sel.type === "video"
			  						? (videoMode === "talking"
			  							? h("span", {
			  								className: "ccv-select", title: "时长由口播文案自动计算（字数 ÷ 5 秒）",
			  								style: { opacity: 0.85 },
			  							}, (() => {
			  								const txt = String(sel.data?.script || prompt || "");
			  								const chars = txt.replace(/\s/g, "").length;
			  								const sec = Math.round((chars / 5) * 10) / 10;
			  								return `自动 ≈ ${sec || 0} 秒 · ${Math.max(1, Math.ceil(sec / 15))} 段`;
			  							})())
			  							: h("div", { style: { display: "contents" } },
			  							h("button", {
			  								className: "ccv-select ccv-durbtn" + (durOpen ? " on" : ""),
			  								title: "时长 2–15 秒，可手输小数",
			  								onClick: (e) => { e.stopPropagation(); setDurOpen((v) => !v); },
			  							}, `${Number(duration).toFixed(1)} 秒 ▾`),
			  							durOpen
			  								? h("div", { className: "ccv-durpop", onClick: (e) => e.stopPropagation() },
			  									h("div", { className: "ccv-durpop-head" }, "时长（2–15 秒）"),
			  									h("div", { className: "ccv-durpop-row" },
			  										h("input", {
			  											type: "range", className: "ccv-durrange", min: 2, max: 15, step: 0.1,
			  											value: duration,
			  											onChange: (e) => { const v = Math.min(15, Math.max(2, Math.round(Number(e.target.value) * 10) / 10)); setDuration(v); if (sel?.id) { updateNodeData(sel.id, (d) => { d.duration = v; }); persistSoon(); } },
			  										}),
			  										h("input", {
			  											type: "number", className: "ccv-durinput", min: 2, max: 15, step: 0.1,
			  											value: duration,
			  											onChange: (e) => {
			  												const v = Number(e.target.value);
			  												const vv = Number.isFinite(v) ? Math.min(15, Math.max(2, Math.round(v * 10) / 10)) : 6;
															setDuration(vv);
															if (sel?.id) { updateNodeData(sel.id, (d) => { d.duration = vv; }); persistSoon(); }
			  											},
			  										}),
			  										h("span", { className: "ccv-durlab" }, "秒")),
			  									h("div", { className: "ccv-durpop-quick" },
			  										[2, 4, 6, 8, 10, 15].map((d) => h("button", {
			  											key: d, className: "ccv-chip", onClick: () => { setDuration(d); if (sel?.id) { updateNodeData(sel.id, (dd) => { dd.duration = d; }); persistSoon(); } },
			  										}, `${d}s`)),
			  										h("button", { className: "ccv-chip", onClick: () => setDurOpen(false) }, "完成")))
			  								: null))
			  						: h("select", { className: "ccv-select", value: resolution, onChange: (e) => { const v = e.target.value; setResolution(v); if (sel?.id) { updateNodeData(sel.id, (d) => { d.resolution = v; }); persistSoon(); } } },
			  							RESOLUTIONS.map((r) => h("option", { key: r, value: r }, r))),
			  					sel.type === "video"
			  						? h("select", { className: "ccv-select", value: videoRes, title: "视频分辨率",
			  							onChange: (e) => { const v = e.target.value; setVideoRes(v); if (sel?.id) { updateNodeData(sel.id, (d) => { d.videoRes = v; }); persistSoon(); } } },
			  							[
			  								{ value: "480p", label: "480p" },
			  								{ value: "720p", label: "720p" },
			  								{ value: "900p", label: "900p" },
			  								{ value: "1080p", label: "1080p" },
			  							].map((r) => h("option", { key: r.value, value: r.value }, r.label)))
			  						: null,
			  					h("span", { className: "ccv-spacer" }),
			  					h("button", {
			  						className: "ccv-send", onClick: generate,
			  						title: "提交生成（可连续点，任务进入队列）",
			  						}, "↑"),
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
			  				h("button", {
			  					title: "上传图片 / 视频 / 音频，自动落到画布",
			  					onClick: () => { const at = menu?.world; setMenu(null); pickFiles(at); },
			  				},
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
			  		
			
			  		(() => {
			  			const n = nodes.find((x) => x.id === selected);
			  			if (!n || !n.data?.file || n.type === "script" || n.type === "text") return null;
			  		 if (!current) return null;
			  			const zoom = vp.zoom || 1;
			  			const left = vp.x + n.x * zoom;
			  			const top = vp.y + n.y * zoom - 46;
			  			const isVideo = n.type === "video";
			  			const exec = async (fn, label) => {
			  				try { await fn(); } catch (e) { setError(String(e.message || e)); showToast("❌ " + label + "失败"); }
			  			};
			  			const btn = (key, label, title, fn) => h("button", {
			  				key, className: "ccv-tb-btn", title,
			  				onMouseDown: (e) => e.stopPropagation(),
			  				onClick: (e) => { e.stopPropagation(); fn(); },
			  			}, label);
			  			return h("div", {
			  				className: "ccv-toolbar", style: { left: Math.max(8, left), top: Math.max(8, top) },
			  				onMouseDown: (e) => e.stopPropagation(),
			  			},
			  				isVideo
			  					? [
			  						btn("dl", "下载", "把这条视频存到下载文件夹", () => exec(() => {
										const url = `/omni-canvas/media/${current.id}/${n.data.file}`;
										const a2 = document.createElement("a");
										a2.href = url;
										a2.download = String(n.data.file).split("/").pop();
										document.body.appendChild(a2);
										a2.click();
										a2.remove();
										showToast("已开始下载：" + a2.download);
									}, "下载")),
									btn("frame", "抽帧", "抽末帧成图片，并自动定位", () => exec(() => extractFrame(n), "抽帧")),
			  						btn("next", "接一镜", "抽末帧 + 建图生视频链路", () => exec(() => continueShot(n), "接一镜")),
			  						btn("regen", "重生成（换 take）", "同提示词重新生成一版，内容会变（约 90 秒）", () => exec(() => regenHighRes(n), "重生成")),
			  						btn("pub", "发布包", "导出 mp4 + 说明 txt", () => exec(async () => {
			  							const r = await api("video.publish", { projectId: current.id, nodeId: n.id });
			  							if (r.error) throw new Error(r.error);
			  							showToast("已导出：" + String(r.video || "").split(/[\\/]/).pop());
			  						}, "发布包")),
			  					]
			  					: [
			  						h("div", { key: "upw", className: "ccv-tb-split" },
			  							h("button", {
			  								className: "ccv-tb-btn", title: "4K 超分（SeedVR2 修细节，约 50 秒）",
			  								onMouseDown: (e) => e.stopPropagation(),
			  								onClick: (e) => { e.stopPropagation(); exec(() => upscaleNode(n), "4K 超分"); },
			  							}, "4K 超分")),
			  						h("button", {
										className: "ccv-tb-btn", title: "下载原图（原始分辨率）",
										onMouseDown: (e) => e.stopPropagation(),
										onClick: (e) => {
											e.stopPropagation();
											const url = `/omni-canvas/media/${current.id}/${n.data.file}`;
											const a2 = document.createElement("a");
											a2.href = url;
											a2.download = String(n.data.file).split("/").pop();
											document.body.appendChild(a2);
											a2.click();
											a2.remove();
											showToast("已开始下载：" + a2.download);
										},
									}, "下载"),
									btn("edit", "编辑", "以这张图为参考做编辑（自动连线并预填模板）", () => exec(() => editFromImage(n), "编辑")),
			  					],
			  				btn("more", "⋯", "更多操作", () => setTbMenu((v) => !v)),
			  				tbMenu
			  					? h("div", { className: "ccv-tb-menu", onMouseDown: (e) => e.stopPropagation() },
			  						h("button", { onClick: () => { duplicateNode(n.id); setTbMenu(false); } }, "复制节点"),
			  						n.data?.refFrom ? h("button", { onClick: () => {
			  							const src = nodes.find((x) => x.data?.file === n.data.refFrom);
			  							if (src) focusNode(src.id);
			  							setTbMenu(false);
			  						} }, "跳到首帧来源") : null,
			  						n.data?.frameOf ? h("button", { onClick: () => { focusNode(n.data.frameOf); setTbMenu(false); } }, "跳到来源视频") : null,
			  						h("button", { className: "danger", onClick: () => { deleteNode(n.id); setTbMenu(false); } }, "删除节点"))
			  					: null);
			  		})(),
			
			  			nodes.length ? null : h("div", { className: "ccv-onboard" },
			  				h("div", { className: "ccv-onboard-title" }, "三步出片"),
			  				h("div", { className: "ccv-onboard-steps" },
			  					h("div", { className: "ccv-onboard-step" },
			  						h("span", { className: "ccv-onboard-n" }, "1"),
			  						h("span", null, "写一句话生成图片，或把已有图片当参考拖进来")),
			  					h("div", { className: "ccv-onboard-step" },
			  						h("span", { className: "ccv-onboard-n" }, "2"),
			  						h("span", null, "图片选中后点卡片上的「编辑」「AI 超分」，或点「生成视频」做镜头")),
			  					h("div", { className: "ccv-onboard-step" },
			  						h("span", { className: "ccv-onboard-n" }, "3"),
			  						h("span", null, "要成片就加一张「分镜脚本卡」，逐镜出片后拼接"))),
			  				h("div", { className: "ccv-onboard-actions" },
			  					h("button", { className: "ccv-chip on", onClick: () => addNode("image", { x: 160, y: 140 }) }, "开始文生图"),
			  					h("button", { className: "ccv-chip", onClick: () => addNode("video", { x: 520, y: 140 }) }, "开始文生视频"),
			  					h("button", { className: "ccv-chip", onClick: () => addNode("script", { x: 160, y: 520 }) }, "建分镜脚本"))),
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
			  						src: `/omni-canvas/media/${preview.projectId || current?.id}/${preview.file}`,
			  						controls: true, autoPlay: true, loop: true, className: "ccv-lb-media",
			  					})
			  					: h("img", { src: `/omni-canvas/media/${preview.projectId || current?.id}/${preview.file}`, className: "ccv-lb-media" }),
			  				h("button", { className: "ccv-lb-close", onClick: () => setPreview(null) }, "✕"),
			  				h("div", { className: "ccv-lb-bar" },
			  					preview.asset ? h("span", { className: "ccv-lb-meta" },
			  						[preview.asset.role, preview.asset.kind, preview.asset.width && preview.asset.height ? `${preview.asset.width}×${preview.asset.height}` : ""]
			  							.filter(Boolean).join(" · ")) : null,
			  					h("span", { style: { flex: 1 } }),
			  					preview.asset ? h("button", {
			  						className: "ccv-btn", onClick: () => { placeAsset(preview.asset); setPreview(null); },
			  					}, "放到画布") : null,
			  					h("a", {
			  						className: "ccv-btn",
			  						href: `/omni-canvas/media/${preview.projectId || current?.id}/${preview.file}`,
			  						download: String(preview.file || "").split("/").pop(),
			  					}, "下载"),
			  					h("button", { className: "ccv-btn", onClick: () => setPreview(null) }, "关闭")),
			  			),
			  		) : null,
			  	);
			  }
			
			  return CanvasApp;
			};

			return module.exports;
		})();

		/* ---- 主逻辑 ---- */
/* FRAGMENT: 本文件是工厂体片段（含 return），不能单独 node --check。
   由 scripts/bundle-client.mjs 与 lib/client-src/*.js 一起内联成 lib/client.js。 */
		const react = require("react");
		const h = react.createElement;
		const { useState, useEffect, useRef, useCallback } = react;

		const { T, css, useCss } = __sub["./styles.js"];
		const inject = ["slots"];
		const { CLIENT_LOADED_AT, report, MODELS, ASPECTS, COUNTS, RESOLUTIONS, cardSize, makeAudioNode, makeTextNode, SCRIPT_COLUMNS, SCRIPT_W, ROLE_LABEL, nextRole, assetName, assetDesc, inferRole, makeScriptNode, composeRowPrompt, SKELETON, api } = __sub["./helpers.js"];

		// 设计令牌见 docs/前端样式规范.md —— 中性黑灰，不许带蓝





		const CanvasApp = __sub["./canvas-app.js"]({ CLIENT_LOADED_AT, report, MODELS, ASPECTS, COUNTS, RESOLUTIONS, cardSize, makeAudioNode, makeTextNode, SCRIPT_COLUMNS, SCRIPT_W, ROLE_LABEL, nextRole, assetName, assetDesc, inferRole, makeScriptNode, composeRowPrompt, SKELETON, api });
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
		return module.exports;	},
});
