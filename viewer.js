(function(){
// Safe DOM-ready
document.addEventListener("DOMContentLoaded", () => {
  // ==== Configuration ====
  const CONFIG = {
    GITHUB_REPO: 'https://github.com/xampocode/CLICK2CSV/issues/new',
    BRAND_URL: 'https://www.4s.lu/',
    PROJECT_NAME: 'CLICK2CSV'
  };

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
  const freezeRowCountEl = $("freezeRowCount");
  const searchBox = $("searchBox");
  const searchMode = $("searchMode");
  const searchInfo = $("searchInfo");
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
  const showColumnsBtn = $("showColumnsBtn");
  const autoExpandToggle = $("autoExpandToggle");
  const autoExpandColsToggle = $("autoExpandColsToggle");
  const feedbackBtn = $("feedbackBtn");
  const feedbackModal = $("feedbackModal");
  const feedbackClose = $("feedbackClose");
  const feedbackForm = $("feedbackForm");
  const feedbackSubmit = $("feedbackSubmit");
  const feedbackCancel = $("feedbackCancel");

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
  let freezeRowCount = 0;
  let colOrder = []; // indices mapping visible->data
  let hiddenColumns = new Set(); // indices of hidden columns
  let autoExpandMode = false;
  let autoExpandColsMode = false;
  let rowHeights = new Map(); // rowIdx -> height in pixels
  let columnAutoWidths = new Map(); // colIdx -> calculated width in pixels
  let searchAndMode = true; // true = AND, false = OR
  let currentSearchTerms = []; // array of search terms
  let errorLog = []; // error tracking for feedback
  let performanceLog = []; // performance tracking
  let usageLog = []; // feature usage tracking

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

  // Global error handling
  window.addEventListener('error', (e) => {
    logError(e.error || e.message, {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    logError(e.reason, { type: 'unhandled_promise_rejection' });
  });

  // ==== init ====
  (async function init(){
    const initStart = performance.now();

    if (flash === "reset-ok") status("✅ Settings reset to default");

    if (versionLabel) {
      try {
        const manifest = chrome?.runtime?.getManifest?.();
        if (manifest?.version) versionLabel.textContent = `v${manifest.version}`;
      } catch (err) {
        logError(err, { action: 'version_display' });
        console.warn("Unable to read manifest version", err);
      }
    }

    const saved = await storageGet(["csv_viewer_theme","csv_viewer_freeze","csv_viewer_freezeRow","csv_viewer_colOrder","csv_viewer_hiddenColumns","csv_viewer_autoExpand","csv_viewer_autoExpandCols","csv_viewer_rowHeights","csv_viewer_colAutoWidths"]);
    if (saved.csv_viewer_theme) applyTheme(saved.csv_viewer_theme); else applyTheme(systemDark()?"dark":"light");
    if (typeof saved.csv_viewer_freeze === "number") {
      freezeCount = saved.csv_viewer_freeze;
      freezeCountEl.value = String(freezeCount);
    }
    if (typeof saved.csv_viewer_freezeRow === "number") {
      freezeRowCount = saved.csv_viewer_freezeRow;
      freezeRowCountEl.value = String(freezeRowCount);
    }
    if (Array.isArray(saved.csv_viewer_colOrder)) colOrder = saved.csv_viewer_colOrder;
    if (Array.isArray(saved.csv_viewer_hiddenColumns)) hiddenColumns = new Set(saved.csv_viewer_hiddenColumns);
    if (typeof saved.csv_viewer_autoExpand === "boolean") {
      autoExpandMode = saved.csv_viewer_autoExpand;
      autoExpandToggle.textContent = "Rows Auto-Expand: " + (autoExpandMode ? "On" : "Off");
    }
    if (typeof saved.csv_viewer_autoExpandCols === "boolean") {
      autoExpandColsMode = saved.csv_viewer_autoExpandCols;
      autoExpandColsToggle.textContent = "Cols Auto-Expand: " + (autoExpandColsMode ? "On" : "Off");
    }
    if (saved.csv_viewer_rowHeights) rowHeights = new Map(Object.entries(saved.csv_viewer_rowHeights).map(([k,v]) => [parseInt(k), v]));
    if (saved.csv_viewer_colAutoWidths) columnAutoWidths = new Map(Object.entries(saved.csv_viewer_colAutoWidths).map(([k,v]) => [parseInt(k), v]));

    updateShowColumnsBtn();

    const initDuration = performance.now() - initStart;
    logPerformance('initialization', initDuration);

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
    logUsage('edit_mode_toggle', { enabled: editMode });
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

  on(freezeRowCountEl, "change", () => {
    const n = Math.max(0, parseInt(freezeRowCountEl.value || "0", 10));
    freezeRowCount = n;
    storageSet({ csv_viewer_freezeRow: freezeRowCount });
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

  on(showColumnsBtn, "click", () => {
    hiddenColumns.clear();
    storageSet({ csv_viewer_hiddenColumns: [] });
    renderHeader(getOrderedHeaders());
    renderBody();
    updateShowColumnsBtn();
  });

  on(autoExpandToggle, "click", () => {
    autoExpandMode = !autoExpandMode;
    autoExpandToggle.textContent = "Rows Auto-Expand: " + (autoExpandMode ? "On" : "Off");
    storageSet({ csv_viewer_autoExpand: autoExpandMode });
    invalidateRowHeight();
    renderBody();
  });

  on(autoExpandColsToggle, "click", () => {
    autoExpandColsMode = !autoExpandColsMode;
    autoExpandColsToggle.textContent = "Cols Auto-Expand: " + (autoExpandColsMode ? "On" : "Off");
    storageSet({ csv_viewer_autoExpandCols: autoExpandColsMode });
    if (autoExpandColsMode) {
      calculateAutoColumnWidths();
    }
    renderHeader(getOrderedHeaders());
    renderBody();
  });

  on(searchMode, "click", () => {
    searchAndMode = !searchAndMode;
    searchMode.textContent = searchAndMode ? "AND" : "OR";
    searchMode.className = searchAndMode ? "search-mode active" : "search-mode";
    logUsage('search_mode_toggle', { mode: searchAndMode ? 'AND' : 'OR' });
    // Re-run search with new mode
    performSearch();
  });

  // Feedback system event handlers
  on(feedbackBtn, "click", () => {
    logUsage('feedback_open');
    feedbackModal.classList.add("active");
    updateFeedbackContext();
  });

  on(feedbackClose, "click", () => {
    feedbackModal.classList.remove("active");
  });

  on(feedbackCancel, "click", () => {
    feedbackModal.classList.remove("active");
  });

  on(feedbackModal, "click", (e) => {
    if (e.target === feedbackModal) {
      feedbackModal.classList.remove("active");
    }
  });

  on(feedbackSubmit, "click", async () => {
    const formData = {
      type: $("feedbackType").value,
      title: $("feedbackTitle").value.trim(),
      description: $("feedbackDescription").value.trim(),
      email: $("feedbackEmail").value.trim()
    };

    if (!formData.title || !formData.description) {
      alert("Please fill in both title and description fields.");
      return;
    }

    try {
      const report = generateFeedbackReport(formData);
      await navigator.clipboard.writeText(report);

      logUsage('feedback_submit', { type: formData.type, hasEmail: !!formData.email });

      $("feedbackSuccess").style.display = "block";

      // Open GitHub Issues page
      setTimeout(() => {
        window.open(CONFIG.GITHUB_REPO, '_blank');
        feedbackModal.classList.remove("active");
        $("feedbackSuccess").style.display = "none";
        feedbackForm.reset();
      }, 2000);

    } catch (error) {
      logError(error, { action: 'feedback_submission' });
      alert("Failed to copy feedback to clipboard. Please try again.");
    }
  });

  function updateFeedbackContext() {
    const systemInfo = getSystemInfo();
    $("feedbackContext").textContent =
      `Extension v${systemInfo.extensionVersion} | ` +
      `${systemInfo.dataInfo.rows} rows, ${systemInfo.dataInfo.columns} cols | ` +
      `Memory: ${systemInfo.performance.memoryUsage} | ` +
      `Errors: ${systemInfo.recentErrors.length}`;
  }
on(resetBtn, "click", async () => {
    if (!confirm("Are you sure you want to reset settings?")) return;
    await storageRemove(["csv_viewer_theme","csv_viewer_freeze","csv_viewer_freezeRow","csv_viewer_colOrder","csv_viewer_hiddenColumns","csv_viewer_autoExpand","csv_viewer_autoExpandCols","csv_viewer_rowHeights","csv_viewer_colAutoWidths"]);
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

  // ==== Error Logging & Feedback System ====
  function logError(error, context = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      message: error.message || error,
      stack: error.stack,
      context: {
        ...context,
        dataRows: data.rows.length,
        dataCols: data.headers.length,
        searchTerms: currentSearchTerms,
        frozenCols: freezeCount,
        frozenRows: freezeRowCount,
        autoExpand: autoExpandMode,
        autoExpandCols: autoExpandColsMode
      }
    };

    errorLog.push(errorEntry);
    // Keep only last 50 errors
    if (errorLog.length > 50) errorLog.shift();

    console.error('CSV Viewer Error:', errorEntry);
  }

  function logPerformance(operation, duration, details = {}) {
    const perfEntry = {
      timestamp: new Date().toISOString(),
      operation,
      duration,
      details: {
        ...details,
        dataSize: data.rows.length,
        memoryUsage: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) : 'N/A'
      }
    };

    performanceLog.push(perfEntry);
    if (performanceLog.length > 20) performanceLog.shift();

    // Log slow operations
    if (duration > 2000) {
      logError(`Slow operation: ${operation} took ${duration}ms`, details);
    }
  }

  function logUsage(feature, details = {}) {
    const usageEntry = {
      timestamp: new Date().toISOString(),
      feature,
      details
    };

    usageLog.push(usageEntry);
    if (usageLog.length > 100) usageLog.shift();
  }

  function getSystemInfo() {
    const manifest = chrome?.runtime?.getManifest?.();
    return {
      extensionVersion: manifest?.version || 'Unknown',
      browser: navigator.userAgent,
      timestamp: new Date().toISOString(),
      dataInfo: {
        rows: data.rows.length,
        columns: data.headers.length,
        delimiter: usedDelimiter,
        hasHeaders: hasHeaderEl.checked
      },
      features: {
        searchActive: currentSearchTerms.length > 0,
        searchMode: searchAndMode ? 'AND' : 'OR',
        frozenColumns: freezeCount,
        frozenRows: freezeRowCount,
        hiddenColumns: hiddenColumns.size,
        editMode: editMode,
        autoExpandRows: autoExpandMode,
        autoExpandCols: autoExpandColsMode
      },
      performance: {
        memoryUsage: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB' : 'N/A',
        recentSlowOps: performanceLog.filter(p => p.duration > 1000).length
      },
      recentErrors: errorLog.slice(-5), // Last 5 errors
      recentUsage: usageLog.slice(-10)  // Last 10 feature uses
    };
  }

  function generateFeedbackReport(formData) {
    const systemInfo = getSystemInfo();
    const typeEmojis = {
      bug: '🐛',
      feature: '💡',
      performance: '⚡',
      general: '💬',
      praise: '👍'
    };

    return `${typeEmojis[formData.type]} **${formData.title}**

## Description
${formData.description}

## System Information
- **Extension Version**: ${systemInfo.extensionVersion}
- **Browser**: ${systemInfo.browser}
- **Data**: ${systemInfo.dataInfo.rows} rows, ${systemInfo.dataInfo.columns} columns
- **Delimiter**: ${systemInfo.dataInfo.delimiter}
- **Memory Usage**: ${systemInfo.performance.memoryUsage}

## Current Settings
- **Search**: ${systemInfo.features.searchActive ? `"${currentSearchTerms.join(' ')}" (${systemInfo.features.searchMode} mode)` : 'Not active'}
- **Frozen Columns**: ${systemInfo.features.frozenColumns}
- **Frozen Rows**: ${systemInfo.features.frozenRows}
- **Hidden Columns**: ${systemInfo.features.hiddenColumns}
- **Edit Mode**: ${systemInfo.features.editMode ? 'On' : 'Off'}
- **Auto-Expand**: Rows=${systemInfo.features.autoExpandRows ? 'On' : 'Off'}, Cols=${systemInfo.features.autoExpandCols ? 'On' : 'Off'}

${systemInfo.recentErrors.length > 0 ? `## Recent Errors
${systemInfo.recentErrors.map(e => `- **${e.timestamp}**: ${e.message}`).join('\n')}` : ''}

${formData.email ? `\n## Contact\n${formData.email}` : ''}

---
*Generated by ${CONFIG.PROJECT_NAME} Beta Feedback System*
*Timestamp: ${systemInfo.timestamp}*`;
  }

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
    const parseStart = performance.now();

    try {
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

    if (autoExpandColsMode) {
      calculateAutoColumnWidths();
    }
    renderHeader(getOrderedHeaders());
    renderBody();

    const parseDuration = performance.now() - parseStart;
    logPerformance('csv_parse', parseDuration, {
      fileSize: text.length,
      rows: data.rows.length,
      columns: headers.length,
      delimiter: used
    });

    logUsage('csv_loaded', {
      rows: data.rows.length,
      columns: headers.length,
      hasHeaders: hasHeaderEl.checked,
      delimiter: used,
      autoFreeze: opts.autoFreeze
    });

    status(`Loaded ${data.rows.length} rows, ${headers.length} columns.`);

    } catch (error) {
      logError(error, {
        action: 'csv_parse',
        fileSize: text.length,
        delimiter: delimiterEl.value
      });
      status("❌ Error parsing CSV file");
      throw error;
    }
  }

  function getOrderedHeaders(){ return colOrder.map(i => data.headers[i]); }
  function getVisibleHeaders(){ return colOrder.filter(i => !hiddenColumns.has(i)).map(i => data.headers[i]); }
  function getVisibleColumnOrder(){ return colOrder.filter(i => !hiddenColumns.has(i)); }

  function updateShowColumnsBtn(){
    if (hiddenColumns.size > 0) {
      showColumnsBtn.textContent = `Show Columns (${hiddenColumns.size})`;
      showColumnsBtn.style.display = "inline-block";
    } else {
      showColumnsBtn.style.display = "none";
    }
  }

  function hideColumn(dataIdx){
    hiddenColumns.add(dataIdx);
    storageSet({ csv_viewer_hiddenColumns: Array.from(hiddenColumns) });
    renderHeader(getOrderedHeaders());
    renderBody();
    updateShowColumnsBtn();
  }

  function calculateAutoColumnWidths(){
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

    const visibleOrder = getVisibleColumnOrder();
    const sampleSize = Math.min(100, data.rows.length); // Sample first 100 rows for performance

    for (let visIdx = 0; visIdx < visibleOrder.length; visIdx++) {
      const dataIdx = visibleOrder[visIdx];
      let maxWidth = 80; // Minimum width

      // Measure header
      const headerText = data.headers[dataIdx] || "";
      maxWidth = Math.max(maxWidth, ctx.measureText(headerText).width + 20);

      // Measure sample of data
      for (let i = 0; i < sampleSize; i++) {
        const row = data.rows[i];
        const cellText = (row?.[dataIdx] ?? "").toString();
        const textWidth = ctx.measureText(cellText).width + 20; // Add padding
        maxWidth = Math.max(maxWidth, textWidth);
      }

      columnAutoWidths.set(dataIdx, Math.min(maxWidth, 400)); // Cap at 400px
    }

    const colAutoWidthsObj = Object.fromEntries(columnAutoWidths.entries());
    storageSet({ csv_viewer_colAutoWidths: colAutoWidthsObj });
  }

  function highlightSearchTerms(text, terms) {
    if (!terms.length || !text) return text;
    let result = text;

    // Sort terms by length (longest first) to avoid partial replacements
    const sortedTerms = [...terms].sort((a, b) => b.length - a.length);

    for (const term of sortedTerms) {
      if (term.length < 2) continue; // Skip very short terms
      const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      result = result.replace(regex, '<span class="search-highlight">$1</span>');
    }

    return result;
  }

  function performSearch() {
    const query = searchBox.value.trim();
    currentSearchTerms = query ? query.toLowerCase().split(/\s+/).filter(term => term.length > 0) : [];

    if (!currentSearchTerms.length) {
      filteredIdx = data.rows.map((_, i) => i);
      searchInfo.textContent = "";
    } else {
      filteredIdx = [];
      const visibleOrder = getVisibleColumnOrder();

      for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i];
        const matches = currentSearchTerms.map(term => {
          return visibleOrder.some(dataIdx => {
            const cell = (row[dataIdx] ?? "").toString().toLowerCase();
            return cell.includes(term);
          });
        });

        const shouldInclude = searchAndMode ?
          matches.every(match => match) : // AND: all terms must match
          matches.some(match => match);   // OR: any term must match

        if (shouldInclude) filteredIdx.push(i);
      }

      const termText = currentSearchTerms.length === 1 ? "term" : "terms";
      const modeText = searchAndMode ? "all" : "any";
      searchInfo.textContent = `${currentSearchTerms.length} ${termText} (${modeText})`;
    }

    renderBody();
  }

  function renderHeader(headers){
    const visibleHeaders = getVisibleHeaders();
    const visibleOrder = getVisibleColumnOrder();

    // colgroup
    colgroup.innerHTML = "";
    if (!columnWidths.length || columnWidths.length !== headers.length) columnWidths = headers.map(()=>null);
    visibleHeaders.forEach((_, idx) => {
      const col = document.createElement("col");
      const dataIdx = visibleOrder[idx];
      const origIdx = colOrder.indexOf(dataIdx);

      if (autoExpandColsMode && columnAutoWidths.has(dataIdx)) {
        col.style.width = columnAutoWidths.get(dataIdx) + "px";
        col.classList.add("auto-width");
      } else if (columnWidths[origIdx]) {
        col.style.width = columnWidths[origIdx] + "px";
      }
      colgroup.appendChild(col);
    });

    thead.innerHTML = "";
    const tr = document.createElement("tr");
    visibleHeaders.forEach((h, visIdx) => {
      const dataIdx = visibleOrder[visIdx];
      const th = document.createElement("th");
      th.textContent = h;
      th.draggable = true;
      th.dataset.visIdx = String(visIdx);
      th.dataset.dataIdx = String(dataIdx);

      if (visIdx < freezeCount) {
        th.classList.add("freeze");
        th.style.left = computeLeftOffset(visIdx) + "px";
      }

      let asc = true;
      th.addEventListener("click", (e) => {
        if (e.target.classList.contains("resizer") || e.target.classList.contains("hide-btn")) return;
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
        const fromDataIdx = visibleOrder[from];
        const toDataIdx = visibleOrder[to];
        const fromOrigIdx = colOrder.indexOf(fromDataIdx);
        const toOrigIdx = colOrder.indexOf(toDataIdx);
        const moved = colOrder.splice(fromOrigIdx,1)[0];
        colOrder.splice(toOrigIdx,0,moved);
        storageSet({ csv_viewer_colOrder: colOrder });
        renderHeader(getOrderedHeaders());
        renderBody();
      });

      // Hide button
      const hideBtn = document.createElement("div");
      hideBtn.className = "hide-btn";
      hideBtn.textContent = "×";
      hideBtn.title = "Hide column";
      hideBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        hideColumn(dataIdx);
      });
      th.appendChild(hideBtn);

      const res = document.createElement("div");
      res.className = "resizer";
      res.addEventListener("mousedown", (e) => startResize(e, visIdx));
      th.style.position = "sticky";
      th.appendChild(res);

      tr.appendChild(th);
    });
    thead.appendChild(tr);
    updateShowColumnsBtn();
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
    td.textContent = autoExpandMode ? "Sample\nMultiple\nLines" : "";
    if (autoExpandMode) td.className = "auto-expand";
    probe.appendChild(td);
  }
  // Insert after thead to compute height reliably
  const first = tbody.firstChild;
  tbody.insertBefore(probe, first || null);
  const h = Math.max(20, Math.round(probe.getBoundingClientRect().height || 28));
  tbody.removeChild(probe);
  return h;
}
function getRowHeight(rowIdx = null){
  if (rowIdx !== null && rowHeights.has(rowIdx)) {
    return rowHeights.get(rowIdx);
  }
  if (!_rowHeightCache) _rowHeightCache = measureBodyRowHeight();
  return _rowHeightCache;
}
function setRowHeight(rowIdx, height){
  rowHeights.set(rowIdx, Math.max(20, height));
  const rowHeightsObj = Object.fromEntries(rowHeights.entries());
  storageSet({ csv_viewer_rowHeights: rowHeightsObj });
  invalidateRowHeight();
}
function invalidateRowHeight(){ _rowHeightCache = null; }

function renderBody(){
    const defaultRowHeight = getRowHeight();
    // Use average height when we have variable heights, otherwise use default
    const avgRowHeight = rowHeights.size > 0 ?
      Array.from(rowHeights.values()).reduce((a,b) => a+b, 0) / rowHeights.size + defaultRowHeight * (filteredIdx.length - rowHeights.size) / filteredIdx.length :
      defaultRowHeight;

    const estimatedRowHeight = autoExpandMode ? Math.max(defaultRowHeight, avgRowHeight) : defaultRowHeight;
    const visibleCount = Math.ceil(wrap.clientHeight / estimatedRowHeight) + 30;
    const scrollTop = wrap.scrollTop;
    const start = Math.max(0, Math.floor(scrollTop / estimatedRowHeight) - 15);
    const end = Math.min(filteredIdx.length, start + visibleCount);

    const topPad = start * estimatedRowHeight;
    const bottomPad = Math.max(0, (filteredIdx.length - end) * estimatedRowHeight);
    const visibleOrder = getVisibleColumnOrder();

    // Debug: Update status with scroll info
    if (filteredIdx.length > 100) {
      const debugStatus = `${filteredIdx.length} rows (showing ${start+1}-${end})`;
      status(debugStatus);
    }

    const frag = document.createDocumentFragment();
    const topSpacer = document.createElement("tr");
    topSpacer.style.height = topPad + "px";
    topSpacer.style.border = "none";
    frag.appendChild(topSpacer);

    for (let i=start; i<end; i++) {
      const tr = document.createElement("tr");
      const rowIdx = filteredIdx[i];
      const row = data.rows[rowIdx];
      const currentRowHeight = getRowHeight(rowIdx);

      // Set custom height if different from default
      if (rowHeights.has(rowIdx) || autoExpandMode) {
        tr.style.height = currentRowHeight + "px";
        tr.classList.add("variable-height");
      }

      // Apply row freeze styling
      if (i < freezeRowCount) {
        tr.classList.add("freeze-row");
        tr.style.top = (i * estimatedRowHeight) + "px";
      }

      // Add row resizer
      const rowResizer = document.createElement("div");
      rowResizer.className = "row-resizer";
      rowResizer.addEventListener("mousedown", (e) => startRowResize(e, rowIdx));
      tr.appendChild(rowResizer);

      for (let visIdx=0; visIdx<visibleOrder.length; visIdx++) {
        const dataIdx = visibleOrder[visIdx];
        const td = document.createElement("td");
        if (visIdx < freezeCount) {
          td.classList.add("freeze");
          td.style.left = computeLeftOffset(visIdx) + "px";
        }
        if (autoExpandMode) {
          td.classList.add("auto-expand");
        }
        if (autoExpandColsMode) {
          td.classList.add("auto-width");
        }
        let val = row?.[dataIdx] ?? "";
        if (currentSearchTerms.length > 0) {
          td.innerHTML = highlightSearchTerms(val.toString(), currentSearchTerms);
        } else {
          td.textContent = val;
        }
        if (editMode) {
          td.contentEditable = "true";
          td.addEventListener("blur", () => {
            const newVal = td.textContent;
            if (!data.rows[rowIdx]) data.rows[rowIdx] = [];
            data.rows[rowIdx][dataIdx] = newVal;
            if (autoExpandMode) {
              // Measure and update row height after edit
              setTimeout(() => {
                const measuredHeight = Math.max(20, tr.getBoundingClientRect().height);
                setRowHeight(rowIdx, measuredHeight);
              }, 0);
            }
            if (autoExpandColsMode) {
              // Recalculate column width after edit
              setTimeout(() => {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
                const textWidth = ctx.measureText(newVal).width + 20;
                const currentWidth = columnAutoWidths.get(dataIdx) || 80;
                if (textWidth > currentWidth) {
                  columnAutoWidths.set(dataIdx, Math.min(textWidth, 400));
                  const colAutoWidthsObj = Object.fromEntries(columnAutoWidths.entries());
                  storageSet({ csv_viewer_colAutoWidths: colAutoWidthsObj });
                  renderHeader(getOrderedHeaders());
                }
              }, 0);
            }
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

  // Row resize functionality
  let resizingRow = null;
  function startRowResize(e, rowIdx){
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = getRowHeight(rowIdx);
    resizingRow = { rowIdx, startY, startHeight };
    window.addEventListener("mousemove", onRowResizeMove);
    window.addEventListener("mouseup", stopRowResize);
  }
  function onRowResizeMove(e){
    if (!resizingRow) return;
    const dy = e.clientY - resizingRow.startY;
    const newH = Math.max(20, resizingRow.startHeight + dy);
    setRowHeight(resizingRow.rowIdx, newH);
    renderBody();
  }
  function stopRowResize(){
    resizingRow = null;
    window.removeEventListener("mousemove", onRowResizeMove);
    window.removeEventListener("mouseup", stopRowResize);
  }

  // Enhanced search
  on(searchBox, "input", performSearch);


  // Forward wheel on header to the table scroller so the bar never disappears/shrinks
  const headerEl = document.querySelector("header");
  headerEl.addEventListener("wheel", (e) => {
    // Let horizontal wheel pass through, but vertical should scroll the tableWrap
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      wrap.scrollTop += e.deltaY;
    }
  }, { passive: false });

  // Add scroll listener for virtualization with throttling
  let scrollTimeout = null;
  wrap.addEventListener("scroll", () => {
    if (scrollTimeout) return;
    scrollTimeout = setTimeout(() => {
      renderBody();
      scrollTimeout = null;
    }, 16); // ~60fps
  });

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
    const visibleOrder = getVisibleColumnOrder();
    let out = "";
    out += visibleOrder.map(i => csvEscape(data.headers[i], delim)).join(delim) + "\r\n";
    for (const r of data.rows) {
      const line = visibleOrder.map(i => csvEscape(r?.[i] ?? "", delim)).join(delim);
      out += line + "\r\n";
    }
    const blob = new Blob([out], {type: "text/csv;charset=utf-8"});
    triggerDownload(blob, "table.csv");
  }
  function downloadJSON(){
    const visibleOrder = getVisibleColumnOrder();
    const rows = data.rows.map(r => {
      const obj = {};
      for (let visIdx=0; visIdx<visibleOrder.length; visIdx++){
        const dataIdx = visibleOrder[visIdx];
        obj[data.headers[dataIdx]] = r?.[dataIdx] ?? "";
      }
      return obj;
    });
    const blob = new Blob([JSON.stringify(rows, null, 2)], {type: "application/json"});
    triggerDownload(blob, "table.json");
  }
  function downloadXML(){
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
    const visibleOrder = getVisibleColumnOrder();
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="Sheet1">
    <Table>`;
    xml += "<Row>";
    for (let visIdx=0; visIdx<visibleOrder.length; visIdx++){
      const di = visibleOrder[visIdx];
      xml += `<Cell><Data ss:Type="String">${esc(data.headers[di])}</Data></Cell>`;
    }
    xml += "</Row>";
    for (const r of data.rows) {
      xml += "<Row>";
      for (let visIdx=0; visIdx<visibleOrder.length; visIdx++){
        const di = visibleOrder[visIdx];
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
