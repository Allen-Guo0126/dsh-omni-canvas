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

  	const openBig = () => { setBigSnap(prompt || ""); setBigOpen(true); setTrErr(""); };
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
  		if (!sel || sel.type === "script" || sel.type === "text") return null;
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
  						? `● 已连接 · v${diag.comfy.version || "?"} · ${diag.comfy.vramTotalGB || "?"} GB 显存 · 延迟 ${diag.comfy.latencyMs || "?"} ms`
  						: (diag ? (diag.error || (diag.comfy && diag.comfy.error) || "未连接") : "尚未检查")),
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
  		h("div", { className: "ccv-set-card" },
  			h("div", { className: "ccv-set-title" }, "默认模型"),
  			h("div", { className: "ccv-cap-hint" }, "每个能力用哪个工作流出图/出片。下拉里的选项来自下面「工作流库」——配置并试跑通过后自动出现。"),
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
  					const CAP_ICO = { "image-t2i": "🖼", "image-edit": "🎛", "video-t2v": "🎬", "video-i2v": "🎞", "video-fl2v": "⏱", "video-r2v": "🧷", "audio-tts": "🔊", "text-llm": "📝" };
  					const configured = opts.length > 0;
  					const warn = configured && isBuiltin && curT && !curT.ok;
  					const hintText = !configured
  						? "未配置 · 先去下面「工作流」配一个"
  						: warn ? "缺模型或节点，当前不可用" : "";
  					return h("div", { key: cap.id, className: "ccv-mrow" + (configured && !warn ? "" : " need") },
  						h("span", { className: "ccv-mrow-ico" }, CAP_ICO[cap.id] || "\u2022"),
  						h("span", { className: "ccv-mrow-main" },
  							h("span", { className: "ccv-mrow-name" }, cap.label),
  							hintText ? h("span", { className: "ccv-mrow-hint" + (warn ? " bad" : "") }, hintText) : null),
  						h("span", { style: { flex: 1 } }),
  						!configured
  							? h("button", {
  								className: "ccv-chip",
  								onClick: () => {
  									setWfOpen(true);
  									loadWorkflows();
  									setTimeout(() => {
  										document.querySelector(".ccv-set-card.wf")?.scrollIntoView({ behavior: "smooth", block: "start" });
  									}, 60);
  								},
  							}, "去配置")
  							: null,
  						configured
  							? h("select", {
  								className: "ccv-select ccv-mrow-sel",
  								value: opts.some((o) => o.value === def) ? def : opts[0].value,
  								onChange: async (e) => {
  									const v = e.target.value;
  									try {
  										const r = await api("binding.setDefault", { capability: cap.id, target: v });
  										if (r && r.ok) { setBindingDefaults(r.defaults || {}); setP1msg("已切换默认：" + cap.label); }
  										else setP1msg("切换失败：" + ((r && r.error) || "未知"));
  										await loadBindings();
  									} catch (err) { setP1msg("切换失败：" + String(err.message || err)); }
  								},
  							}, opts.map((o) => h("option", { key: o.value, value: o.value }, o.label)))
  							: null);
  				}))),
  			p1msg ? h("div", { className: "ccv-set-hint" }, p1msg) : null),
  		h("div", { className: "ccv-set-card wf" + (wfOpen ? "" : " collapsed") },
  			h("div", { className: "ccv-set-title" }, "工作流库",
  				h("span", { className: "ccv-set-hint", style: { marginLeft: 10 } },
  					wfRes ? `${(wfRes.workflows || []).length} 个已扫描` : ""),
  				h("span", { style: { flex: 1 } }),
  				h("button", { className: "ccv-chip", onClick: () => setWfOpen((v) => !v) },
  					wfOpen ? "收起" : "展开")),
  			h("div", { className: "ccv-set-actions" },
  				h("button", { className: "ccv-chip", onClick: loadWorkflows, disabled: p1busy === "wf" },
  					p1busy === "wf" ? "扫描中…" : "扫描工作流"),
  				h("button", {
  					className: "ccv-chip",
  					title: "AI 写好绑定后点这里同步状态",
  					onClick: async () => { await loadBindings(); await loadWorkflows(); showToast("状态已刷新"); },
  				}, "刷新状态"),
  				h("span", { className: "ccv-set-hint", style: { marginTop: 0 } },
  					"每条工作流：点「自动配置」复制指令发给 AI → 回来点「试跑」→ 通过后自动进入上面「默认模型」的下拉。")),
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
  											setRowErr(bound.id, r && r.ok ? "" : String((r && r.error) || "试跑失败（无详细信息）"));
  											if (r && r.ok) setP1msg("试跑通过，已加入可选");
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
  						h("span", { className: "ccv-set-hint", style: { marginTop: 0, marginLeft: 8 } }, `${w.nodeCount} 节点`),
  						rowErr && rowErr.id === bound.id && rowErr.msg
  							? h("span", { className: "ccv-wrow-err", title: rowErr.msg },
  								String(rowErr.msg).slice(0, 60))
  							: null);
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
  				: h("div", { className: "ccv-cap-none" }, "还没有生成记录 —— 去画布生成第一张图试试"),
  			jobHistory.length ? null : null),

  		h("div", { className: "ccv-set-card" },
  			h("div", { className: "ccv-set-title" }, "常见问题",
  				h("span", { className: "ccv-set-hint", style: { marginLeft: 10 } }, "夜间迭代踩过的坑"),
  				h("span", { style: { flex: 1 } }),
  				h("button", { className: "ccv-chip", onClick: () => setFaqOpen((v) => !v) },
  					faqOpen ? "收起" : "展开")),
  			faqOpen
  				? h("div", { className: "ccv-faq" },
  					[
  						["显存不足 / CUDA 崩了", "设置页看「显存」；输入框上方有「释放显存」；生成会自动降档（1080p→480p），仍失败就换更小画幅或重启 ComfyUI。"],
  						["工作流报 value not in list / 模型名不匹配", "内置模板会自动模糊匹配模型名（同族 + 精度标签）并给 warning；不放心就改 templates/*.json 里的模型名，或在 ComfyUI 里改名。"],
  						["扫描显示「缺节点」", "缺的是自定义节点（KJNodes 的 SetNode/GetNode、Nunchaku 等）。装对应节点包后再扫描；不装就用别的工作流。"],
  						["含子图的工作流能不能用", "可以，已支持展开。若结果异常，在 ComfyUI 里「导出 → API 格式」另存一份再绑定更稳。"],
  						["首尾帧（fl2v）出片不对", "实测输出与两张输入图无关，暂不推荐。生成时会 warning，建议改用「参考生视频」或「接一镜」。"],
  						["点「自动配置」没反应", "它只复制指令（不是自动跑）。复制后发给 AI；若剪贴板被拒会弹文本框，也可点设置页「复制配置指令」。"],
  						["视频放大/抽帧/拼接报 ffmpeg 缺失", "运行 node tools/setup.mjs --ffmpeg 自动下载，或把 ffmpeg.exe 放到 E:/Allen/tools/bin。"],
  						["语音合成报错", "先跑 node tools/setup.mjs --tts 装 edge-tts；没装会回退 Windows SAPI（声音机械但可用）。"],
  						["绑定没出现在下拉里", "只有「试跑通过（verified=run）」的绑定才进下拉。去「工作流」点「试跑」，通过后 5 秒内自动出现。"],
  					].map(([q, a]) => h("div", { key: q, className: "ccv-faqitem" },
  						h("div", { className: "ccv-faqq" }, q),
  						h("div", { className: "ccv-faqa" }, a))))
  				: null),
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
  				h("span", { className: "ccv-set-val" }, diag && diag.disk ? `剩余 ${diag.disk.freeGB} GB` : "—")),
  			h("div", { className: "ccv-set-row" },
  				h("span", { className: "ccv-set-label" }, "最近备份"),
  				h("span", { className: "ccv-set-val" },
  					current ? (backups.length ? `${backups.length} 份（最新 ${backups[0].date}）` : "暂无（保存后自动生成）") : "先在画布里打开一个项目")),
  			backups.length && current
  				? h("div", { className: "ccv-baklist" },
  					backups.slice(0, 5).map((b) => h("div", { key: b.date, className: "ccv-bakrow" },
  						h("span", { className: "ccv-bakdate" }, b.date),
  						h("span", { className: "ccv-bakui" }, `${Math.round(b.bytes / 1024)} KB`),
  						h("span", { style: { flex: 1 } }),
  						h("button", {
  							className: "ccv-qbtn" + (restoreArm === b.date ? " on" : ""),
  							onClick: async () => {
  								if (restoreArm !== b.date) { setRestoreArm(b.date); return; }
  								try {
  									const r = await api("backup.restore", { projectId: current.id, date: b.date });
  									if (r.error) throw new Error(r.error);
  									setRestoreArm(null);
  									showToast(`已恢复 ${b.date} 快照`);
  									const c = await api("canvas.get", { id: current.id });
  									setNodes(c.canvas.nodes || []); setEdges(c.canvas.edges || []);
  								} catch (e) { setError(String(e.message || e)); }
  							},
  						}, restoreArm === b.date ? "确认恢复？" : "恢复")))
  				)
  				: null),
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
  										className: "ccv-voice-name",
  										value: (d.voice && d.voice.name) || d.title || "",
  										placeholder: "角色名（用于 <Audio N> 指认）",
  										onChange: (e) => {
  											const v = e.target.value;
  											setNodes((ns) => ns.map((x) => x.id === n.id
  												? { ...x, data: { ...x.data, voice: { ...(x.data && x.data.voice), name: v } } }
  												: x));
  										},
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
  						src: `/omni-canvas/media/${current?.id}/${preview.file}`,
  						controls: true, autoPlay: true, loop: true, className: "ccv-lb-media",
  					})
  					: h("img", { src: `/omni-canvas/media/${current?.id}/${preview.file}`, className: "ccv-lb-media" }),
  				h("button", { className: "ccv-lb-close", onClick: () => setPreview(null) }, "✕"),
  			),
  		) : null,
  	);
  }

  return CanvasApp;
};
