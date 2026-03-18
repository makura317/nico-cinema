(function () {
  "use strict";

  const COMMENT_W  = 360;
  const INIT_DELAY = 1500;

  let active         = false;
  let commentVisible = true;

  let playerEl      = null, playerSaved      = null;
  let commentEl     = null, commentSaved     = null;
  let overlayEl     = null, overlaySaved     = null;
  let theaterEl     = null;
  let modifiedEls   = [];

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
          console.log("[NicoTheater] player (controls found):", el.className.slice(0, 80));
          return el;
        }
      }
      el = el.parentElement;
    }

    el = video.parentElement;
    for (let i = 0; i < 12 && el && el !== document.body; i++) {
      const r = el.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.35 && r.height >= 120) {
        console.log("[NicoTheater] player (size):", el.className.slice(0, 80));
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
      console.log("[NicoTheater] 弾幕オーバーレイはプレイヤー内に内包済み");
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
        console.log("[NicoTheater] 弾幕オーバーレイ発見:", sib.className.slice(0, 80));
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
            console.log("[NicoTheater] comment (selector):", el.className.slice(0, 60));
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
    if (best) console.log("[NicoTheater] comment (fallback):", best.className.slice(0, 60));
    return best;
  }

  // ─── applyVideoFill ──────────────────────────────────────────
  // video から playerEl まで遡り、純粋なラッパー要素だけ 100% に拡張

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

    // 中間要素をチェックしながら遡る
    let el = video.parentElement;
    while (el && el !== player) {
      // 表示中の子要素の数をカウント
      const visibleKids = Array.from(el.children).filter(c => {
        const s = getComputedStyle(c);
        return s.display !== "none" && s.visibility !== "hidden"
               && (c.offsetHeight > 0 || c.offsetWidth > 0);
      });
      // 子が1つ以下（純粋なラッパー）なら安全に拡張
      if (visibleKids.length <= 1) {
        modifiedEls.push({ el, cssText: el.style.cssText });
        el.style.setProperty("width",      "100%", "important");
        el.style.setProperty("height",     "100%", "important");
        el.style.setProperty("max-width",  "none", "important");
        el.style.setProperty("max-height", "none", "important");
      }
      el = el.parentElement;
    }
  }

  // ─── enter / exit ────────────────────────────────────────────

  function enter() {
    playerEl = findPlayer();
    if (!playerEl) {
      alert("[NicoTheater] プレイヤーが見つかりません。\n配信ページを開いてから再試行してください。");
      return false;
    }

    overlayEl = findFloatingOverlay(playerEl);
    commentEl = findComment(playerEl);

    theaterEl = document.createElement("div");
    theaterEl.id = "nico-theater-root";

    const pSlot = document.createElement("div");
    pSlot.id = "nico-theater-pslot";

    const cSlot = document.createElement("div");
    cSlot.id = "nico-theater-cslot";
    if (!commentEl) cSlot.style.display = "none";

    theaterEl.append(pSlot, cSlot);
    document.body.appendChild(theaterEl);
    addToggleBtn(!!commentEl);

    // ── プレイヤー移動 ──
    playerSaved = detach(playerEl, pSlot);
    playerEl.style.setProperty("width",      "100%", "important");
    playerEl.style.setProperty("height",     "100%", "important");
    playerEl.style.setProperty("max-width",  "none", "important");
    playerEl.style.setProperty("max-height", "none", "important");
    playerEl.style.setProperty("margin",     "0",    "important");

    applyVideoFill(playerEl);

    // ── 弾幕オーバーレイ移動（外側にあった場合）──
    if (overlayEl) {
      overlaySaved = detach(overlayEl, pSlot);
      overlayEl.style.setProperty("position",       "absolute", "important");
      overlayEl.style.setProperty("inset",          "0",        "important");
      overlayEl.style.setProperty("width",          "100%",     "important");
      overlayEl.style.setProperty("height",         "100%",     "important");
      overlayEl.style.setProperty("pointer-events", "none",     "important");
      overlayEl.style.setProperty("z-index",        "5",        "important");
    }

    // ── コメント移動 ──
    if (commentEl) {
      commentSaved = detach(commentEl, cSlot);
      commentEl.style.setProperty("width",      "100%", "important");
      commentEl.style.setProperty("height",     "100%", "important");
      commentEl.style.setProperty("max-height", "none", "important");
      commentEl.style.setProperty("overflow-y", "auto", "important");
    }

    commentVisible = true;
    document.body.classList.add("nico-theater-on");
    updateCommentToggleBtn();
    updateMainBtn(true);

    setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
    return true;
  }

  function exit() {
    modifiedEls.forEach(({ el, cssText }) => { el.style.cssText = cssText; });
    modifiedEls = [];
    reattach(playerEl,  playerSaved);
    reattach(overlayEl, overlaySaved);
    reattach(commentEl, commentSaved);

    theaterEl?.remove();
    theaterEl = playerEl = commentEl = overlayEl = null;
    playerSaved = commentSaved = overlaySaved = null;

    document.getElementById("nico-theater-ctoggle")?.remove();
    document.body.classList.remove("nico-theater-on");
    updateMainBtn(false);

    setTimeout(() => window.dispatchEvent(new Event("resize")), 200);
  }

  // ─── DOM ユーティリティ ──────────────────────────────────────

  function detach(el, slot) {
    const saved = { parent: el.parentNode, next: el.nextSibling, cssText: el.style.cssText };
    slot.appendChild(el);
    return saved;
  }

  function reattach(el, saved) {
    if (!el || !saved) return;
    el.style.cssText = saved.cssText;
    try {
      if (saved.next && saved.parent.contains(saved.next)) {
        saved.parent.insertBefore(el, saved.next);
      } else {
        saved.parent.appendChild(el);
      }
    } catch (_) {}
  }

  // ─── コメント開閉 ────────────────────────────────────────────

  function addToggleBtn(hasComment) {
    const btn = document.createElement("button");
    btn.id = "nico-theater-ctoggle";
    btn.innerHTML = `<span class="nct-arrow">◀</span><span class="nct-label">コメント</span>`;
    if (!hasComment) btn.style.display = "none";
    btn.addEventListener("click", toggleComment);
    theaterEl.appendChild(btn);
  }

  function toggleComment() {
    if (!theaterEl) return;
    commentVisible = !commentVisible;
    const cSlot = theaterEl.querySelector("#nico-theater-cslot");
    if (cSlot) cSlot.style.display = commentVisible ? "" : "none";
    theaterEl.style.setProperty("--cw", commentVisible ? `${COMMENT_W}px` : "0px");
    updateCommentToggleBtn();
    setTimeout(() => window.dispatchEvent(new Event("resize")), 50);
  }

  function updateCommentToggleBtn() {
    const btn = document.getElementById("nico-theater-ctoggle");
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
    if (document.getElementById("nico-theater-btn")) return;
    const btn = document.createElement("button");
    btn.id = "nico-theater-btn";
    btn.title = "シアターモード (T)";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8"/><path d="M12 17v4"/>
      </svg>`;
    btn.addEventListener("click", toggleTheater);
    document.body.appendChild(btn);
  }

  function updateMainBtn(on) {
    const btn = document.getElementById("nico-theater-btn");
    if (!btn) return;
    btn.classList.toggle("active", on);
    btn.title = on ? "シアターモード終了 (T)" : "シアターモード (T)";
  }

  function toggleTheater() {
    active = !active;
    if (active) { if (!enter()) active = false; }
    else exit();
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
      if (e.key === "t" && !e.ctrlKey && !e.altKey && !e.metaKey) toggleTheater();
      if (e.key === "c" && !e.ctrlKey && !e.altKey && !e.metaKey && active) toggleComment();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(init, INIT_DELAY));
  } else {
    setTimeout(init, INIT_DELAY);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggle") toggleTheater();
  });
})();
