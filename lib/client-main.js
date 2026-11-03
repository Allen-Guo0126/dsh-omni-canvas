/* FRAGMENT: 本文件是工厂体片段（含 return），不能单独 node --check。
   由 scripts/bundle-client.mjs 与 lib/client-src/*.js 一起内联成 lib/client.js。 */
		const react = require("react");
		const h = react.createElement;
		const { useState, useEffect, useRef, useCallback } = react;

		const { T, css, useCss } = __sub["./styles.js"];
		const inject = ["slots"];
		const { CLIENT_LOADED_AT, report, MODELS, ASPECTS, COUNTS, RESOLUTIONS, cardSize, makeAudioNode, makeTextNode, SCRIPT_COLUMNS, SCRIPT_W, ROLE_LABEL, nextRole, assetName, assetDesc, inferRole, makeScriptNode, composeRowPrompt, SKELETON } = __sub["./helpers.js"];

		// 设计令牌见 docs/前端样式规范.md —— 中性黑灰，不许带蓝





		const CanvasApp = __sub["./canvas-app.js"]({ h, react, useState, useEffect, useRef, useCallback, MODELS, ASPECTS, COUNTS, RESOLUTIONS, cardSize, makeAudioNode, makeTextNode, SCRIPT_COLUMNS, SCRIPT_W, assetName, assetDesc, inferRole, makeScriptNode, composeRowPrompt, T, useCss, CLIENT_LOADED_AT });
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