function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

const CW_KEY = "ps_continue_v1";
const POS_KEY = (bookId) => `ps_pos_${bookId}_v1`;

function readJSON(k, fallback) {
  try { return JSON.parse(localStorage.getItem(k) || JSON.stringify(fallback)); }
  catch { return fallback; }
}
function writeJSON(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

function upsertContinue(item) {
  const list = readJSON(CW_KEY, []);
  const idx = list.findIndex(x => x.bookId === item.bookId);
  if (idx >= 0) list.splice(idx, 1);
  list.unshift(item);
  writeJSON(CW_KEY, list.slice(0, 18));
}

function markWatchedUI(watchedSet) {
  document.querySelectorAll(".ep").forEach(btn => {
    const idx = Number(btn.getAttribute("data-idx"));
    if (watchedSet.has(idx)) btn.classList.add("watched");
    else btn.classList.remove("watched");
  });
}

window.PS_PLAYER_INIT = function () {
  const boot = window.__PLAYER_BOOT || {};
  const bookId = boot.bookId;
  if (!bookId) return;

  const video = document.getElementById("video");
  const wm = document.getElementById("wm");

  const btnPlay = document.getElementById("btnPlay");
  const bigPlay = document.getElementById("bigPlay");
  const posterInfo = document.getElementById("posterInfo");

  const btnMute = document.getElementById("btnMute");
  const vol = document.getElementById("vol");

  const btnFs = document.getElementById("btnFs");
  const btnPip = document.getElementById("btnPip");
  const btnTheater = document.getElementById("btnTheater");

  const cur = document.getElementById("cur");
  const dur = document.getElementById("dur");
  const seek = document.getElementById("seek");

  const btnQuality = document.getElementById("btnQuality");
  const qMenu = document.getElementById("qMenu");
  const qLabel = document.getElementById("qLabel");

  const resumePrompt = document.getElementById("resumePrompt");
  const resumeText = document.getElementById("resumeText");
  const btnResume = document.getElementById("btnResume");
  const btnRestart = document.getElementById("btnRestart");

  const upNext = document.getElementById("upNext");
  const upNextText = document.getElementById("upNextText");
  const btnPlayNext = document.getElementById("btnPlayNext");
  const btnCancelNext = document.getElementById("btnCancelNext");

  let isSeeking = false;
  let lastVolume = 0.8;
  let theater = false;

  // Qualities
  const qualities = Array.isArray(boot.qualities) ? boot.qualities : [];
  qualities.sort((a, b) => (b.quality || 0) - (a.quality || 0));

  function setQualityLabel(q) { qLabel.textContent = q ? `${q.quality}p` : "Auto"; }

  function buildQualityMenu() {
    qMenu.innerHTML = "";
    if (!qualities.length) {
      const div = document.createElement("div");
      div.className = "qitem disabled";
      div.textContent = "No quality list";
      qMenu.appendChild(div);
      return;
    }
    qualities.forEach((q) => {
      const item = document.createElement("button");
      item.className = "qitem";
      item.textContent = `${q.quality}p${q.isVipEquity ? " (VIP)" : ""}`;
      item.addEventListener("click", () => {
        const t = video.currentTime || 0;
        const wasPlaying = !video.paused;

        video.src = q.videoPath;
        setQualityLabel(q);

        video.addEventListener("loadedmetadata", function once() {
          video.removeEventListener("loadedmetadata", once);
          video.currentTime = clamp(t, 0, video.duration || t);
          if (wasPlaying) video.play().catch(()=>{});
        });
        qMenu.classList.add("hidden");
      });
      qMenu.appendChild(item);
    });
  }
  buildQualityMenu();
  setQualityLabel(boot.defaultQuality || null);

  // Episode list
  const epButtons = Array.from(document.querySelectorAll(".ep"));
  function getEpisodeSrc(i) {
    const btn = epButtons[i];
    return btn ? btn.getAttribute("data-src") : "";
  }
  function highlightEpisode(i) {
    epButtons.forEach((b, idx) => b.style.outline = (idx === i ? "1px solid rgba(255,255,255,.18)" : "none"));
  }

  const posData = readJSON(POS_KEY(bookId), { episodeIndex: 0, time: 0, duration: 0, watched: [] });
  const watchedSet = new Set(posData.watched || []);
  markWatchedUI(watchedSet);

  let currentEpisode = clamp(posData.episodeIndex || 0, 0, Math.max(0, epButtons.length - 1));
  let initialSrc = getEpisodeSrc(currentEpisode) || boot.defaultQuality?.videoPath || boot.defaultSrc || "";
  if (initialSrc) video.src = initialSrc;
  highlightEpisode(currentEpisode);

  // Resume prompt
  if ((posData.time || 0) > 10) {
    resumeText.textContent = `Episode ${currentEpisode + 1} • Resume di ${fmtTime(posData.time)}.`;
    resumePrompt.classList.remove("hidden");
  }

  function updatePlayIcon() {
    const i = btnPlay.querySelector("i");
    if (!i) return;
    i.className = video.paused ? "ri-play-fill" : "ri-pause-fill";
  }
  function togglePlay() { video.paused ? video.play().catch(()=>{}) : video.pause(); }

  btnPlay.addEventListener("click", togglePlay);
  bigPlay?.addEventListener("click", togglePlay);
  video.addEventListener("click", togglePlay);

  video.addEventListener("play", () => {
    updatePlayIcon();
    posterInfo?.classList.add("hidden");
    resumePrompt?.classList.add("hidden");
  });
  video.addEventListener("pause", updatePlayIcon);

  btnResume?.addEventListener("click", () => {
    resumePrompt.classList.add("hidden");
    video.play().catch(()=>{});
    video.addEventListener("loadedmetadata", function once(){
      video.removeEventListener("loadedmetadata", once);
      video.currentTime = clamp(posData.time || 0, 0, video.duration || (posData.time || 0));
    });
  });
  btnRestart?.addEventListener("click", () => {
    resumePrompt.classList.add("hidden");
    const saved = readJSON(POS_KEY(bookId), posData);
    saved.time = 0;
    writeJSON(POS_KEY(bookId), saved);
    video.currentTime = 0;
    video.play().catch(()=>{});
  });

  // Seek/time
  video.addEventListener("loadedmetadata", () => {
    dur.textContent = fmtTime(video.duration);
  });

  video.addEventListener("timeupdate", () => {
    if (!isSeeking) {
      const p = (video.currentTime / (video.duration || 1)) * 1000;
      seek.value = String(Math.floor(p));
    }
    cur.textContent = fmtTime(video.currentTime);
  });

  seek.addEventListener("input", () => { isSeeking = true; });
  seek.addEventListener("change", () => {
    const p = Number(seek.value) / 1000;
    video.currentTime = p * (video.duration || 0);
    isSeeking = false;
  });

  // Volume
  video.volume = 0.8;
  vol.value = "80";
  function updateVolIcon() {
    const i = btnMute.querySelector("i");
    if (!i) return;
    if (video.muted || video.volume === 0) i.className = "ri-volume-mute-line";
    else if (video.volume < 0.5) i.className = "ri-volume-down-line";
    else i.className = "ri-volume-up-line";
  }
  vol.addEventListener("input", () => {
    const v = Number(vol.value) / 100;
    video.volume = v; video.muted = false; lastVolume = v;
    updateVolIcon();
  });
  btnMute.addEventListener("click", () => {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      video.volume = lastVolume || 0.8;
      vol.value = String(Math.round(video.volume * 100));
    } else {
      video.muted = true;
      vol.value = "0";
    }
    updateVolIcon();
  });
  updateVolIcon();

  // FS / PiP
  btnFs.addEventListener("click", () => {
    const shell = document.querySelector(".player-shell");
    if (!document.fullscreenElement) shell?.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  btnPip.addEventListener("click", async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {}
  });

  // Theater
  function toggleTheater() {
    theater = !theater;
    document.body.classList.toggle("theater", theater);
  }
  btnTheater?.addEventListener("click", toggleTheater);

  // Quality menu
  btnQuality.addEventListener("click", () => qMenu.classList.toggle("hidden"));
  document.addEventListener("click", (e) => {
    if (!qMenu.contains(e.target) && !btnQuality.contains(e.target)) qMenu.classList.add("hidden");
  });

  // Episode load
  function loadEpisode(idx, autoplay = true, resumeTime = 0) {
    const src = getEpisodeSrc(idx);
    if (!src) return;

    currentEpisode = idx;
    highlightEpisode(currentEpisode);

    // reset upnext state
    upNext?.classList.add("hidden");
    pendingNext = null;

    const wasPlaying = !video.paused;
    video.src = src;
    setQualityLabel(null); // episode may not have quality list
    video.addEventListener("loadedmetadata", function once() {
      video.removeEventListener("loadedmetadata", once);
      video.currentTime = clamp(resumeTime, 0, video.duration || resumeTime);
      if (autoplay || wasPlaying) video.play().catch(()=>{});
    });

    const saved = readJSON(POS_KEY(bookId), posData);
    saved.episodeIndex = currentEpisode;
    writeJSON(POS_KEY(bookId), saved);
  }

  epButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-idx"));
      loadEpisode(idx, true, 0);
      posterInfo?.classList.add("hidden");
      resumePrompt?.classList.add("hidden");
    });
  });

  // Auto Next + Up Next Countdown (10s before end)
  let pendingNext = null; // {idx, secondsLeft}
  let upTimer = null;

  function clearUpNext() {
    pendingNext = null;
    if (upTimer) { clearInterval(upTimer); upTimer = null; }
    upNext?.classList.add("hidden");
  }

  function showUpNext(nextIdx, secondsLeft) {
    pendingNext = { idx: nextIdx, secondsLeft };
    upNextText.textContent = `Episode ${nextIdx + 1} • mulai dalam ${secondsLeft}s`;
    upNext.classList.remove("hidden");

    if (upTimer) clearInterval(upTimer);
    upTimer = setInterval(() => {
      if (!pendingNext) return;
      pendingNext.secondsLeft -= 1;
      const s = pendingNext.secondsLeft;
      upNextText.textContent = `Episode ${nextIdx + 1} • mulai dalam ${Math.max(0,s)}s`;

      if (s <= 0) {
        clearInterval(upTimer);
        upTimer = null;
        loadEpisode(nextIdx, true, 0);
      }
    }, 1000);
  }

  btnCancelNext?.addEventListener("click", () => clearUpNext());
  btnPlayNext?.addEventListener("click", () => {
    if (pendingNext) loadEpisode(pendingNext.idx, true, 0);
  });

  video.addEventListener("timeupdate", () => {
    const d = video.duration || 0;
    const t = video.currentTime || 0;
    if (!d || !isFinite(d)) return;

    const remaining = Math.floor(d - t);
    const next = currentEpisode + 1;

    // show overlay when remaining <= 10 and next exists
    if (next < epButtons.length && remaining <= 10 && remaining >= 1 && !pendingNext) {
      showUpNext(next, remaining);
    }

    // hide if user seeks backward / away from end
    if (pendingNext && remaining > 12) clearUpNext();
  });

  video.addEventListener("ended", () => {
    // mark watched
    watchedSet.add(currentEpisode);
    const saved = readJSON(POS_KEY(bookId), posData);
    saved.watched = Array.from(watchedSet);
    saved.time = 0;
    writeJSON(POS_KEY(bookId), saved);
    markWatchedUI(watchedSet);

    clearUpNext();

    const next = currentEpisode + 1;
    if (next < epButtons.length) loadEpisode(next, true, 0);
  });

  // Persist progress (throttle)
  let lastSave = 0;
  function saveProgress(force = false) {
    const now = Date.now();
    if (!force && now - lastSave < 2000) return;
    lastSave = now;

    const duration = video.duration || 0;
    const time = video.currentTime || 0;
    if (!duration || !isFinite(duration)) return;

    const progress = clamp(time / duration, 0, 1);
    if (progress >= 0.90) watchedSet.add(currentEpisode);

    const saved = readJSON(POS_KEY(bookId), posData);
    saved.episodeIndex = currentEpisode;
    saved.time = time;
    saved.duration = duration;
    saved.watched = Array.from(watchedSet);
    writeJSON(POS_KEY(bookId), saved);
    markWatchedUI(watchedSet);

    upsertContinue({
      bookId,
      title: boot.title || "Untitled",
      cover: boot.cover || "",
      episodeIndex: currentEpisode,
      progress
    });
  }
  video.addEventListener("timeupdate", () => saveProgress(false));
  window.addEventListener("beforeunload", () => saveProgress(true));

  // Watermark dinamis (drift)
  let wmX = 18, wmY = 18, vx = 0.25, vy = 0.18;
  function tickWm() {
    const shell = document.querySelector(".player-shell");
    const r = shell.getBoundingClientRect();
    const maxX = Math.max(10, r.width - 160);
    const maxY = Math.max(10, r.height - 60);

    wmX += vx; wmY += vy;
    if (wmX <= 10 || wmX >= maxX) vx *= -1;
    if (wmY <= 10 || wmY >= maxY) vy *= -1;

    vx += (Math.random() - 0.5) * 0.01;
    vy += (Math.random() - 0.5) * 0.01;
    vx = clamp(vx, -0.6, 0.6);
    vy = clamp(vy, -0.6, 0.6);

    wm.style.transform = `translate(${wmX}px, ${wmY}px)`;
    requestAnimationFrame(tickWm);
  }
  requestAnimationFrame(tickWm);

  // Hide controls when idle
  let idleTimer = null;
  const controls = document.getElementById("controls");
  function showControls() {
    controls.classList.remove("idle");
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controls.classList.add("idle"), 2200);
  }
  ["mousemove", "touchstart"].forEach((ev) => {
    document.querySelector(".player-shell")?.addEventListener(ev, showControls);
  });
  showControls();

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.target && ["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;

    const k = e.key.toLowerCase();
    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
    if (e.code === "ArrowRight") video.currentTime += 5;
    if (e.code === "ArrowLeft") video.currentTime -= 5;
    if (k === "m") btnMute.click();
    if (k === "f") btnFs.click();
    if (k === "t") toggleTheater();
    if (k === "p") btnPip.click();
    if (k === "n") {
      const next = currentEpisode + 1;
      if (next < epButtons.length) loadEpisode(next, true, 0);
    }
    if (k === "c") { // cancel upnext
      clearUpNext();
    }
  });

  // Start state
  updatePlayIcon();
};
