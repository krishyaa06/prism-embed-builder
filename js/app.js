(() => {
  const { $, $$, toast, copy, download, store, esc, debounce, tabs } = Prism;
  const L = Core.LIMITS;
  const K = { auto: "embed-builder:autosave", drafts: "embed-builder:drafts", hook: "embed-builder:webhook" };
  const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";
  const clone = (v) => JSON.parse(JSON.stringify(v));

  let state = Core.normalize({});
  let view = "json";

  /* ───────── load initial state: share link → autosave → sample ───────── */
  const fromHash = Core.decodeShare(location.hash);
  if (fromHash) { state = fromHash; history.replaceState(null, "", location.pathname + location.search); setTimeout(() => toast("Loaded message from share link"), 300); }
  else { const saved = store.get(K.auto, null); state = Core.normalize(saved || Core.SAMPLE); }

  /* ───────── helpers ───────── */
  const getPath = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  const setPath = (obj, path, v) => { const ks = path.split("."), last = ks.pop(); ks.reduce((o, k) => (o[k] = o[k] || {}), obj)[last] = v; };
  const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso); if (Number.isNaN(d.getTime())) return ""; const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const saveAuto = debounce(() => store.set(K.auto, Core.clean(state)), 250);

  /* ───────── editor ───────── */
  const input = (k, label, ph = "", type = "text", cnt) =>
    `<label class="field"><span class="lbl">${label}${cnt ? ` <span class="cnt" data-cnt="${k}"></span>` : ""}</span><input type="${type}" data-k="${k}" placeholder="${esc(ph)}" /></label>`;

  function embedCard(e, i) {
    const n = state.embeds.length;
    return `<details class="card embed-card" data-e="${i}" open>
      <summary>
        <span class="swatch" style="background:${e.color != null ? Core.intToHex(e.color) : "#4e5058"}"></span>
        <b>Embed ${i + 1}</b><span class="muted sum-title"></span>
        <span class="spacer"></span>
        <span class="cnt" data-cnt="__embed"></span>
        <span class="acts">
          <button class="icon" data-act="up" title="Move up" ${i === 0 ? "disabled" : ""}>↑</button>
          <button class="icon" data-act="down" title="Move down" ${i === n - 1 ? "disabled" : ""}>↓</button>
          <button class="icon" data-act="dup" title="Duplicate" ${n >= L.embeds ? "disabled" : ""}>⧉</button>
          <button class="icon danger" data-act="del" title="Remove embed">✕</button>
        </span>
      </summary>
      <div class="stack embed-body">
        <h3 class="sub">Author</h3>
        <div class="grid g3 tight">${input("author.name", "Name", "Prism Protocol", "text", 1)}${input("author.url", "URL", "https://…", "url")}${input("author.icon_url", "Icon URL", "https://…/icon.png", "url")}</div>
        <h3 class="sub">Body</h3>
        <div class="grid g2 tight">${input("title", "Title", "Embed title", "text", 1)}${input("url", "Title URL", "https://…", "url")}</div>
        <label class="field"><span class="lbl">Description <span class="cnt" data-cnt="description"></span></span><textarea data-k="description" rows="5" class="sm" placeholder="Supports **bold**, *italic*, __underline__, ~~strike~~, \`code\`, ||spoilers||, [links](https://…)"></textarea></label>
        <div class="row color-row">
          <label class="field inline">Color <input type="color" data-k="__colorPick" /></label>
          <input type="text" class="code hex" data-k="__colorHex" placeholder="#5865F2" maxlength="7" aria-label="Color hex" />
          <span class="presets">${["#5865F2", "#57F287", "#FEE75C", "#ED4245", "#EB459E", "#00D2FF", "#FFFFFF", "#2B2D31"].map((c) => `<button class="dot" data-act="color" data-c="${c}" style="background:${c}" title="${c}"></button>`).join("")}</span>
          <button class="btn small ghost" data-act="nocolor">No color</button>
        </div>
        <h3 class="sub">Images</h3>
        <div class="grid g2 tight">${input("thumbnail.url", "Thumbnail URL", "https://…/thumb.png", "url")}${input("image.url", "Image URL", "https://…/banner.png", "url")}</div>
        <div class="card-title sub-title"><h3 class="sub">Fields <span class="cnt" data-cnt="__fields"></span></h3><button class="btn small" data-act="addField" ${e.fields.length >= L.fields ? "disabled" : ""}>＋ Field</button></div>
        <div class="fields stack">${e.fields.map((f, j) => fieldRow(f, j, e.fields.length)).join("") || '<p class="muted small empty-fields">No fields yet.</p>'}</div>
        <h3 class="sub">Footer</h3>
        <div class="grid g2 tight">${input("footer.text", "Text", "Footer text", "text", 1)}${input("footer.icon_url", "Icon URL", "https://…/icon.png", "url")}</div>
        <div class="row">
          <label class="field inline">Timestamp <input type="datetime-local" data-k="__ts" /></label>
          <button class="btn small" data-act="now">Now</button>
          <button class="btn small ghost" data-act="clearTs">Clear</button>
        </div>
      </div>
    </details>`;
  }
  function fieldRow(f, j, n) {
    return `<div class="field-row" data-f="${j}">
      <div class="grid fr-grid">
        <label class="field"><span class="lbl">Name <span class="cnt" data-cnt="f.name"></span></span><input type="text" data-fk="name" /></label>
        <label class="field"><span class="lbl">Value <span class="cnt" data-cnt="f.value"></span></span><textarea data-fk="value" rows="1" class="sm auto"></textarea></label>
      </div>
      <div class="row fr-acts">
        <label class="check"><input type="checkbox" data-fk="inline" /> Inline</label>
        <span class="spacer"></span>
        <button class="icon" data-act="fup" title="Move up" ${j === 0 ? "disabled" : ""}>↑</button>
        <button class="icon" data-act="fdown" title="Move down" ${j === n - 1 ? "disabled" : ""}>↓</button>
        <button class="icon danger" data-act="fdel" title="Remove field">✕</button>
      </div>
    </div>`;
  }

  function fillEditor() {
    $$("#editorCol > .card [data-k]").forEach((el) => (el.value = state[el.dataset.k] || ""));
    $$(".embed-card").forEach((card) => {
      const e = state.embeds[+card.dataset.e];
      $$("[data-k]", card).forEach((el) => {
        const k = el.dataset.k;
        if (k === "__colorPick") el.value = e.color != null ? Core.intToHex(e.color).toLowerCase() : "#202225";
        else if (k === "__colorHex") el.value = e.color != null ? Core.intToHex(e.color) : "";
        else if (k === "__ts") el.value = toLocalInput(e.timestamp);
        else el.value = getPath(e, k) || "";
      });
      $$(".field-row", card).forEach((row) => {
        const f = e.fields[+row.dataset.f];
        $$("[data-fk]", row).forEach((el) => (el.type === "checkbox" ? (el.checked = f.inline) : (el.value = f[el.dataset.fk])));
      });
    });
    $$("textarea.auto").forEach(autosize);
  }
  function renderEditor() {
    const open = $$(".embed-card").map((d) => d.open);
    $("#embeds").innerHTML = state.embeds.map(embedCard).join("");
    $$(".embed-card").forEach((d, i) => { if (open[i] === false) d.open = false; });
    $("#addEmbed").disabled = state.embeds.length >= L.embeds;
    $("#addEmbed").textContent = state.embeds.length >= L.embeds ? `Embed limit reached (${L.embeds})` : `＋ Add embed (${state.embeds.length}/${L.embeds})`;
    fillEditor();
  }
  function autosize(t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight + 2, 260) + "px"; }

  /* ───────── counters ───────── */
  function setCnt(el, n, lim) {
    el.textContent = `${n}/${lim}`;
    el.className = "cnt" + (n > lim ? " bad" : n > lim * 0.9 ? " warn" : "");
  }
  function updateCounters(res) {
    $$("#editorCol > .card [data-cnt]").forEach((el) => setCnt(el, Core.len(state[el.dataset.cnt]), L[el.dataset.cnt]));
    $$(".embed-card").forEach((card) => {
      const i = +card.dataset.e, e = state.embeds[i];
      $$("[data-cnt]", card).forEach((el) => {
        const c = el.dataset.cnt;
        if (c === "__embed") setCnt(el, res.perEmbed[i], L.total);
        else if (c === "__fields") setCnt(el, e.fields.length, L.fields);
        else if (c === "title") setCnt(el, Core.len(e.title), L.title);
        else if (c === "description") setCnt(el, Core.len(e.description), L.description);
        else if (c === "author.name") setCnt(el, Core.len(e.author.name), L.author);
        else if (c === "footer.text") setCnt(el, Core.len(e.footer.text), L.footer);
        else if (c.startsWith("f.")) { const f = e.fields[+el.closest(".field-row").dataset.f]; setCnt(el, Core.len(f[c.slice(2)]), c === "f.name" ? L.fieldName : L.fieldValue); }
      });
      $(".sum-title", card).textContent = e.title ? "· " + e.title : "";
      $(".swatch", card).style.background = e.color != null ? Core.intToHex(e.color) : "#4e5058";
    });
    // mark invalid inputs
    $$(".invalid").forEach((el) => el.classList.remove("invalid"));
    res.issues.filter((x) => x.level === "error").forEach(({ path }) => {
      let m;
      if (!path.startsWith("embeds[")) { const el = $(`#editorCol > .card [data-k="${path}"]`); if (el) el.classList.add("invalid"); return; }
      if ((m = /^embeds\[(\d+)\]\.fields\[(\d+)\]\.(\w+)/.exec(path))) { const el = $(`.embed-card[data-e="${m[1]}"] .field-row[data-f="${m[2]}"] [data-fk="${m[3]}"]`); if (el) el.classList.add("invalid"); return; }
      if ((m = /^embeds\[(\d+)\]\.(.+)$/.exec(path))) { const k = m[2] === "color" ? "__colorHex" : m[2] === "timestamp" ? "__ts" : m[2]; const el = $(`.embed-card[data-e="${m[1]}"] [data-k="${k}"]`); if (el) el.classList.add("invalid"); }
    });
  }

  /* ───────── preview ───────── */
  const img = (src, cls, alt = "") => `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('broken')" />`;
  const link = (href, inner, cls = "") => (href && Core.isUrl(href) && /^https?:/i.test(href) ? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noreferrer noopener">${inner}</a>` : `<span class="${cls}">${inner}</span>`);
  function fmtStamp(iso) {
    const d = new Date(iso); if (Number.isNaN(d.getTime())) return "";
    const now = new Date(), time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diff = Math.round((day(d) - day(now)) / 864e5);
    if (diff === 0) return `Today at ${time}`;
    if (diff === -1) return `Yesterday at ${time}`;
    return `${d.toLocaleDateString("en-US")} ${time}`;
  }
  function embedHtml(e) {
    const c = Core.cleanEmbed(e);
    if (!Object.keys(c).filter((k) => k !== "color").length) return "";
    const thumb = c.thumbnail && c.thumbnail.url;
    let main = "";
    if (c.author && c.author.name) main += `<div class="e-author">${c.author.icon_url ? img(c.author.icon_url, "e-author-icon") : ""}${link(c.author.url, esc(c.author.name), "e-author-name")}</div>`;
    if (c.title) main += `<div class="e-title">${link(c.url, Core.markdown(c.title, { inline: true }), c.url ? "is-link" : "")}</div>`;
    if (c.description) main += `<div class="e-desc">${Core.markdown(c.description)}</div>`;
    if (c.fields) main += `<div class="e-fields">${Core.fieldRows(c.fields, !!thumb).map((row) => `<div class="e-row" style="grid-template-columns:repeat(${row.length},minmax(0,1fr))">${row.map((f) => `<div class="e-field"><div class="e-fname">${Core.markdown(f.name, { inline: true })}</div><div class="e-fvalue">${Core.markdown(f.value)}</div></div>`).join("")}</div>`).join("")}</div>`;
    let html = `<div class="e-grid${thumb ? " has-thumb" : ""}"><div class="e-main">${main}</div>${thumb ? img(thumb, "e-thumb") : ""}</div>`;
    if (c.image) html += img(c.image.url, "e-image");
    const foot = [c.footer && c.footer.text ? esc(c.footer.text) : "", c.timestamp ? esc(fmtStamp(c.timestamp)) : ""].filter(Boolean);
    if (foot.length) html += `<div class="e-footer">${c.footer && c.footer.icon_url && c.footer.text ? img(c.footer.icon_url, "e-footer-icon") : ""}<span>${foot.join('<span class="dotsep">•</span>')}</span></div>`;
    return `<div class="embed" style="border-left-color:${c.color != null ? Core.intToHex(c.color) : "#1e1f22"}">${html}</div>`;
  }
  function renderPreview() {
    const now = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const body = (state.content ? `<div class="msg-content">${Core.markdown(state.content)}</div>` : "") + state.embeds.map(embedHtml).join("");
    $("#preview").innerHTML = `<div class="msg">
      ${img(Core.isUrl(state.avatar_url) ? state.avatar_url : DEFAULT_AVATAR, "avatar")}
      <div class="msg-body">
        <div class="msg-head"><span class="uname">${esc(state.username || "Captain Hook")}</span><span class="bot-tag">APP</span><span class="msg-ts">Today at ${now}</span></div>
        ${body || '<div class="msg-content muted-d">Your message is empty.</div>'}
      </div></div>`;
  }

  /* ───────── output ───────── */
  function hl(json) {
    return esc(json).replace(/(&quot;(?:\\.|[^&\\]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (m, s, colon, bool) =>
      s ? `<span class="${colon ? "k" : "s"}">${s}</span>${colon || ""}` : bool ? `<span class="b">${m}</span>` : m === "null" ? `<span class="z">null</span>` : `<span class="n">${m}</span>`);
  }
  const output = () => ({ json: Core.toJson(state), djs: Core.toDiscordJs(state), dpy: Core.toDiscordPy(state), curl: Core.toCurl(state, $("#hook").value) }[view]);
  function renderOutput() { const t = output(); $("#out").innerHTML = view === "json" ? hl(t) : esc(t); }

  /* ───────── main render ───────── */
  function render() {
    const res = Core.validate(state);
    updateCounters(res);
    renderPreview();
    renderOutput();
    const tot = $("#total");
    tot.textContent = `${res.total} / ${L.total} chars`;
    tot.className = "pill " + (res.total > L.total ? "bad" : res.total > L.total * 0.9 ? "warn" : "acc");
    const errs = res.issues.filter((i) => i.level === "error"), warns = res.issues.filter((i) => i.level === "warn");
    const v = $("#validity");
    v.className = "pill " + (errs.length ? "bad" : warns.length ? "warn" : "ok");
    v.textContent = errs.length ? `${errs.length} error${errs.length > 1 ? "s" : ""}` : warns.length ? `${warns.length} warning${warns.length > 1 ? "s" : ""}` : "✓ Ready to send";
    $("#issues").innerHTML = [...errs, ...warns].map((i) => `<li class="${i.level}">${i.level === "error" ? "✕" : "!"} ${esc(i.msg)}</li>`).join("");
    $("#send").disabled = !!errs.length;
    saveAuto();
    return res;
  }

  /* ───────── events: typing ───────── */
  $("#editorCol").addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.matches("textarea.auto")) autosize(el);
    if (el.id === "hook") return;
    const card = el.closest(".embed-card");
    if (!card) { if (el.dataset.k) state[el.dataset.k] = el.value; return render(); }
    const e = state.embeds[+card.dataset.e];
    const row = el.closest(".field-row");
    if (row && el.dataset.fk) { const f = e.fields[+row.dataset.f]; f[el.dataset.fk] = el.type === "checkbox" ? el.checked : el.value; return render(); }
    const k = el.dataset.k;
    if (!k) return;
    if (k === "__colorPick") { e.color = Core.hexToInt(el.value); $('[data-k="__colorHex"]', card).value = Core.intToHex(e.color); }
    else if (k === "__colorHex") { const n = Core.hexToInt(el.value); if (n != null) { e.color = n; $('[data-k="__colorPick"]', card).value = Core.intToHex(n).toLowerCase(); } else if (!el.value.trim()) e.color = null; }
    else if (k === "__ts") e.timestamp = el.value ? new Date(el.value).toISOString() : "";
    else setPath(e, k, el.value);
    render();
  });
  $("#editorCol").addEventListener("change", (ev) => { if (ev.target.dataset.fk === "inline") ev.target.dispatchEvent(new Event("input", { bubbles: true })); });

  /* ───────── events: buttons ───────── */
  $("#embeds").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    ev.preventDefault();
    const i = +b.closest(".embed-card").dataset.e, E = state.embeds, e = E[i], act = b.dataset.act;
    const row = b.closest(".field-row"), j = row ? +row.dataset.f : -1;
    const swap = (arr, a, c) => ([arr[a], arr[c]] = [arr[c], arr[a]]);
    let structural = true;
    switch (act) {
      case "up": swap(E, i, i - 1); break;
      case "down": swap(E, i, i + 1); break;
      case "dup": E.splice(i + 1, 0, clone(e)); break;
      case "del": E.splice(i, 1); break;
      case "addField": e.fields.push({ name: "", value: "", inline: true }); break;
      case "fup": swap(e.fields, j, j - 1); break;
      case "fdown": swap(e.fields, j, j + 1); break;
      case "fdel": e.fields.splice(j, 1); break;
      case "color": e.color = Core.hexToInt(b.dataset.c); structural = false; break;
      case "nocolor": e.color = null; structural = false; break;
      case "now": e.timestamp = new Date().toISOString(); structural = false; break;
      case "clearTs": e.timestamp = ""; structural = false; break;
    }
    if (structural) renderEditor(); else fillEditor();
    render();
    if (act === "addField") { const rows = $$(`.embed-card[data-e="${i}"] .field-row`); const f = rows[rows.length - 1]; if (f) $("input", f).focus(); }
  });
  $("#addEmbed").addEventListener("click", () => {
    if (state.embeds.length >= L.embeds) return;
    const e = Core.emptyEmbed(); e.color = 0x5865f2; state.embeds.push(e);
    renderEditor(); render();
    const cards = $$(".embed-card"); cards[cards.length - 1].scrollIntoView({ behavior: "smooth", block: "start" });
  });
  function load(p, msg) { state = Core.normalize(p); renderEditor(); render(); if (msg) toast(msg); }
  $("#sample").addEventListener("click", () => load(Core.SAMPLE, "Sample loaded"));
  $("#clear").addEventListener("click", () => { if (confirm("Clear the whole message?")) load({ embeds: [] }, "Cleared"); });
  $("#share").addEventListener("click", () => {
    const url = location.origin + location.pathname + "#d=" + Core.encodeShare(state);
    copy(url, url.length > 8000 ? "Link copied (very long, some apps may cut it)" : "Share link copied");
  });

  /* tabs + export */
  tabs($("#tabs"), (v) => { view = v; renderOutput(); });
  $("#copy").addEventListener("click", () => copy(output()));
  $("#dl").addEventListener("click", () => {
    const [name, type] = { json: ["message.json", "application/json"], djs: ["embed.js", "text/javascript"], dpy: ["embed.py", "text/x-python"], curl: ["send.sh", "text/x-shellscript"] }[view];
    download(name, output(), type);
  });

  /* import */
  const dlg = $("#importDlg");
  $("#import").addEventListener("click", () => { $("#importText").value = ""; dlg.showModal(); $("#importText").focus(); });
  $("#importFile").addEventListener("change", async (ev) => { const f = ev.target.files[0]; if (f) $("#importText").value = await f.text(); ev.target.value = ""; });
  $("#doImport").addEventListener("click", (ev) => {
    const r = Core.importJson($("#importText").value);
    if (!r.ok) { ev.preventDefault(); toast(r.error); return; }
    if (r.payload.embeds.length > L.embeds) toast(`Note: ${r.payload.embeds.length} embeds, Discord allows ${L.embeds}`);
    load(r.payload, "Imported");
  });

  /* drafts */
  function refreshDrafts(sel = "") {
    const d = store.get(K.drafts, {});
    $("#drafts").innerHTML = '<option value="">Autosaved</option>' + Object.keys(d).sort().map((n) => `<option ${n === sel ? "selected" : ""}>${esc(n)}</option>`).join("");
  }
  $("#saveDraft").addEventListener("click", () => {
    const name = (prompt("Draft name", $("#drafts").value || (state.embeds[0] && state.embeds[0].title) || "My message") || "").trim().slice(0, 60);
    if (!name) return;
    const d = store.get(K.drafts, {}); d[name] = Core.clean(state); store.set(K.drafts, d);
    refreshDrafts(name); toast(`Saved draft “${name}”`);
  });
  $("#drafts").addEventListener("change", (ev) => {
    const n = ev.target.value;
    if (!n) return load(store.get(K.auto, {}), "Autosave restored");
    load(store.get(K.drafts, {})[n] || {}, `Loaded “${n}”`);
  });
  $("#delDraft").addEventListener("click", () => {
    const n = $("#drafts").value; if (!n) return toast("Pick a saved draft first");
    const d = store.get(K.drafts, {}); delete d[n]; store.set(K.drafts, d); refreshDrafts(); toast(`Deleted “${n}”`);
  });

  /* webhook */
  const hook = $("#hook"), remember = $("#rememberHook");
  const savedHook = store.get(K.hook, null);
  if (savedHook) { hook.value = savedHook; remember.checked = true; }
  function hookStatus() {
    const v = hook.value.trim(), s = $("#hookStatus");
    s.className = "pill " + (!v ? "" : Core.isWebhookUrl(v) ? "ok" : "warn");
    s.textContent = !v ? "" : Core.isWebhookUrl(v) ? "Valid webhook URL" : "Doesn't look like a Discord webhook";
    if (remember.checked) store.set(K.hook, v);
    if (view === "curl") renderOutput();
  }
  hook.addEventListener("input", hookStatus);
  remember.addEventListener("change", () => { if (remember.checked) store.set(K.hook, hook.value.trim()); else { try { localStorage.removeItem("prism:" + K.hook); } catch {} toast("Webhook URL forgotten"); } });
  $("#showHook").addEventListener("change", (ev) => (hook.type = ev.target.checked ? "text" : "password"));
  $("#send").addEventListener("click", async () => {
    const url = hook.value.trim();
    if (!Core.isWebhookUrl(url)) { hook.focus(); return toast("Paste a valid Discord webhook URL first"); }
    const res = Core.validate(state);
    if (!res.ok) return toast("Fix the errors before sending");
    const btn = $("#send"); btn.disabled = true; btn.textContent = "Sending…";
    try {
      const r = await fetch(url + (url.includes("?") ? "&" : "?") + "wait=true", { method: "POST", headers: { "Content-Type": "application/json" }, body: Core.toJson(state, false) });
      if (r.ok) toast("✓ Message sent");
      else { let msg = `HTTP ${r.status}`; try { const j = await r.json(); msg += ": " + (j.message || "") + (j.errors ? " " + JSON.stringify(j.errors).slice(0, 160) : ""); } catch {} toast(msg); }
    } catch (e) { toast("Network error: " + e.message); }
    finally { btn.textContent = "Send message"; render(); }
  });

  window.addEventListener("hashchange", () => {
    const p = Core.decodeShare(location.hash);
    if (p) { history.replaceState(null, "", location.pathname + location.search); load(p, "Loaded message from share link"); }
  });

  /* go */
  refreshDrafts();
  renderEditor();
  render();
  hookStatus();
})();
