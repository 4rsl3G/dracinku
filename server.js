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

async function apiGet(path) {
  const r = await fetch(`${API}${path}`, { headers: { accept: "*/*" } });
  if (!r.ok) throw new Error(`API error ${r.status} ${path}`);
  return r.json();
}

function normalizeDramaCard(d) {
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
  const cdn = cdnList.find((c) => c.isDefault === 1) || cdnList[0];
  const list = cdn.videoPathList || [];
  const def =
    list.find((v) => v.isDefault === 1) ||
    list.find((v) => v.quality === 720) ||
    list[0] ||
    null;
  return { qualities: list, def };
}

// Home SSR + XHR partial (SPA)
app.get("/", async (req, res) => {
  try {
    const [vip, latest, trending, foryou] = await Promise.all([
      apiGet("/vip"),
      apiGet("/latest"),
      apiGet("/trending"),
      apiGet("/foryou")
    ]);

    const data = {
      vip: (vip || []).slice(0, 18).map(normalizeDramaCard),
      latest: (latest || []).slice(0, 18).map(normalizeDramaCard),
      trending: (trending || []).slice(0, 18).map(normalizeDramaCard),
      foryou: (foryou || []).slice(0, 18).map(normalizeDramaCard)
    };

    if (isXHR(req)) return res.render("home", { layout: false, ...data });
    res.render("home", { ...data });
  } catch (e) {
    res.status(500).send("Server error: " + e.message);
  }
});

// Player (VERTIKAL)
app.get("/watch/:bookId", async (req, res) => {
  try {
    const { bookId } = req.params;

    const detailRaw = await apiGet(`/detail?bookId=${encodeURIComponent(bookId)}`);
    const detail = Array.isArray(detailRaw) ? detailRaw[0] : detailRaw;
    const drama = normalizeDramaCard(detail || {});

    const epRaw = await apiGet(`/allepisode?bookId=${encodeURIComponent(bookId)}`);
    const chapters = Array.isArray(epRaw)
      ? epRaw
      : (epRaw?.chapters || epRaw?.chapterList || []);

    const { qualities, def } = pickDefaultQuality(drama.cdnList);

    const payload = {
      drama,
      chapters,
      qualities,
      defaultQuality: def
    };

    if (isXHR(req)) return res.render("player", { layout: false, ...payload });
    res.render("player", { ...payload });
  } catch (e) {
    res.status(500).send("Server error: " + e.message);
  }
});

// Search SSR/XHR (results)
app.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return isXHR(req) ? res.render("home", { layout: false, vip: [], latest: [], trending: [], foryou: [] }) : res.redirect("/");

    const result = await apiGet(`/search?query=${encodeURIComponent(q)}`);
    const list = (result || []).map(normalizeDramaCard);

    // render reuse home template: put result in vip slot (simple)
    if (isXHR(req)) {
      return res.render("home", { layout: false, vip: list, latest: [], trending: [], foryou: [] });
    }
    res.render("home", { vip: list, latest: [], trending: [], foryou: [] });
  } catch (e) {
    res.status(500).send("Server error: " + e.message);
  }
});

// JSON APIs for realtime suggestions + optional client usage
app.get("/api/populersearch", async (req, res) => {
  try {
    res.json(await apiGet("/populersearch"));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();
    if (!q) return res.json([]);
    res.json(await apiGet(`/search?query=${encodeURIComponent(q)}`));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`PanStream running http://localhost:${PORT}`));
