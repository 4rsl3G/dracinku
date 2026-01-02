function cwKey() { return "ps_continue_v1"; }

function getContinue() {
  try { return JSON.parse(localStorage.getItem(cwKey()) || "[]"); }
  catch { return []; }
}

function renderContinue() {
  const list = getContinue();
  const $cw = $("#cw");
  if (!$cw.length) return;

  if (!list.length) {
    $cw.html(`<div style="color:rgba(255,255,255,.55);font-size:13px">
      Belum ada yang ditonton. Buka salah satu drama untuk memulai.
    </div>`);
    return;
  }

  $cw.html(list.map(x => `
    <a class="card spa-link" href="/watch/${x.bookId}">
      <div class="poster">
        <img loading="lazy" src="${x.cover || ""}" alt="${x.title || ""}"/>
        <div class="badge"><i class="ri-history-line"></i> Resume</div>
        <div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.16)">
          <div style="height:3px;width:${Math.round((x.progress || 0)*100)}%;background:#fff"></div>
        </div>
      </div>
      <div class="meta">
        <div class="name">${x.title || "Untitled"}</div>
        <div class="tags">
          <span class="tag">Ep ${Number(x.episodeIndex||0)+1}</span>
          <span class="tag">${Math.round((x.progress || 0)*100)}%</span>
        </div>
      </div>
    </a>
  `).join(""));
}

window.PS_HOME_INIT = function () {
  renderContinue();

  $(".card").off("mousemove").on("mousemove", function (e) {
    const r = this.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    this.style.transform = `translateY(-2px) rotateX(${(-y) * 4}deg) rotateY(${x * 6}deg)`;
  });
  $(".card").off("mouseleave").on("mouseleave", function () {
    this.style.transform = "";
  });
};
