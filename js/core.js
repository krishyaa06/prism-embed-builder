/* Prism Embed Builder · core logic (browser + Node) */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Core = api;
})(typeof self !== "undefined" ? self : this, function () {
  const LIMITS = Object.freeze({
    content: 2000, username: 80, embeds: 10, title: 256, description: 4096,
    fields: 25, fieldName: 256, fieldValue: 1024, footer: 2048, author: 256, total: 6000,
  });

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  const str = (v) => (typeof v === "string" ? v : v == null ? "" : String(v));
  const len = (v) => [...str(v)].length; // count code points like Discord

  /* ───────── colors ───────── */
  function hexToInt(hex) {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str(hex).trim());
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return parseInt(h, 16);
  }
  function intToHex(n) {
    if (typeof n !== "number" || !Number.isFinite(n)) return "";
    return "#" + Math.max(0, Math.min(0xffffff, Math.round(n))).toString(16).padStart(6, "0").toUpperCase();
  }

  /* ───────── normalise / clean ───────── */
  function emptyEmbed() {
    return { title: "", url: "", description: "", color: null, author: { name: "", url: "", icon_url: "" },
      footer: { text: "", icon_url: "" }, timestamp: "", thumbnail: { url: "" }, image: { url: "" }, fields: [] };
  }
  function normalizeEmbed(e) {
    e = isObj(e) ? e : {};
    const out = emptyEmbed();
    out.title = str(e.title); out.url = str(e.url); out.description = str(e.description);
    if (typeof e.color === "number") out.color = e.color;
    else if (typeof e.color === "string") out.color = /^\d+$/.test(e.color) ? +e.color : hexToInt(e.color);
    if (isObj(e.author)) out.author = { name: str(e.author.name), url: str(e.author.url), icon_url: str(e.author.icon_url) };
    if (isObj(e.footer)) out.footer = { text: str(e.footer.text), icon_url: str(e.footer.icon_url) };
    out.timestamp = str(e.timestamp);
    if (isObj(e.thumbnail)) out.thumbnail = { url: str(e.thumbnail.url) };
    if (isObj(e.image)) out.image = { url: str(e.image.url) };
    if (Array.isArray(e.fields)) out.fields = e.fields.filter(isObj).map((f) => ({ name: str(f.name), value: str(f.value), inline: !!f.inline }));
    return out;
  }
  function normalize(p) {
    p = isObj(p) ? p : {};
    return { content: str(p.content), username: str(p.username), avatar_url: str(p.avatar_url),
      embeds: Array.isArray(p.embeds) ? p.embeds.map(normalizeEmbed) : [] };
  }
  /* Strip empty values → the exact JSON body Discord expects. */
  function cleanEmbed(e) {
    const o = {};
    if (e.title) o.title = e.title;
    if (e.url) o.url = e.url;
    if (e.description) o.description = e.description;
    if (typeof e.color === "number" && Number.isFinite(e.color)) o.color = e.color;
    const a = e.author || {};
    if (a.name || a.url || a.icon_url) { o.author = {}; if (a.name) o.author.name = a.name; if (a.url) o.author.url = a.url; if (a.icon_url) o.author.icon_url = a.icon_url; }
    if (e.thumbnail && e.thumbnail.url) o.thumbnail = { url: e.thumbnail.url };
    if (e.image && e.image.url) o.image = { url: e.image.url };
    const fields = (e.fields || []).filter((f) => f.name || f.value).map((f) => (f.inline ? { name: f.name, value: f.value, inline: true } : { name: f.name, value: f.value }));
    if (fields.length) o.fields = fields;
    const f = e.footer || {};
    if (f.text || f.icon_url) { o.footer = {}; if (f.text) o.footer.text = f.text; if (f.icon_url) o.footer.icon_url = f.icon_url; }
    if (e.timestamp) o.timestamp = e.timestamp;
    return o;
  }
  function clean(p) {
    p = normalize(p);
    const o = {};
    if (p.content) o.content = p.content;
    if (p.username) o.username = p.username;
    if (p.avatar_url) o.avatar_url = p.avatar_url;
    const embeds = p.embeds.map(cleanEmbed).filter((e) => Object.keys(e).length);
    if (embeds.length) o.embeds = embeds;
    return o;
  }

  /* Accepts: a webhook payload, a single embed, an array of embeds, or a Discohook-style backup. */
  function importJson(text) {
    let data;
    try { data = typeof text === "string" ? JSON.parse(text) : text; }
    catch (e) { return { ok: false, error: "Invalid JSON: " + e.message }; }
    if (isObj(data) && Array.isArray(data.messages) && data.messages[0]) data = data.messages[0].data || data.messages[0];
    if (isObj(data) && Array.isArray(data.backups) && data.backups[0]) return importJson(data.backups[0]);
    if (Array.isArray(data)) data = { embeds: data };
    else if (isObj(data) && !("embeds" in data) && !("content" in data) && ["title", "description", "fields", "author", "footer", "image", "color"].some((k) => k in data)) data = { embeds: [data] };
    else if (isObj(data) && isObj(data.embed)) data = { ...data, embeds: [data.embed] };
    if (!isObj(data)) return { ok: false, error: "Expected an object with content and/or embeds" };
    return { ok: true, payload: normalize(data) };
  }

  /* ───────── limits & validation ───────── */
  function embedLength(e) {
    e = normalizeEmbed(e);
    return len(e.title) + len(e.description) + len(e.author.name) + len(e.footer.text) +
      e.fields.reduce((s, f) => s + len(f.name) + len(f.value), 0);
  }
  function totalLength(p) { return normalize(p).embeds.reduce((s, e) => s + embedLength(e), 0); }
  const URL_RE = /^(https?:\/\/[^\s]+|attachment:\/\/[^\s]+)$/i;
  const isUrl = (u) => URL_RE.test(str(u).trim());
  const isTimestamp = (t) => /^\d{4}-\d{2}-\d{2}T/.test(t) && !Number.isNaN(Date.parse(t));
  const WEBHOOK_RE = /^https:\/\/(?:(?:canary|ptb)\.)?discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d{5,25}\/[\w-]{20,}\/?(?:\?.*)?$/;
  const isWebhookUrl = (u) => WEBHOOK_RE.test(str(u).trim());

  function validate(input) {
    const p = normalize(input), issues = [];
    const err = (path, msg) => issues.push({ level: "error", path, msg });
    const warn = (path, msg) => issues.push({ level: "warn", path, msg });
    const max = (path, v, lim, label) => { const n = len(v); if (n > lim) err(path, `${label} is ${n}/${lim} characters`); else if (n > lim * 0.9) warn(path, `${label} is close to the limit (${n}/${lim})`); };
    const url = (path, v, label) => { if (v && !isUrl(v)) err(path, `${label} must be an http(s) or attachment:// URL`); };

    max("content", p.content, LIMITS.content, "Content");
    if (p.username) {
      max("username", p.username, LIMITS.username, "Username");
      if (/discord|clyde/i.test(p.username)) err("username", 'Username cannot contain "discord" or "clyde"');
      if (/^(everyone|here)$/i.test(p.username.trim())) err("username", 'Username cannot be "everyone" or "here"');
    }
    url("avatar_url", p.avatar_url, "Avatar URL");
    if (p.embeds.length > LIMITS.embeds) err("embeds", `Too many embeds (${p.embeds.length}/${LIMITS.embeds})`);

    p.embeds.forEach((e, i) => {
      const at = `embeds[${i}]`, n = i + 1;
      max(`${at}.title`, e.title, LIMITS.title, `Embed ${n} title`);
      max(`${at}.description`, e.description, LIMITS.description, `Embed ${n} description`);
      max(`${at}.author.name`, e.author.name, LIMITS.author, `Embed ${n} author`);
      max(`${at}.footer.text`, e.footer.text, LIMITS.footer, `Embed ${n} footer`);
      url(`${at}.url`, e.url, `Embed ${n} title URL`);
      url(`${at}.author.url`, e.author.url, `Embed ${n} author URL`);
      url(`${at}.author.icon_url`, e.author.icon_url, `Embed ${n} author icon`);
      url(`${at}.footer.icon_url`, e.footer.icon_url, `Embed ${n} footer icon`);
      url(`${at}.thumbnail.url`, e.thumbnail.url, `Embed ${n} thumbnail`);
      url(`${at}.image.url`, e.image.url, `Embed ${n} image`);
      if (e.color != null && (!Number.isInteger(e.color) || e.color < 0 || e.color > 0xffffff)) err(`${at}.color`, `Embed ${n} color must be between 0 and 0xFFFFFF`);
      if (e.timestamp && !isTimestamp(e.timestamp)) err(`${at}.timestamp`, `Embed ${n} timestamp must be ISO 8601`);
      if (e.url && !e.title) warn(`${at}.url`, `Embed ${n} has a URL but no title, so it won't be clickable`);
      if ((e.author.url || e.author.icon_url) && !e.author.name) err(`${at}.author.name`, `Embed ${n} author needs a name`);
      if (e.footer.icon_url && !e.footer.text) err(`${at}.footer.text`, `Embed ${n} footer icon needs footer text`);
      if (e.fields.length > LIMITS.fields) err(`${at}.fields`, `Embed ${n} has too many fields (${e.fields.length}/${LIMITS.fields})`);
      e.fields.forEach((f, j) => {
        const fp = `${at}.fields[${j}]`, fl = `Embed ${n} field ${j + 1}`;
        if (!f.name.trim()) err(`${fp}.name`, `${fl} needs a name`);
        if (!f.value.trim()) err(`${fp}.value`, `${fl} needs a value`);
        max(`${fp}.name`, f.name, LIMITS.fieldName, `${fl} name`);
        max(`${fp}.value`, f.value, LIMITS.fieldValue, `${fl} value`);
      });
      if (!Object.keys(cleanEmbed(e)).filter((k) => k !== "color" && k !== "timestamp").length) err(at, `Embed ${n} is empty`);
    });

    const total = totalLength(p);
    if (total > LIMITS.total) err("embeds", `Embeds total ${total}/${LIMITS.total} characters`);
    else if (total > LIMITS.total * 0.9) warn("embeds", `Embeds total is close to the limit (${total}/${LIMITS.total})`);
    if (!p.content.trim() && !p.embeds.length) err("content", "Message needs content or at least one embed");

    return { ok: !issues.some((x) => x.level === "error"), issues, total, perEmbed: p.embeds.map(embedLength) };
  }

  /* Discord lays inline fields out up to 3 per row (2 when a thumbnail is present). */
  function fieldRows(fields, hasThumb = false) {
    const per = hasThumb ? 2 : 3, rows = [];
    let cur = null;
    (fields || []).forEach((f) => {
      if (f.inline) {
        if (!cur || cur.length >= per) { cur = []; rows.push(cur); }
        cur.push(f);
      } else { cur = null; rows.push([f]); }
    });
    return rows;
  }

  /* ───────── code generators ───────── */
  const q = (s) => JSON.stringify(str(s));
  const hexLit = (n) => "0x" + intToHex(n).slice(1);

  function toJson(p, pretty = true) { return JSON.stringify(clean(p), null, pretty ? 2 : 0); }

  function toDiscordJs(input) {
    const p = clean(input), embeds = p.embeds || [], L = [];
    const needsWebhook = !!(p.username || p.avatar_url);
    L.push(`const { ${embeds.length ? "EmbedBuilder, " : ""}WebhookClient } = require("discord.js");`, "");
    embeds.forEach((e, i) => {
      L.push(`const embed${i + 1} = new EmbedBuilder()`);
      if (e.title) L.push(`  .setTitle(${q(e.title)})`);
      if (e.url) L.push(`  .setURL(${q(e.url)})`);
      if (e.description) L.push(`  .setDescription(${q(e.description)})`);
      if (e.color != null) L.push(`  .setColor(${hexLit(e.color)})`);
      if (e.author) {
        const a = [`name: ${q(e.author.name)}`];
        if (e.author.url) a.push(`url: ${q(e.author.url)}`);
        if (e.author.icon_url) a.push(`iconURL: ${q(e.author.icon_url)}`);
        L.push(`  .setAuthor({ ${a.join(", ")} })`);
      }
      if (e.thumbnail) L.push(`  .setThumbnail(${q(e.thumbnail.url)})`);
      if (e.image) L.push(`  .setImage(${q(e.image.url)})`);
      if (e.fields) {
        L.push("  .addFields(");
        e.fields.forEach((f, j) => L.push(`    { name: ${q(f.name)}, value: ${q(f.value)}${f.inline ? ", inline: true" : ""} }${j < e.fields.length - 1 ? "," : ""}`));
        L.push("  )");
      }
      if (e.footer) L.push(`  .setFooter({ text: ${q(e.footer.text)}${e.footer.icon_url ? `, iconURL: ${q(e.footer.icon_url)}` : ""} })`);
      if (e.timestamp) L.push(`  .setTimestamp(new Date(${q(e.timestamp)}))`);
      L[L.length - 1] += ";";
      L.push("");
    });
    const opts = [];
    if (p.content) opts.push(`content: ${q(p.content)}`);
    if (p.username) opts.push(`username: ${q(p.username)}`);
    if (p.avatar_url) opts.push(`avatarURL: ${q(p.avatar_url)}`);
    if (embeds.length) opts.push(`embeds: [${embeds.map((_, i) => `embed${i + 1}`).join(", ")}]`);
    const body = opts.length ? `{\n  ${opts.join(",\n  ")},\n}` : "{}";
    L.push("// Send through a webhook (username / avatar overrides work here)");
    L.push('const webhook = new WebhookClient({ url: process.env.WEBHOOK_URL });');
    L.push(`await webhook.send(${body});`);
    if (!needsWebhook) {
      const ch = [];
      if (p.content) ch.push(`content: ${q(p.content)}`);
      if (embeds.length) ch.push(`embeds: [${embeds.map((_, i) => `embed${i + 1}`).join(", ")}]`);
      L.push("", "// Or from a bot, inside a command handler:", `// await interaction.reply({ ${ch.join(", ")} });`);
    }
    return L.join("\n") + "\n";
  }

  function toDiscordPy(input) {
    const p = clean(input), embeds = p.embeds || [], L = [];
    const hasTs = embeds.some((e) => e.timestamp);
    L.push("import aiohttp", "import discord");
    if (hasTs) L.push("from datetime import datetime");
    L.push("", 'WEBHOOK_URL = "https://discord.com/api/webhooks/ID/TOKEN"', "");
    embeds.forEach((e, i) => {
      const v = `embed${i + 1}`, args = [];
      if (e.title) args.push(`title=${q(e.title)}`);
      if (e.url) args.push(`url=${q(e.url)}`);
      if (e.description) args.push(`description=${q(e.description)}`);
      if (e.color != null) args.push(`color=${hexLit(e.color)}`);
      if (e.timestamp) args.push(`timestamp=datetime.fromisoformat(${q(e.timestamp.replace(/Z$/, "+00:00"))})`);
      L.push(args.length ? `${v} = discord.Embed(\n    ${args.join(",\n    ")},\n)` : `${v} = discord.Embed()`);
      if (e.author) {
        const a = [`name=${q(e.author.name)}`];
        if (e.author.url) a.push(`url=${q(e.author.url)}`);
        if (e.author.icon_url) a.push(`icon_url=${q(e.author.icon_url)}`);
        L.push(`${v}.set_author(${a.join(", ")})`);
      }
      if (e.thumbnail) L.push(`${v}.set_thumbnail(url=${q(e.thumbnail.url)})`);
      if (e.image) L.push(`${v}.set_image(url=${q(e.image.url)})`);
      (e.fields || []).forEach((f) => L.push(`${v}.add_field(name=${q(f.name)}, value=${q(f.value)}, inline=${f.inline ? "True" : "False"})`));
      if (e.footer) L.push(`${v}.set_footer(text=${q(e.footer.text)}${e.footer.icon_url ? `, icon_url=${q(e.footer.icon_url)}` : ""})`);
      L.push("");
    });
    const kw = [];
    if (p.content) kw.push(`content=${q(p.content)}`);
    if (p.username) kw.push(`username=${q(p.username)}`);
    if (p.avatar_url) kw.push(`avatar_url=${q(p.avatar_url)}`);
    if (embeds.length) kw.push(`embeds=[${embeds.map((_, i) => `embed${i + 1}`).join(", ")}]`);
    L.push("", "async def main():", "    async with aiohttp.ClientSession() as session:",
      "        webhook = discord.Webhook.from_url(WEBHOOK_URL, session=session)",
      kw.length ? `        await webhook.send(\n            ${kw.join(",\n            ")},\n        )` : "        await webhook.send()",
      "", "", "if __name__ == \"__main__\":", "    import asyncio", "    asyncio.run(main())");
    return L.join("\n").replace(/\n{3,}(?=async def)/, "\n\n") + "\n";
  }

  function toCurl(input, webhookUrl) {
    const body = JSON.stringify(clean(input)).replace(/'/g, "'\\''");
    const url = str(webhookUrl).trim() || "https://discord.com/api/webhooks/ID/TOKEN";
    return `curl -X POST "${url.replace(/"/g, "%22")}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'\n`;
  }

  /* ───────── share links ───────── */
  function b64encode(s) {
    const bytes = new TextEncoder().encode(s);
    let bin = "";
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64decode(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = atob(s);
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  }
  function encodeShare(p) { return b64encode(JSON.stringify(clean(p))); }
  function decodeShare(hash) {
    const m = /(?:^#?|&)d=([\w-]+)/.exec(str(hash));
    if (!m) return null;
    try { const r = importJson(b64decode(m[1])); return r.ok ? r.payload : null; } catch { return null; }
  }

  /* ───────── Discord markdown → HTML ───────── */
  const esc = (s) => str(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function fmtTime(sec, style) {
    const d = new Date(sec * 1000);
    if (Number.isNaN(d.getTime())) return "Invalid Date";
    const o = { t: { timeStyle: "short" }, T: { timeStyle: "medium" }, d: { dateStyle: "short" }, D: { dateStyle: "long" },
      f: { dateStyle: "long", timeStyle: "short" }, F: { dateStyle: "full", timeStyle: "short" } }[style || "f"];
    if (style === "R") {
      const diff = Math.round((d.getTime() - Date.now()) / 1000), a = Math.abs(diff);
      const [n, u] = a < 60 ? [a, "second"] : a < 3600 ? [a / 60, "minute"] : a < 86400 ? [a / 3600, "hour"] : a < 2592000 ? [a / 86400, "day"] : a < 31536000 ? [a / 2592000, "month"] : [a / 31536000, "year"];
      const v = Math.round(n), w = `${v} ${u}${v === 1 ? "" : "s"}`;
      return diff < 0 ? `${w} ago` : `in ${w}`;
    }
    return d.toLocaleString("en-US", o || {});
  }
  function inlineFmt(s) {
    return s
      .replace(/\|\|([\s\S]+?)\|\|/g, '<span class="spoiler">$1</span>')
      .replace(/\*\*\*([\s\S]+?)\*\*\*/g, "<strong><em>$1</em></strong>")
      .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__([\s\S]+?)__/g, "<u>$1</u>")
      .replace(/(^|[^\w*])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>")
      .replace(/(^|[^\w])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>")
      .replace(/~~([\s\S]+?)~~/g, "<s>$1</s>");
  }
  /**
   * markdown(text, { inline }) → safe HTML.
   * inline: true disables block syntax (headings, quotes, lists, code blocks), as in titles and field names.
   */
  function markdown(text, opts = {}) {
    const inline = !!opts.inline, slots = [];
    const put = (html) => `\u0000${slots.push(html) - 1}\u0000`;
    let s = str(text);
    if (!inline) s = s.replace(/```(?:([\w+#-]+)\n)?([\s\S]*?)```/g, (_, lang, code) => put(`<pre class="md-pre"><code${lang ? ` data-lang="${esc(lang)}"` : ""}>${esc(code.replace(/^\n|\n$/g, ""))}</code></pre>`));
    s = s.replace(/``([^`]+?)``|`([^`\n]+?)`/g, (_, a, b) => put(`<code class="md-code">${esc(a || b)}</code>`));
    s = s.replace(/<@!?(\d+)>/g, () => put('<span class="mention">@user</span>'))
      .replace(/<@&(\d+)>/g, () => put('<span class="mention">@role</span>'))
      .replace(/<#(\d+)>/g, () => put('<span class="mention">#channel</span>'))
      .replace(/<\/([\w-]+(?: [\w-]+){0,2}):(\d+)>/g, (_, n) => put(`<span class="mention">/${esc(n)}</span>`))
      .replace(/@(everyone|here)\b/g, (_, n) => put(`<span class="mention">@${n}</span>`))
      .replace(/<t:(-?\d+)(?::([tTdDfFR]))?>/g, (_, t, st) => put(`<span class="md-time">${esc(fmtTime(+t, st))}</span>`))
      .replace(/<(a?):(\w{2,32}):(\d+)>/g, (_, a, n, id) => put(`<img class="md-emoji" alt=":${esc(n)}:" src="https://cdn.discordapp.com/emojis/${id}.${a ? "gif" : "webp"}?size=44" />`));
    s = s.replace(/\[([^\]\n]+)\]\(<?(https?:\/\/[^\s)>]+)>?\)/g, (_, label, url) => put(`<a href="${esc(url)}" target="_blank" rel="noreferrer noopener">${inlineFmt(esc(label))}</a>`));
    s = s.replace(/<(https?:\/\/[^\s>]+)>|https?:\/\/[^\s<]+[^\s<.,:;"')\]!?]/g, (m, angled) => { const u = angled || m; return put(`<a href="${esc(u)}" target="_blank" rel="noreferrer noopener">${esc(u)}</a>`); });
    s = esc(s);
    let html;
    if (inline) html = inlineFmt(s).replace(/\n/g, " ");
    else {
      const out = [], lines = s.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let m;
        if ((m = /^(#{1,3}) (.+)$/.exec(line))) { out.push({ b: true, h: `<h${m[1].length + 2} class="md-h">${inlineFmt(m[2])}</h${m[1].length + 2}>` }); continue; }
        if ((m = /^-# (.+)$/.exec(line))) { out.push({ b: true, h: `<small class="md-sub">${inlineFmt(m[1])}</small>` }); continue; }
        if (/^&gt;&gt;&gt; /.test(line)) { out.push({ b: true, h: `<blockquote>${inlineFmt([line.slice(13), ...lines.slice(i + 1)].join("<br>"))}</blockquote>` }); break; }
        if (/^&gt; /.test(line)) {
          const q2 = [];
          while (i < lines.length && /^&gt; /.test(lines[i])) q2.push(inlineFmt(lines[i++].slice(5)));
          i--; out.push({ b: true, h: `<blockquote>${q2.join("<br>")}</blockquote>` }); continue;
        }
        if (/^\s*[-*] /.test(line)) {
          const li = [];
          while (i < lines.length && /^\s*[-*] /.test(lines[i])) li.push(`<li>${inlineFmt(lines[i++].replace(/^\s*[-*] /, ""))}</li>`);
          i--; out.push({ b: true, h: `<ul>${li.join("")}</ul>` }); continue;
        }
        out.push({ b: false, h: inlineFmt(line) });
      }
      html = out.map((x, i) => x.h + (!x.b && i < out.length - 1 ? "<br>" : "")).join("");
    }
    for (let k = 0; k < 5 && html.includes("\u0000"); k++) html = html.replace(/\u0000(\d+)\u0000/g, (_, n) => slots[+n]);
    return html;
  }

  const SAMPLE = {
    content: "Hey @everyone, **Prism Hack Week** registrations are open! 🚀",
    username: "Prism Protocol",
    avatar_url: "https://krishyaa06.github.io/prism-embed-builder/assets/logo.png",
    embeds: [{
      title: "Prism Hack Week · Season 3",
      url: "https://dc.gg/prismprotocol",
      description: "Build anything in **7 days**, ship it, and demo it live.\n\n> Build. Create. Compete.\n\n- Solo or teams of up to __4__\n- Mentors on call in <#1234567890>\n- Use `/register` to grab your spot\n\n||Secret bonus track drops on day 3||",
      color: 0x5865f2,
      author: { name: "Prism Protocol Events", url: "https://github.com/krishyaa06", icon_url: "https://krishyaa06.github.io/prism-embed-builder/assets/logo.png" },
      fields: [
        { name: "🗓️ Starts", value: "Nov 14, 2026", inline: true },
        { name: "⏱️ Duration", value: "7 days", inline: true },
        { name: "🏆 Prize pool", value: "$500 + swag", inline: true },
        { name: "📋 Rules", value: "Original work only. Any stack. Open-source your repo by the deadline.", inline: false },
      ],
      footer: { text: "Prism Protocol · Build. Create. Compete.", icon_url: "https://krishyaa06.github.io/prism-embed-builder/assets/logo.png" },
      timestamp: "2026-11-14T12:00:00.000Z",
    }],
  };

  return { LIMITS, hexToInt, intToHex, emptyEmbed, normalize, normalizeEmbed, clean, cleanEmbed, importJson,
    embedLength, totalLength, validate, isUrl, isWebhookUrl, fieldRows, toJson, toDiscordJs, toDiscordPy, toCurl,
    encodeShare, decodeShare, markdown, esc, len, SAMPLE };
});
