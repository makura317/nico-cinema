(function () {
  "use strict";

  const COMMENT_W  = 360;
  const INIT_DELAY = 1500;

  let active         = false;
  let commentVisible = true;

  let playerEl   = null, playerSaved   = null;
  let commentEl  = null, commentSaved  = null;
  let overlayEl  = null, overlaySaved  = null;
  let modifiedEls    = [];
  let controlsInterval = null;
  let controlsObs      = null;

  // ─── findPlayer ────────────────────────────────────────────

  function findPlayer() {
    const video = document.querySelector("video");
    if (!video) return null;

    let el = video.parentElement;
    for (let i = 0; i < 16 && el && el !== document.body; i++) {
      const r = el.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.3) {
        const hasControls = el.querySelector(
          'input[type="range"],'       +
          '[class*="Seekbar"],'        +
          '[class*="seekbar"],'        +
          '[class*="SeekBar"],'        +
          '[class*="seek-bar"],'       +
          '[class*="ProgressBar"],'    +
          '[class*="progressBar"],'    +
          '[class*="progress-bar"],'   +
          '[class*="PlayerControl"],'  +
          '[class*="playerControl"],'  +
          '[class*="player-control"],' +
          '[class*="Controls"],'       +
          '[class*="controls"]'
        );
        if (hasControls) {
  
          return el;
        }
      }
      el = el.parentElement;
    }

    el = video.parentElement;
    for (let i = 0; i < 12 && el && el !== document.body; i++) {
      const r = el.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.35 && r.height >= 120) {

        return el;
      }
      el = el.parentElement;
    }
    return video.parentElement;
  }

  // ─── findFloatingOverlay ────────────────────────────────────

  function findFloatingOverlay(player) {
    if (player.querySelector(
      'canvas, [class*="danmaku" i], [class*="NiconicoPlayer__comment" i], [class*="comment-layer" i], [class*="commentLayer" i]'
    )) {

      return null;
    }

    const parent = player.parentElement;
    if (!parent) return null;
    const pr = player.getBoundingClientRect();

    for (const sib of parent.children) {
      if (sib === player || !sib.offsetParent) continue;
      const sr = sib.getBoundingClientRect();
      const s  = getComputedStyle(sib);
      const overlapping =
        Math.abs(sr.left - pr.left) < 80 &&
        Math.abs(sr.top  - pr.top)  < 80 &&
        sr.width > 100 && sr.height > 100;
      if (overlapping && (
        s.pointerEvents === "none" ||
        sib.querySelector("canvas") ||
        /danmaku|overlay|comment.?layer|float/i.test(sib.className)
      )) {

        return sib;
      }
    }
    return null;
  }

  // ─── findComment ────────────────────────────────────────────

  function findComment(player) {
    const sels = [
      '[class*="CommentSection"]', '[class*="comment_section"]',
      '[class*="CommentList"]',    '[class*="comment_list"]',
      '[class*="CommentArea"]',    '[class*="comment_area"]',
      '[class*="ChatSection"]',    '[class*="chat_section"]',
      '[class*="ChatList"]',       '[class*="chat_list"]',
      '[class*="ChatArea"]',       '[class*="chat_area"]',
      '[class*="Comment"]',
    ];
    for (const sel of sels) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          if (!el.offsetParent) continue;
          if (el === player || player.contains(el) || el.contains(player)) continue;
          const r = el.getBoundingClientRect();
          if (r.height > 100 && r.width > 60) {

            return el;
          }
        }
      } catch (_) {}
    }

    const pr = player.getBoundingClientRect();
    let best = null, bestArea = 0;
    for (const el of document.querySelectorAll("div, section, ul, ol")) {
      if (player.contains(el) || el.contains(player) || !el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.top < pr.bottom - 20) continue;
      const area = r.width * r.height;
      if (area > bestArea && r.height > 100) { bestArea = area; best = el; }
    }

    return best;
  }

  // ─── applyVideoFill ──────────────────────────────────────────
  // video → playerEl を遡り、ラッパー要素を absolute+inset:0 で引き伸ばす
  // ボタンを含む要素（コントロール付き）は position 変更せず padding のみクリア

  function applyVideoFill(player) {
    const video = player.querySelector("video");
    if (!video) return;

    // video 自体を強制拡張
    const savedVideo = video.style.cssText;
    video.style.setProperty("width",           "100%",    "important");
    video.style.setProperty("height",          "100%",    "important");
    video.style.setProperty("object-fit",      "contain", "important");
    video.style.setProperty("object-position", "center",  "important");
    video.style.setProperty("background",      "#000",    "important");
    modifiedEls.push({ el: video, cssText: savedVideo });

    // 中間ラッパーを遡って拡張
    let el = video.parentElement;
    while (el && el !== player) {
      modifiedEls.push({ el, cssText: el.style.cssText });
      // ボタンを含まない純粋なラッパー → absolute + inset:0 で playerEl 全体に貼り付け
      if (el.querySelectorAll("button").length === 0) {
        el.style.setProperty("position",   "absolute", "important");
        el.style.setProperty("inset",      "0",        "important");
      }
      // 共通: padding の aspect-ratio ハックをクリア、サイズを 100% に
      el.style.setProperty("padding",    "0",    "important");
      el.style.setProperty("width",      "100%", "important");
      el.style.setProperty("height",     "100%", "important");
      el.style.setProperty("max-width",  "none", "important");
      el.style.setProperty("max-height", "none", "important");
      el = el.parentElement;
    }
  }

  // ─── fixAncestorStacking ─────────────────────────────────────
  // playerEl の祖先でスタッキングコンテキストを作っている要素の z-index を引き上げ
  // ※ transform を持つ祖先は position:fixed の基準になるため transform を除去

  function fixAncestorStacking(el) {
    let cur = el.parentElement;
    while (cur && cur !== document.documentElement) {
      const s = getComputedStyle(cur);
      const hasTransform = s.transform && s.transform !== "none";
      const createsContext =
        (s.position !== "static" && s.zIndex !== "auto") ||
        hasTransform ||
        (s.filter && s.filter !== "none") ||
        s.isolation === "isolate" ||
        parseFloat(s.opacity) < 1;
      if (createsContext) {
        if (!modifiedEls.find(m => m.el === cur)) {
          modifiedEls.push({ el: cur, cssText: cur.style.cssText });
        }
        // transform があると position:fixed が viewport 基準にならないので除去
        if (hasTransform) {
          cur.style.setProperty("transform", "none", "important");
        }
        cur.style.setProperty("z-index",  "99998",   "important");
        cur.style.setProperty("position", "relative", "important");

      }
      cur = cur.parentElement;
    }
  }

  // ─── findCtrlBar ─────────────────────────────────────────────
  // インタラクティブなコントロールバーを返す

  function findCtrlBar(player) {
    const pr = player.getBoundingClientRect();
    if (pr.width === 0) return null;
    const btns = Array.from(player.querySelectorAll("button"));
    if (btns.length < 2) return null;

    let best = null, bestScore = 0;
    const seen = new Set();
    for (const btn of btns) {
      let el = btn.parentElement;
      while (el && el !== player) {
        if (!seen.has(el)) {
          seen.add(el);
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          if (
            s.pointerEvents !== "none" &&
            r.width  > pr.width  * 0.35 &&
            r.height > 0 && r.height < pr.height * 0.45
          ) {
            const score = el.querySelectorAll("button").length;
            if (score > bestScore) { bestScore = score; best = el; }
          }
        }
        el = el.parentElement;
      }
    }
    return best;
  }

  // ─── placeMainBtnInCtrlBar ───────────────────────────────────
  // メインボタンをコントロールバー内に配置（既に配置済みなら何もしない）

  function placeMainBtnInCtrlBar(bar) {
    const btn = document.getElementById("nico-cinema-btn");
    if (!btn || btn.parentNode === bar) return;
    bar.appendChild(btn);
    btn.style.setProperty("position",        "relative",              "important");
    btn.style.setProperty("top",             "auto",                  "important");
    btn.style.setProperty("bottom",          "auto",                  "important");
    btn.style.setProperty("left",            "auto",                  "important");
    btn.style.setProperty("right",           "auto",                  "important");
    btn.style.setProperty("align-self",      "stretch",               "important");
    btn.style.setProperty("width",           "auto",                  "important");
    btn.style.setProperty("height",          "auto",                  "important");
    btn.style.setProperty("padding",         "0 8px",                 "important");
    btn.style.setProperty("margin",          "0",                     "important");
    btn.style.setProperty("border-radius",   "0",                     "important");
    btn.style.setProperty("border",          "none",                  "important");
    btn.style.setProperty("background",      "transparent",           "important");
    btn.style.setProperty("color",           "rgba(255,255,255,0.9)", "important");
    btn.style.setProperty("cursor",          "pointer",               "important");
    btn.style.setProperty("opacity",         "1",                     "important");
    btn.style.setProperty("display",         "inline-flex",           "important");
    btn.style.setProperty("align-items",     "center",                "important");
    btn.style.setProperty("justify-content", "center",                "important");
    btn.style.setProperty("flex-shrink",     "0",                     "important");
    btn.style.setProperty("box-shadow",      "none",                  "important");
    const svg = btn.querySelector("svg");
    if (svg) {
      svg.style.setProperty("width",  "20px", "important");
      svg.style.setProperty("height", "20px", "important");
    }
    // ネイティブ title を除去して独自ツールチップに置き換え
    btn.removeAttribute("title");
    btn.addEventListener("mouseenter", showCinemaTooltip);
    btn.addEventListener("mouseleave", hideCinemaTooltip);

  }

  // ─── ツールチップ ────────────────────────────────────────────

  function showCinemaTooltip(e) {
    let tip = document.getElementById("nico-cinema-tooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "nico-cinema-tooltip";
      document.body.appendChild(tip);
    }
    tip.textContent = active ? "シネマモード終了 (T)" : "シネマモード (T)";
    const r = e.currentTarget.getBoundingClientRect();
    tip.style.setProperty("left",    `${r.left + r.width / 2}px`, "important");
    tip.style.setProperty("top",     `${r.top}px`,                "important");
    tip.style.setProperty("display", "block",                     "important");
  }

  function hideCinemaTooltip() {
    const tip = document.getElementById("nico-cinema-tooltip");
    if (tip) tip.style.setProperty("display", "none", "important");
  }

  // ─── keepControlsVisible ─────────────────────────────────────
  // 本物のインタラクティブ制御バーをCSS強制 + MutationObserver で維持

  function keepControlsVisible(player) {
    const applyForce = (bar) => {
      // 制御バーから playerEl まで遡り、非表示の祖先も強制表示
      let el = bar;
      while (el && el !== player) {
        const s = getComputedStyle(el);
        if (parseFloat(s.opacity) < 0.9 || s.visibility === "hidden") {
          if (!modifiedEls.find(m => m.el === el)) {
            modifiedEls.push({ el, cssText: el.style.cssText });
          }
          el.style.setProperty("opacity",    "1",       "important");
          el.style.setProperty("visibility", "visible", "important");
        }
        el = el.parentElement;
      }
      if (!modifiedEls.find(m => m.el === bar)) {
        modifiedEls.push({ el: bar, cssText: bar.style.cssText });
      }
      bar.style.setProperty("opacity",    "1",       "important");
      bar.style.setProperty("visibility", "visible", "important");
      controlsEl = bar;

      placeMainBtnInCtrlBar(bar);

      if (controlsObs) controlsObs.disconnect();
      controlsObs = new MutationObserver(() => {
        if (bar.style.opacity !== "1")
          bar.style.setProperty("opacity",    "1",       "important");
        if (bar.style.visibility !== "visible")
          bar.style.setProperty("visibility", "visible", "important");
      });
      controlsObs.observe(bar, { attributes: true, attributeFilter: ["style"] });
    };

    const tryFind = () => {
      const bar = findCtrlBar(player);
      if (bar) { applyForce(bar); return true; }
      return false;
    };

    setTimeout(() => { if (!tryFind()) setTimeout(tryFind, 1500); }, 500);

    // mousemove も補助的に
    const tryMove = () => {
      const r = player.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        player.dispatchEvent(new MouseEvent("mousemove", {
          bubbles: true, cancelable: true, view: window,
          clientX: r.left + r.width  / 2,
          clientY: r.top  + r.height - 40,
        }));
      }
    };
    controlsInterval = setInterval(tryMove, 1500);
    setTimeout(tryMove, 400);
  }

  // ─── enter / exit ────────────────────────────────────────────

  function enter() {
    playerEl = findPlayer();
    if (!playerEl) {
      alert("[NicoCinema] プレイヤーが見つかりません。\n配信ページを開いてから再試行してください。");
      return false;
    }

    overlayEl = findFloatingOverlay(playerEl);
    commentEl = findComment(playerEl);

    // ── スタッキングコンテキスト修正（DOM移動なし・position:fixed 用） ──
    fixAncestorStacking(playerEl);

    // ── プレイヤー: DOM移動なし、position:fixed で全画面化 ──
    playerSaved = playerEl.style.cssText;
    playerEl.style.setProperty("position",   "fixed",          "important");
    playerEl.style.setProperty("top",        "0",              "important");
    playerEl.style.setProperty("left",       "0",              "important");
    playerEl.style.setProperty("right",      `${COMMENT_W}px`, "important");
    playerEl.style.setProperty("bottom",     "0",              "important");
    playerEl.style.setProperty("z-index",    "99999",          "important");
    playerEl.style.setProperty("width",      "auto",           "important");
    playerEl.style.setProperty("height",     "auto",           "important");
    playerEl.style.setProperty("max-width",  "none",           "important");
    playerEl.style.setProperty("max-height", "none",           "important");
    playerEl.style.setProperty("margin",     "0",              "important");
    playerEl.style.setProperty("padding",    "0",              "important");
    playerEl.style.setProperty("background", "#000",           "important");

    applyVideoFill(playerEl);
    keepControlsVisible(playerEl);

    // ── 弾幕オーバーレイ ──
    if (overlayEl) {
      overlaySaved = overlayEl.style.cssText;
      overlayEl.style.setProperty("position",       "fixed",          "important");
      overlayEl.style.setProperty("top",            "0",              "important");
      overlayEl.style.setProperty("left",           "0",              "important");
      overlayEl.style.setProperty("right",          `${COMMENT_W}px`, "important");
      overlayEl.style.setProperty("bottom",         "0",              "important");
      overlayEl.style.setProperty("z-index",        "100000",         "important");
      overlayEl.style.setProperty("pointer-events", "none",           "important");
    }

    // ── コメント ──
    addToggleBtn(!!commentEl);
    if (commentEl) {
      commentSaved = commentEl.style.cssText;
      commentEl.style.setProperty("position",   "fixed",          "important");
      commentEl.style.setProperty("top",        "0",              "important");
      commentEl.style.setProperty("right",      "0",              "important");
      commentEl.style.setProperty("bottom",     "0",              "important");
      commentEl.style.setProperty("left",       "auto",           "important");
      commentEl.style.setProperty("width",      `${COMMENT_W}px`, "important");
      commentEl.style.setProperty("height",     "100%",           "important");
      commentEl.style.setProperty("max-height", "none",           "important");
      commentEl.style.setProperty("transform",  "none",           "important");
      commentEl.style.setProperty("z-index",    "99999",          "important");
    }

    commentVisible = true;
    document.body.classList.add("nico-cinema-on");
    updateCommentToggleBtn();
    updateMainBtn(true);

    setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
    return true;
  }

  function exit() {
    if (controlsInterval) { clearInterval(controlsInterval); controlsInterval = null; }
    if (controlsObs)      { controlsObs.disconnect();        controlsObs      = null; }

    modifiedEls.forEach(({ el, cssText }) => { el.style.cssText = cssText; });
    modifiedEls = [];

    if (playerEl)                           playerEl.style.cssText  = playerSaved  ?? "";
    if (commentEl  && commentSaved  != null) commentEl.style.cssText  = commentSaved;
    if (overlayEl  && overlaySaved  != null) overlayEl.style.cssText  = overlaySaved;

    playerEl  = commentEl  = overlayEl  = null;
    playerSaved = commentSaved = overlaySaved = null;

    document.getElementById("nico-cinema-ctoggle")?.remove();
    document.getElementById("nico-cinema-tooltip")?.remove();
    document.body.classList.remove("nico-cinema-on");
    updateMainBtn(false);

    setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
  }

  // ─── コメント開閉 ────────────────────────────────────────────

  function addToggleBtn(hasComment) {
    const btn = document.createElement("button");
    btn.id = "nico-cinema-ctoggle";
    btn.innerHTML = `<span class="nct-arrow">◀</span><span class="nct-label">コメント</span>`;
    if (!hasComment) btn.style.display = "none";
    btn.style.right = `${COMMENT_W}px`;
    btn.addEventListener("click", toggleComment);
    document.body.appendChild(btn);
  }

  function toggleComment() {
    if (!active) return;
    commentVisible = !commentVisible;
    const rightVal = commentVisible ? `${COMMENT_W}px` : "0";
    if (playerEl)  playerEl.style.setProperty("right",  rightVal, "important");
    if (overlayEl) overlayEl.style.setProperty("right", rightVal, "important");
    if (commentEl) {
      if (commentVisible) {
        commentEl.style.removeProperty("display");
      } else {
        commentEl.style.setProperty("display", "none", "important");
      }
    }
    const ctoggle = document.getElementById("nico-cinema-ctoggle");
    if (ctoggle) ctoggle.style.right = rightVal;
    updateCommentToggleBtn();
    setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  }

  function updateCommentToggleBtn() {
    const btn = document.getElementById("nico-cinema-ctoggle");
    if (!btn) return;
    const arrow = btn.querySelector(".nct-arrow");
    if (commentVisible) {
      arrow.textContent = "◀";
      btn.title = "コメントを閉じる (C)";
      btn.classList.remove("closed");
    } else {
      arrow.textContent = "▶";
      btn.title = "コメントを開く (C)";
      btn.classList.add("closed");
    }
  }

  // ─── メインボタン ────────────────────────────────────────────

  function createMainBtn() {
    if (document.getElementById("nico-cinema-btn")) return;
    const btn = document.createElement("button");
    btn.id = "nico-cinema-btn";
    btn.title = "シネマモード (T)";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8"/><path d="M12 17v4"/>
      </svg>`;
    btn.addEventListener("click", toggleCinema);
    document.body.appendChild(btn);

    // OFF状態でもコントロールバーに配置（非同期リトライ）
    const tryPlace = () => {
      const player = findPlayer();
      if (!player) return false;
      const bar = findCtrlBar(player);
      if (!bar) return false;
      placeMainBtnInCtrlBar(bar);
      return true;
    };
    setTimeout(() => { if (!tryPlace()) setTimeout(() => { if (!tryPlace()) setTimeout(tryPlace, 2000); }, 1000); }, 800);
  }

  function updateMainBtn(on) {
    const btn = document.getElementById("nico-cinema-btn");
    if (!btn) return;
    btn.classList.toggle("active", on);
    btn.title = on ? "シネマモード終了 (T)" : "シネマモード (T)";
  }

  function toggleCinema() {
    active = !active;
    if (active) { if (!enter()) active = false; }
    else exit();
    chrome.runtime.sendMessage({ action: "cinemaBadge", on: active });
  }

  // ─── 初期化 ──────────────────────────────────────────────────

  function init() {
    if (document.querySelector("video")) {
      createMainBtn();
    } else {
      const obs = new MutationObserver(() => {
        if (document.querySelector("video")) { obs.disconnect(); createMainBtn(); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }

    document.addEventListener("keydown", (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "t" && !e.ctrlKey && !e.altKey && !e.metaKey) toggleCinema();
      if (e.key === "c" && !e.ctrlKey && !e.altKey && !e.metaKey && active) toggleComment();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, INIT_DELAY));
  } else {
    setTimeout(init, INIT_DELAY);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggle") toggleCinema();
  });
})();
