(function(){
// Safe DOM-ready
document.addEventListener("DOMContentLoaded", () => {
  // ==== helpers ====
  const $ = (id) => document.getElementById(id);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // ==== refs ====
  const statusEl = $("status");
  const table = $("table");
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  const colgroup = table.querySelector("colgroup");
  const wrap = $("tableWrap");

  const fileInput = $("fileInput");
  const openFileBtn = $("openFileBtn");
  const delimiterEl = $("delimiter");
  const hasHeaderEl = $("hasHeader");
  const freezeCountEl = $("freezeCount");
  const searchBox = $("searchBox");
  const reparseBtn = $("reparseBtn");
  const editToggle = $("editToggle");
  const exportKind = $("exportKind");
  const exportBtn = $("exportBtn");
  const urlInput = $("urlInput");
  const loadUrlBtn = $("loadUrlBtn");
  const themeBtn = $("themeBtn");
  const resetBtn = $("resetBtn");
  const dropOverlay = $("dropOverlay");
  const versionLabel = $("versionLabel");

  const qs = new URLSearchParams(location.search);
  const src = qs.get("src");
  const flash = qs.get("flash");

  // ==== state ====
  let data = { headers: [], rows: [] }, filteredIdx = [];
  let lastText = "";
  let usedDelimiter = ",";
  let columnWidths = [];
  let editMode = false;
  let freezeCount = 0;
  let colOrder = []; // indices mapping visible->data

  // ==== storage ====
  const storageGet = (keys) => new Promise(res => {
    try { chrome.storage.local.get(keys, obj => res(obj||{})); }
    catch { res({}); }
  });
  const storageSet = (obj) => new Promise(res => {
    try { chrome.storage.local.set(obj, res); }
    catch { res(); }
  });
  const storageRemove = (keys) => new Promise(res => {
    try { chrome.storage.local.remove(keys, res); }
    catch { res(); }
  });

  // ==== init ====
  (async function init(){
    if (flash === "reset-ok") status("✅ Settings reset to default");

    if (versionLabel) {
      try {
        const manifest = chrome?.runtime?.getManifest?.();
        if (manifest?.version) versionLabel.textContent = `v${manifest.version}`;
      } catch (err) {
        console.warn("Unable to read manifest version", err);
      }
    }

    const saved = await storageGet(["csv_viewer_theme","csv_viewer_freeze","csv_viewer_colOrder"]);
    if (saved.csv_viewer_theme) applyTheme(saved.csv_viewer_theme); else applyTheme(systemDark()?"dark":"light");
    if (typeof saved.csv_viewer_freeze === "number") {
      freezeCount = saved.csv_viewer_freeze;
      freezeCountEl.value = String(freezeCount);
    }
    if (Array.isArray(saved.csv_viewer_colOrder)) colOrder = saved.csv_viewer_colOrder;

    if (src) loadFromUrl(src);
    else status("Choose a file, paste a URL, or drag & drop.");
  })();

  // ==== UI bindings ====
  on(openFileBtn, "click", () => fileInput.click());
  on(fileInput, "change", () => { if (fileInput.files?.[0]) loadFile(fileInput.files[0]); });

  on(delimiterEl, "change", () => { if (lastText) parseAndRender(lastText); });
  on(hasHeaderEl, "change", () => { if (lastText) parseAndRender(lastText); });
  on(reparseBtn, "click", () => { if (lastText) parseAndRender(lastText, {autoFreeze:false}); });

  on(editToggle, "click", () => {
    editMode = !editMode;
    editToggle.textContent = "Edit: " + (editMode ? "On" : "Off");
    invalidateRowHeight();
    renderBody();
  });

  on(freezeCountEl, "change", () => {
    const n = Math.max(0, parseInt(freezeCountEl.value || "0", 10));
    freezeCount = n;
    storageSet({ csv_viewer_freeze: freezeCount });
    renderHeader(getOrderedHeaders());
    renderBody();
  });

  on(exportBtn, "click", () => {
    const kind = exportKind.value;
    if (kind === "json") downloadJSON();
    else if (kind === "xml") downloadXML();
    else downloadCSV();
  });

  on(loadUrlBtn, "click", ()=> loadFromUrl(urlInput.value.trim()));
  on(urlInput, "keydown", (e)=>{ if(e.key === "Enter") loadFromUrl(urlInput.value.trim()); });

  on(themeBtn, "click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || (systemDark()?"dark":"light");
    const next = cur === "dark" ? "light" : "dark";
    setTheme(next);
  });
on(resetBtn, "click", async () => {
    if (!confirm("Are you sure you want to reset settings?")) return;
    await storageRemove(["csv_viewer_theme","csv_viewer_freeze","csv_viewer_colOrder"]);
    const url = new URL(location.href);
    url.searchParams.set("flash", "reset-ok");
    location.href = url.toString();
  });

  // Drag & drop
  const prevent = (e)=>{ e.preventDefault(); e.stopPropagation(); };
  ["dragenter","dragover","dragleave","drop"].forEach(ev => window.addEventListener(ev, prevent, false));
  ["dragenter","dragover"].forEach(()=> dropOverlay.classList.add("active"));
  ["dragleave","drop"].forEach(()=> dropOverlay.classList.remove("active"));
  window.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    if (!dt) return;
    if (dt.files && dt.files[0]) { loadFile(dt.files[0]); return; }
    const url = dt.getData("text/uri-list") || dt.getData("text/plain");
    if (url && /^https?:\/\//i.test(url.trim())) loadFromUrl(url.trim());
  }, false);

  // ==== theme ====
  function applyTheme(mode){
  // mode: 'dark' | 'light'
  document.documentElement.setAttribute('data-theme', mode);
  themeBtn.textContent = mode === 'dark' ? '☀️' : '🌙';
}
  function systemDark(){ return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
  function setTheme(mode){ applyTheme(mode); storageSet({ csv_viewer_theme: mode }); }

  // ==== status ====
  function status(msg){
    statusEl.textContent = msg;
  }

  // ==== load/parse/render ====
  function loadFile(file){
    const reader = new FileReader();
    reader.onload = () => parseAndRender(reader.result, {autoFreeze:true});
    reader.readAsText(file);
  }
  function loadFromUrl(u){
    if(!u) return;
    status("Fetching…");
    fetch(u).then(r=>{
      if(!r.ok) throw new Error("HTTP "+r.status);
      return r.text();
    }).then(t=>{
      parseAndRender(t, {autoFreeze:true});
    }).catch(e=>{
      console.error(e);
      status("Failed to fetch URL.");
    });
  }

  function parseCSV(text, delimiterGuess) {
    const rows = [];
    const delim = delimiterGuess || guessDelimiter(text);
    let i = 0, field = "", row = [], inQuotes = false;
    while (i < text.length) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i+1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        } else { field += c; i++; continue; }
      } else {
        if (c === '"') { inQuotes = true; i++; continue; }
        if (c === '\r') { i++; continue; }
        if (c === '\n') { row.push(field); rows.push(row); field=""; row=[]; i++; continue; }
        if (c === delim) { row.push(field); field=""; i++; continue; }
        field += c; i++; continue;
      }
    }
    row.push(field);
    rows.push(row);
    return { rows, delimiter: delim };
  }
  function guessDelimiter(sample) {
    const candidates = [",",";","\t","|"];
    let best = ",", bestScore = -Infinity;
    const lines = sample.split(/\r?\n/).slice(0, 20).filter(Boolean);
    for (const d of candidates) {
      const counts = lines.map(l => (l.match(new RegExp(d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))||[]).length);
      if (!counts.length) continue;
      const mean = counts.reduce((a,b)=>a+b,0)/counts.length;
      const variance = Math.max(...counts) - Math.min(...counts);
      const score = mean - variance*0.5;
      if (score > bestScore) { bestScore = score; best = d; }
    }
    return best;
  }

  function parseAndRender(text, opts={}){
    lastText = text;
    tbody.innerHTML = "";
    thead.innerHTML = "";
    const selected = delimiterEl.value;
    const delimiter = (selected === "auto") ? undefined : selected;
    const { rows, delimiter: used } = parseCSV(text, delimiter);
    usedDelimiter = used;
    if (selected === "auto") delimiterEl.value = used;

    let headers = [], bodyRows = [];
    if (hasHeaderEl.checked && rows.length) {
      headers = rows[0];
      bodyRows = rows.slice(1);
    } else {
      const maxCols = Math.max(0, ...rows.map(r => r.length));
      headers = Array.from({length:maxCols}, (_,i)=>`Col ${i+1}`);
      bodyRows = rows;
    }
    if (!colOrder.length || colOrder.length !== headers.length) {
      colOrder = headers.map((_,i)=>i);
    }
    data = { headers, rows: bodyRows };
    filteredIdx = data.rows.map((_,i)=>i);

    if (opts.autoFreeze && (freezeCountEl.value === "" || freezeCountEl.value === "0")) {
      freezeCount = hasHeaderEl.checked ? 1 : 0;
      freezeCountEl.value = String(freezeCount);
      storageSet({ csv_viewer_freeze: freezeCount });
    }

    renderHeader(getOrderedHeaders());
    renderBody();
    status(`Loaded ${data.rows.length} rows, ${headers.length} columns.`);
  }

  function getOrderedHeaders(){ return colOrder.map(i => data.headers[i]); }

  function renderHeader(headers){
    // colgroup
    colgroup.innerHTML = "";
    if (!columnWidths.length || columnWidths.length !== headers.length) columnWidths = headers.map(()=>null);
    headers.forEach((_, idx) => {
      const col = document.createElement("col");
      if (columnWidths[idx]) col.style.width = columnWidths[idx] + "px";
      colgroup.appendChild(col);
    });

    thead.innerHTML = "";
    const tr = document.createElement("tr");
    headers.forEach((h, visIdx) => {
      const th = document.createElement("th");
      th.textContent = h;
      th.draggable = true;
      th.dataset.visIdx = String(visIdx);

      if (visIdx < freezeCount) {
        th.classList.add("freeze");
        th.style.left = computeLeftOffset(visIdx) + "px";
      }

      let asc = true;
      th.addEventListener("click", (e) => {
        if (e.target.classList.contains("resizer")) return;
        const dataIdx = colOrder[visIdx];
        filteredIdx.sort((a,b)=>{
          const av = data.rows[a][dataIdx] ?? "";
          const bv = data.rows[b][dataIdx] ?? "";
          return asc ? compare(av,bv) : compare(bv,av);
        });
        asc = !asc;
        renderBody();
      });

      th.addEventListener("dragstart", (e) => {
        th.classList.add("dragging");
        e.dataTransfer.setData("text/plain", visIdx.toString());
        e.dataTransfer.effectAllowed = "move";
      });
      th.addEventListener("dragend", () => th.classList.remove("dragging"));
      th.addEventListener("dragover", (e) => e.preventDefault());
      th.addEventListener("drop", (e) => {
        e.preventDefault();
        const from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        const to = visIdx;
        if (from === to || Number.isNaN(from) || Number.isNaN(to)) return;
        const moved = colOrder.splice(from,1)[0];
        colOrder.splice(to,0,moved);
        storageSet({ csv_viewer_colOrder: colOrder });
        renderHeader(getOrderedHeaders());
        renderBody();
      });

      const res = document.createElement("div");
      res.className = "resizer";
      res.addEventListener("mousedown", (e) => startResize(e, visIdx));
      th.style.position = "sticky";
      th.appendChild(res);

      tr.appendChild(th);
    });
    thead.appendChild(tr);
  }

  function compare(a,b){
    const an = parseFloat(a), bn = parseFloat(b);
    const aNum = !isNaN(an) && String(an) === String(a).trim();
    const bNum = !isNaN(bn) && String(bn) === String(b).trim();
    if (aNum && bNum) return an - bn;
    return String(a).localeCompare(String(b), undefined, {numeric:true, sensitivity:"base"});
  }

  
