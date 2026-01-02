import express from "express";
import expressLayouts from "express-ejs-layouts";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;
const API = "https://api.sansekai.my.id/api/dramabox";

app.set("view engine", "ejs");
app.set("views", "./views");
app.use(expressLayouts);
app.set("layout", "layout");
app.use(express.static("public"));

const isXHR = (req) =>
  req.get("X-Requested-With") === "XMLHttpRequest" ||
  req.get("Accept")?.includes("text/partial");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Ambil array dari berbagai bentuk response:
 * - langsung array
 * - {data:[...]} / {list:[...]} / {result:[...]} / {items:[...]} / {rows:[...]} / {books:[...]}
 * - nested: {data:{list:[...]}} dll (1 tingkat)
 */
function coerceArray(x) {
  if (!x) return [];
  if (Array.isArray(x)) return x;

  // 1st level candidates
  const keys = ["data", "list", "result", "items", "rows", "books", "chapters", "chapterList"];
  for (const k of keys) {
    if (Array.isArray(x[k])) return x[k];
  }

  // 2nd level (data/list might be object)
  for (const k of ["data", "result"]) {
    const v = x[k];
    if (v && typeof v === "object") {
      for (const kk of keys) {
        if (Array.isArray(v[kk])) return v[kk];
      }
    }
  }

  return [];
}

async function apiGet(path, { timeoutMs = 9000, retries = 2 } = {}) {
  let lastErr = null;

  for (let i = 0; i <= retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);

    try {
      const r = await fetch(`${API}${path}`, {
        headers: { accept: "*/*" },
        signal: ctrl.signal
      });
      clearTimeout(t);

      if (!r.ok) {
        // retry kalau 5xx
        if (r.status >= 500 && i < retries) {
          await sleep(350 * (i + 1));
          continue;
        }
        throw new Error(`API error ${r.status} ${path}`);
      }

      return await r.json();
    } catch (e) {
      clearTimeout(t);
      lastErr = e;

      // retry untuk network/timeout
      if (i < retries) {
        await sleep(350 * (i + 1));
        continue;
      }
    }
  }

  throw lastErr || new Error(`API failed ${path}`);
}

async function safeApiGet(path, fallback) {
  try {
    return await apiGet(path);
  } catch {
    return fallback;
  }
}

function normalizeDramaCard(d) {
  if (!d || typeof d !== "object") return null;
  return {
    bookId: d.bookId,
    bookName: d.bookName,
    bookCover: d.bookCover,
    introduction: d.introduction,
    playCount: d.playCount,
    tags: d.tags || [],
    totalChapterNum: d.totalChapterNum,
    chapterImg: d.chapterImg,
    cdnList: d.cdnList || [],
    videoPath: d.videoPath
  };
}

function pickDefaultQuality(cdnList) {
  if (!Array.isArray(cdnList) || cdnList.length === 0) return { qualities: [], def: null };
  const cdn = cdnList.find((c) => c?.isDefault === 1) || cdnList[0];
  const list = Array.isArray(cdn?.videoPathList) ? cdn.videoPathList : [];

  const def =
    list.find((v) => v?.isDefault === 1) ||
    list.find((v) => v?.quality === 720) ||
    list[0] ||
    null;

  return { qualities: list, def };
}

// HOME
app.get("/", async (req, res) => {
  try {
    // foryou sering 500 -> safe
    const tasks = [
      apiGet("/vip"),
      apiGet("/latest"),
      apiGet("/trending"),
      safeApiGet("/foryou", [])
    ];

    const [vipR, latestR, trendingR, foryouR] = await Promise.allSettled(tasks);

    const vipRaw = vipR.status === "fulfilled" ? vipR.value : [];
    const latestRaw = latestR.status === "fulfilled" ? latestR.value : [];
    const trendingRaw = trendingR.status === "fulfilled" ? trendingR.value : [];
    const foryouRaw = foryouR.status === "fulfilled" ? foryouR.value : [];

    const vipArr = coerceArray(vipRaw);
    const latestArr = coerceArray(latestRaw);
    const trendingArr = coerceArray(trendingRaw);
    const foryouArr = coerceArray(foryouRaw);

    const data = {
      vip: vipArr.map(normalizeDramaCard).filter(Boolean).slice(0, 18),
      latest: latestArr.map(normalizeDramaCard).filter(Boolean).slice(0, 18),
      trending: trendingArr.map(normalizeDramaCard).filter(Boolean).slice(0, 18),
      foryou: foryouArr.map(normalizeDramaCard).filter(Boolean).slice(0, 18)
    };

    if (isXHR(req)) return res.render("home", { layout: false, ...data });
    res.render("home", { ...data });
  } catch (e) {
    res.status(500).send("Server error: " + e.message);
  }
});

// PLAYER
app.get("/watch/:bookId", async (req, res) => {
  try {
    const { bookId } = req.params;

    const detailRaw = await apiGet(`/detail?bookId=${encodeURIComponent(bookId)}`);
    // detail kadang array / object
    const detailObj = Array.isArray(detailRaw) ? detailRaw[0] : detailRaw;
    const drama = normalizeDramaCard(detailObj || {}) || {
      bookId,
      bookName: "Untitled",
      bookCover: "",
      introduction: "",
      playCount: "",
      tags: [],
      totalChapterNum: 0,
      cdnList: [],
      videoPath: ""
    };

    const epRaw = await apiGet(`/allepisode?bookId=${encodeURIComponent(bookId)}`);
    const chaptersArr = coerceArray(epRaw);

    const { qualities, def } = pickDefaultQuality(drama.cdnList);

    const payload = {
      drama,
      chapters: chaptersArr,
      qualities,
      defaultQuality: def
    };

    if (isXHR(req)) return res.render("player", { layout: false, ...payload });
    res.render("player", { ...payload });
  } catch (e) {
    res.status(500).send("Server error: " + e.message);
  }
});

// SEARCH PAGE (SSR/XHR)
app.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) {
      if (isXHR(req)) return res.render("home", { layout: false, vip: [], latest: [], trending: [], foryou: [] });
      return res.redirect("/");
    }

    const raw = await safeApiGet(`/search?query=${encodeURIComponent(q)}`, []);
    const arr = coerceArray(raw);
    const list = arr.map(normalizeDramaCard).filter(Boolean);

    // reuse home view: put results into vip slot
    const data = { vip: list, latest: [], trending: [], foryou: [] };

    if (isXHR(req)) return res.render("home", { layout: false, ...data });
    res.render("home", { ...data });
  } catch (e) {
    res.status(500).send("Server error: " + e.message);
  }
});

// Realtime suggestions
app.get("/api/populersearch", async (_req, res) => {
  try {
    const raw = await safeApiGet("/populersearch", []);
    // populersearch bisa array string/object -> biarin apa adanya (frontend handle)
    res.json(raw);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    const raw = await safeApiGet(`/search?query=${encodeURIComponent(q)}`, []);
    res.json(raw);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`PanStream running http://localhost:${PORT}`));
