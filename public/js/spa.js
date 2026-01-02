(function () {
  const $overlay = $("#overlay");
  const $app = $("#app");
  const CACHE = new Map();

  function show() { $overlay.removeClass("hidden").attr("aria-hidden", "false"); }
  function hide() { $overlay.addClass("hidden").attr("aria-hidden", "true"); }

  function skeletonHome(count = 12) {
    let cards = "";
    for (let i = 0; i < count; i++) {
      cards += `
        <div class="skeleton">
          <div class="skel-img"></div>
          <div class="skel-meta">
            <div class="skel-line sm"></div>
            <div class="skel-line xs"></div>
          </div>
        </div>`;
    }
    return `
      <section class="hero">
        <div class="hero-inner">
          <div class="hero-kicker">Loading…</div>
          <h1 class="hero-title" style="opacity:.65">PanStream</h1>
          <p class="hero-sub">Mengambil data…</p>
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2>Memuat</h2><div class="hint">skeleton</div></div>
        <div class="grid skeleton-grid">${cards}</div>
      </section>`;
  }

  function skeletonPlayer() {
    return `
      <section class="watch">
        <div class="watch-left">
          <div class="skeleton" style="aspect-ratio:9/16;border-radius:18px;max-width:520px;margin:0 auto"></div>
          <div class="skeleton" style="margin-top:12px;padding:16px;border-radius:18px">
            <div class="skel-line sm"></div>
            <div class="skel-line"></div>
            <div class="skel-line xs"></div>
          </div>
        </div>
        <aside class="watch-right">
          <div class="skeleton" style="height:64vh;border-radius:18px"></div>
        </aside>
      </section>`;
  }

  function runPageScripts() {
    if (window.__page === "home" && window.PS_HOME_INIT) window.PS_HOME_INIT();
    if (window.__page === "player" && window.PS_PLAYER_INIT) window.PS_PLAYER_INIT();
    if (window.PS_TOPBAR_INIT) window.PS_TOPBAR_INIT();
  }

  async function fetchPartial(url) {
    return $.ajax({
      url,
      method: "GET",
      headers: { "X-Requested-With": "XMLHttpRequest" }
    });
  }

  async function loadUrl(url, push = true) {
    show();
    if (url.startsWith("/watch/")) $app.html(skeletonPlayer());
    else $app.html(skeletonHome(14));

    try {
      let html;
      if (CACHE.has(url)) html = CACHE.get(url);
      else {
        html = await fetchPartial(url);
        CACHE.set(url, html);
      }
      $app.html(html);

      if (push) history.pushState({ url }, "", url);
      if (!url.includes("#")) window.scrollTo({ top: 0, behavior: "instant" });

      runPageScripts();
    } catch {
      location.href = url;
    } finally {
      hide();
    }
  }

  $(document).on("click", "a.spa-link", function (e) {
    const href = $(this).attr("href");
    if (!href || href.startsWith("http")) return;
    e.preventDefault();
    loadUrl(href, true);
  });

  // Prefetch on hover
  let prefetchTimer = null;
  $(document).on("mouseenter", "a.spa-link", function () {
    const href = $(this).attr("href");
    if (!href || href.startsWith("http") || CACHE.has(href)) return;
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(async () => {
      try {
        const html = await fetchPartial(href);
        CACHE.set(href, html);
      } catch {}
    }, 120);
  });

  // Search submit -> SPA
  $(document).on("submit", "form.searchbar", function (e) {
    e.preventDefault();
    const q = $(this).find("input[name='q']").val() || "";
    loadUrl("/search?q=" + encodeURIComponent(q), true);
  });

  window.addEventListener("popstate", (ev) => {
    const url = ev.state?.url || (location.pathname + location.search);
    loadUrl(url, false);
  });

  $(function () { runPageScripts(); });

  window.PS_NAVIGATE = loadUrl;
})();
