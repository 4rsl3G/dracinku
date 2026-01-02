window.PS_TOPBAR_INIT = function () {
  const $input = $("#searchInput");
  const $suggest = $("#suggest");

  if (!$input.length) return;

  let populer = [];
  let timer = null;
  let lastQ = "";

  function hide() { $suggest.addClass("hidden").empty(); }
  function show() { $suggest.removeClass("hidden"); }

  function render(items, q, mode) {
    if (!items || !items.length) return hide();
    const html = items.slice(0, 8).map(it => {
      const name = it.bookName || it.keyword || it.query || it;
      const cover = it.bookCover;
      const play = it.playCount;
      const subtitle = mode === "pop"
        ? "Populer"
        : (play ? `${play}` : "Hasil");

      return `
        <div class="item" data-q="${String(name).replaceAll('"','')}">
          <div class="left">
            <i class="ri-search-line icon"></i>
            <div>
              <div class="txt">${name}</div>
              <div class="sub">${subtitle}</div>
            </div>
          </div>
          <i class="ri-arrow-right-up-line" style="opacity:.65"></i>
        </div>`;
    }).join("");

    $suggest.html(html);
    show();
  }

  // fetch populer sekali
  (async () => {
    try {
      const r = await fetch("/api/populersearch");
      populer = await r.json();
    } catch { populer = []; }
  })();

  function debounce(fn, ms) {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  }

  $input.off("input").on("input", function () {
    const q = ($(this).val() || "").trim();
    lastQ = q;
    if (!q) {
      // tampilkan populer
      if (Array.isArray(populer) && populer.length) render(populer, "", "pop");
      else hide();
      return;
    }

    debounce(async () => {
      if (q !== lastQ) return;
      try {
        const r = await fetch("/api/search?q=" + encodeURIComponent(q));
        const data = await r.json();
        render(data, q, "search");
      } catch {
        hide();
      }
    }, 220);
  });

  // focus => tampilkan populer
  $input.off("focus").on("focus", function () {
    const q = ($(this).val() || "").trim();
    if (!q && populer.length) render(populer, "", "pop");
  });

  // klik suggestion => navigate
  $suggest.off("click").on("click", ".item", function () {
    const q = $(this).data("q") || "";
    hide();
    $input.val(q);
    if (window.PS_NAVIGATE) window.PS_NAVIGATE("/search?q=" + encodeURIComponent(q), true);
    else location.href = "/search?q=" + encodeURIComponent(q);
  });

  // click outside
  $(document).off("click.suggest").on("click.suggest", function (e) {
    if ($(e.target).closest(".searchwrap").length) return;
    hide();
  });

  // esc
  $input.off("keydown").on("keydown", function (e) {
    if (e.key === "Escape") hide();
  });
};