let _rowHeightCache = null;
function measureBodyRowHeight(){
  // create a probe row with same structure
  const probe = document.createElement("tr");
  for (let i=0;i<Math.max(1, colOrder.length); i++){
    const td = document.createElement("td");
    td.textContent = "";
    probe.appendChild(td);
  }
  // Insert after thead to compute height reliably
  const first = tbody.firstChild;
  tbody.insertBefore(probe, first || null);
  const h = Math.max(20, Math.round(probe.getBoundingClientRect().height || 28));
  tbody.removeChild(probe);
  return h;
}
function getRowHeight(){
  if (!_rowHeightCache) _rowHeightCache = measureBodyRowHeight();
  return _rowHeightCache;
}
function invalidateRowHeight(){ _rowHeightCache = null; }

function renderBody(){
    const rowHeight = getRowHeight();
    const visibleCount = Math.ceil(wrap.clientHeight / rowHeight) + 30;
    const scrollTop = wrap.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 15);
    const end = Math.min(filteredIdx.length, start + visibleCount);

    const topPad = start * rowHeight;
    const bottomPad = Math.max(0, (filteredIdx.length - end) * rowHeight);

    const frag = document.createDocumentFragment();
    const topSpacer = document.createElement("tr");
    topSpacer.style.height = topPad + "px";
    topSpacer.style.border = "none";
    frag.appendChild(topSpacer);

    for (let i=start; i<end; i++) {
      const tr = document.createElement("tr");
      const rowIdx = filteredIdx[i];
      const row = data.rows[rowIdx];
      for (let visIdx=0; visIdx<data.headers.length; visIdx++) {
        const dataIdx = colOrder[visIdx];
        const td = document.createElement("td");
        if (visIdx < freezeCount) {
          td.classList.add("freeze");
          td.style.left = computeLeftOffset(visIdx) + "px";
        }
        let val = row?.[dataIdx] ?? "";
        td.textContent = val;
        if (editMode) {
          td.contentEditable = "true";
          td.addEventListener("blur", () => {
            const newVal = td.textContent;
            if (!data.rows[rowIdx]) data.rows[rowIdx] = [];
            data.rows[rowIdx][dataIdx] = newVal;
          });
        }
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    const bottomSpacer = document.createElement("tr");
    bottomSpacer.style.height = bottomPad + "px";
    bottomSpacer.style.border = "none";
    frag.appendChild(bottomSpacer);

    tbody.innerHTML = "";
    tbody.appendChild(frag);
  }

  function computeLeftOffset(visIdx){
    let x = 0;
    const cols = colgroup.querySelectorAll("col");
    for (let i=0;i<visIdx;i++) {
      const w = cols[i] && cols[i].style.width ? parseInt(cols[i].style.width) : measureColumnWidth(i);
      x += (w || 120);
    }
    return x;
  }
  function measureColumnWidth(i){
    const row = tbody.querySelector("tr + tr");
    if (!row) return 120;
    const cell = row.children[i];
    if (!cell) return 120;
    return Math.ceil(cell.getBoundingClientRect().width);
  }

  let resizing = null;
  function startResize(e, visIdx){
    e.preventDefault();
    const startX = e.clientX;
    const colEl = colgroup.querySelectorAll("col")[visIdx];
    const startWidth = (colEl && colEl.style.width) ? parseInt(colEl.style.width) : (measureColumnWidth(visIdx) || 120);
    resizing = { visIdx, startX, startWidth };
    window.addEventListener("mousemove", onResizeMove);
    window.addEventListener("mouseup", stopResize);
  }
  function onResizeMove(e){
    if (!resizing) return;
    const dx = e.clientX - resizing.startX;
    const newW = Math.max(40, resizing.startWidth + dx);
    setColumnWidth(resizing.visIdx, newW);
  }
  function stopResize(){
    resizing = null;
    window.removeEventListener("mousemove", onResizeMove);
    window.removeEventListener("mouseup", stopResize);
  }
  function setColumnWidth(visIdx, px){
    columnWidths[visIdx] = px;
    const colEl = colgroup.querySelectorAll("col")[visIdx];
    if (colEl) colEl.style.width = px + "px";
    invalidateRowHeight();
  }

  // filter
  on(searchBox, "input", () => {
    const q = searchBox.value.trim().toLowerCase();
    if (!q) filteredIdx = data.rows.map((_,i)=>i);
    else {
      filteredIdx = [];
      for (let i=0; i<data.rows.length; i++) {
        const row = data.rows[i];
        let hit = false;
        for (let visIdx=0; visIdx<colOrder.length; visIdx++) {
          const dataIdx = colOrder[visIdx];
          const cell = (row[dataIdx] ?? "").toString().toLowerCase();
          if (cell.includes(q)) { hit = true; break; }
        }
        if (hit) filteredIdx.push(i);
      }
    }
    renderBody();
  });


  // Forward wheel on header to the table scroller so the bar never disappears/shrinks
  const headerEl = document.querySelector("header");
  headerEl.addEventListener("wheel", (e) => {
    // Let horizontal wheel pass through, but vertical should scroll the tableWrap
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      wrap.scrollTop += e.deltaY;
    }
  }, { passive: false });

  // exports
  function csvEscape(s, delim){
    if (s == null) s = "";
    s = String(s);
    const needsQuote = s.includes('"') || s.includes('\n') || s.includes('\r') || s.includes(delim);
    if (s.includes('"')) s = s.replace(/"/g, '""');
    return needsQuote ? '"' + s + '"' : s;
  }
  function downloadCSV(){
    const delim = usedDelimiter || ",";
    let out = "";
    out += colOrder.map(i => csvEscape(data.headers[i], delim)).join(delim) + "\r\n";
    for (const r of data.rows) {
      const line = colOrder.map(i => csvEscape(r?.[i] ?? "", delim)).join(delim);
      out += line + "\r\n";
    }
    const blob = new Blob([out], {type: "text/csv;charset=utf-8"});
    triggerDownload(blob, "table.csv");
  }
  function downloadJSON(){
    const rows = data.rows.map(r => {
      const obj = {};
      for (let visIdx=0; visIdx<colOrder.length; visIdx++){
        const dataIdx = colOrder[visIdx];
        obj[data.headers[dataIdx]] = r?.[dataIdx] ?? "";
      }
      return obj;
    });
    const blob = new Blob([JSON.stringify(rows, null, 2)], {type: "application/json"});
    triggerDownload(blob, "table.json");
  }
  function downloadXML(){
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sheet1">
    <Table>`;
    xml += "<Row>";
    for (let visIdx=0; visIdx<colOrder.length; visIdx++){
      const di = colOrder[visIdx];
      xml += `<Cell><Data ss:Type="String">${esc(data.headers[di])}</Data></Cell>`;
    }
    xml += "</Row>";
    for (const r of data.rows) {
      xml += "<Row>";
      for (let visIdx=0; visIdx<colOrder.length; visIdx++){
        const di = colOrder[visIdx];
        const v = r?.[di] ?? "";
        const n = parseFloat(v);
        if (!isNaN(n) && String(n) === String(v).trim()) {
          xml += `<Cell><Data ss:Type="Number">${n}</Data></Cell>`;
        } else {
          xml += `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
        }
      }
      xml += "</Row>";
    }
    xml += "</Table></Worksheet></Workbook>";
    const blob = new Blob([xml], {type: "application/vnd.ms-excel;charset=utf-8"});
    triggerDownload(blob, "table.xml");
  }
  function triggerDownload(blob, filename){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
});
})();
