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
.ccv-asset-shot{position:absolute;right:6px;top:6px;max-width:58%;font-size:9.5px;color:#e6e6ec;background:rgba(10,12,16,.72);border-radius:4px;padding:1px 5px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;z-index:3}
.ccv-asset-fav{position:absolute;left:6px;bottom:6px;color:#e8c98a;font-size:12px;z-index:2}
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
.ccv-assets-resizer{position:absolute;right:0;top:0;bottom:0;width:6px;cursor:col-resize;
  background:transparent;z-index:5}
.ccv-assets-resizer:hover{background:rgba(77,124,254,.45)}

.ccv-chip.fav{border-color:#4a3a1c;color:#e8c98a}
.ccv-chip.fav.on{background:#3a2f16;border-color:#e8c98a;color:#ffe2a8;font-weight:600}
.ccv-chip.fav:hover{border-color:#e8c98a}
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
