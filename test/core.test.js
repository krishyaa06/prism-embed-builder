const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../js/core.js");

const long = (n) => "x".repeat(n);

test("hex ↔ int color conversion", () => {
  assert.equal(C.hexToInt("#5865F2"), 0x5865f2);
  assert.equal(C.hexToInt("fff"), 0xffffff);
  assert.equal(C.hexToInt("nope"), null);
  assert.equal(C.intToHex(0x5865f2), "#5865F2");
  assert.equal(C.intToHex(0), "#000000");
  assert.equal(C.intToHex(null), "");
});

test("clean strips empty values and keeps Discord field order", () => {
  const p = { content: "", username: "Bot", embeds: [C.emptyEmbed(), { ...C.emptyEmbed(), title: "Hi", color: 0, fields: [{ name: "a", value: "b", inline: false }, { name: "", value: "", inline: true }] }] };
  assert.deepEqual(C.clean(p), { username: "Bot", embeds: [{ title: "Hi", color: 0, fields: [{ name: "a", value: "b" }] }] });
});

test("embedLength counts title, description, author, footer and fields", () => {
  const e = { title: "abc", description: "de", author: { name: "f" }, footer: { text: "gh" }, fields: [{ name: "i", value: "jk" }], url: "https://ignored.example" };
  assert.equal(C.embedLength(e), 11);
});

test("lengths count code points, so emoji count once", () => {
  assert.equal(C.len("🚀🚀"), 2);
  assert.equal(C.embedLength({ title: "🚀" }), 1);
});

test("validate passes the sample payload", () => {
  const r = C.validate(C.SAMPLE);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.equal(r.perEmbed.length, 1);
});

test("validate enforces title, description and content limits", () => {
  const r = C.validate({ content: long(2001), embeds: [{ title: long(257), description: long(4097) }] });
  const paths = r.issues.filter((i) => i.level === "error").map((i) => i.path);
  assert.ok(paths.includes("content"));
  assert.ok(paths.includes("embeds[0].title"));
  assert.ok(paths.includes("embeds[0].description"));
  assert.equal(r.ok, false);
});

test("validate warns when close to a limit", () => {
  const r = C.validate({ embeds: [{ title: long(240) }] });
  assert.equal(r.ok, true);
  assert.ok(r.issues.some((i) => i.level === "warn" && i.path === "embeds[0].title"));
});

test("validate enforces the 6000 character total across embeds", () => {
  const e = { description: long(4000) };
  const r = C.validate({ embeds: [e, e] });
  assert.equal(r.total, 8000);
  assert.ok(r.issues.some((i) => i.level === "error" && /6000/.test(i.msg)));
});

test("validate enforces embed and field counts and field limits", () => {
  const fields = Array.from({ length: 26 }, () => ({ name: "n", value: "v" }));
  fields[0] = { name: long(257), value: long(1025) };
  fields[1] = { name: "", value: "" };
  const r = C.validate({ embeds: [...Array(11)].map(() => ({ title: "t" })).map((e, i) => (i ? e : { ...e, fields })) });
  const msgs = r.issues.map((i) => i.path);
  assert.ok(msgs.includes("embeds"));
  assert.ok(msgs.includes("embeds[0].fields"));
  assert.ok(msgs.includes("embeds[0].fields[0].name"));
  assert.ok(msgs.includes("embeds[0].fields[0].value"));
  assert.ok(msgs.includes("embeds[0].fields[1].name"));
});

test("validate checks URLs, colors, timestamps, usernames and empty messages", () => {
  const r = C.validate({ username: "my discord bot", avatar_url: "ftp://x", embeds: [{ title: "t", image: { url: "not a url" }, color: 0x1000000, timestamp: "yesterday" }] });
  const paths = r.issues.map((i) => i.path);
  for (const p of ["username", "avatar_url", "embeds[0].image.url", "embeds[0].color", "embeds[0].timestamp"]) assert.ok(paths.includes(p), p);
  assert.equal(C.validate({}).ok, false);
  assert.ok(C.validate({ embeds: [{}] }).issues.some((i) => /empty/.test(i.msg)));
  assert.equal(C.isUrl("attachment://cat.png"), true);
});

test("webhook URL detection", () => {
  assert.equal(C.isWebhookUrl("https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz_-0123"), true);
  assert.equal(C.isWebhookUrl("https://canary.discord.com/api/v10/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz?thread_id=1"), true);
  assert.equal(C.isWebhookUrl("https://evil.example/api/webhooks/1/2"), false);
});

test("fieldRows groups inline fields three per row (two with thumbnail)", () => {
  const f = (inline) => ({ name: "a", value: "b", inline });
  assert.deepEqual(C.fieldRows([f(1), f(1), f(1), f(1), f(0), f(1)]).map((r) => r.length), [3, 1, 1, 1]);
  assert.deepEqual(C.fieldRows([f(1), f(1), f(1)], true).map((r) => r.length), [2, 1]);
});

test("importJson accepts payloads, single embeds, embed arrays and Discohook backups", () => {
  assert.equal(C.importJson('{"content":"hi"}').payload.content, "hi");
  assert.equal(C.importJson('{"title":"t","color":"#ff0000"}').payload.embeds[0].color, 0xff0000);
  assert.equal(C.importJson('[{"title":"a"},{"title":"b"}]').payload.embeds.length, 2);
  assert.equal(C.importJson({ messages: [{ data: { content: "x", embeds: [{ title: "y" }] } }] }).payload.embeds[0].title, "y");
  assert.equal(C.importJson("{oops").ok, false);
});

test("share links round-trip unicode payloads", () => {
  const p = { content: "héllo 🚀 'quotes'", embeds: [{ title: "Ünïcode", color: 0xabcdef, fields: [{ name: "a", value: "b", inline: true }] }] };
  const enc = C.encodeShare(p);
  assert.match(enc, /^[\w-]+$/);
  assert.deepEqual(C.clean(C.decodeShare("#d=" + enc)), C.clean(p));
  assert.equal(C.decodeShare("#nothing"), null);
});

test("toJson outputs the cleaned webhook body", () => {
  assert.equal(C.toJson({ content: "hi", embeds: [{ title: "" }] }, false), '{"content":"hi"}');
});

test("discord.js generator uses EmbedBuilder and WebhookClient", () => {
  const code = C.toDiscordJs(C.SAMPLE);
  assert.match(code, /new EmbedBuilder\(\)/);
  assert.match(code, /\.setColor\(0x5865F2\)/);
  assert.match(code, /\.setAuthor\(\{ name: "Prism Protocol Events", url: .*iconURL: /);
  assert.match(code, /\.addFields\(/);
  assert.match(code, /inline: true/);
  assert.match(code, /\.setTimestamp\(new Date\("2026-11-14T12:00:00.000Z"\)\)/);
  assert.match(code, /avatarURL: /);
  assert.match(code, /embeds: \[embed1\]/);
  // generated code must be syntactically valid JS
  assert.doesNotThrow(() => new Function("require", "process", `return (async () => {${code}})`));
});

test("discord.py generator uses discord.Embed and webhook.send", () => {
  const code = C.toDiscordPy(C.SAMPLE);
  assert.match(code, /embed1 = discord\.Embed\(/);
  assert.match(code, /color=0x5865F2/);
  assert.match(code, /embed1\.add_field\(name="🗓️ Starts", value="Nov 14, 2026", inline=True\)/);
  assert.match(code, /inline=False/);
  assert.match(code, /datetime\.fromisoformat\("2026-11-14T12:00:00\.000\+00:00"\)/);
  assert.match(code, /discord\.Webhook\.from_url/);
  assert.match(code, /username="Prism Protocol"/);
});

test("curl generator escapes single quotes and uses the webhook URL", () => {
  const c = C.toCurl({ content: "it's live" }, "https://discord.com/api/webhooks/1/abc");
  assert.match(c, /^curl -X POST "https:\/\/discord\.com\/api\/webhooks\/1\/abc"/);
  assert.ok(c.includes(`-d '{"content":"it'\\''s live"}'`));
  assert.match(C.toCurl({ content: "x" }), /webhooks\/ID\/TOKEN/);
});

test("markdown renders bold, italic, underline, strike and spoilers", () => {
  assert.equal(C.markdown("**b** *i* __u__ ~~s~~ ||x||"), '<strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <span class="spoiler">x</span>');
  assert.equal(C.markdown("***both***"), "<strong><em>both</em></strong>");
  assert.equal(C.markdown("_under_"), "<em>under</em>");
  assert.equal(C.markdown("snake_case_name"), "snake_case_name");
});

test("markdown keeps code literal and escapes HTML", () => {
  assert.equal(C.markdown("`**no**`"), '<code class="md-code">**no**</code>');
  assert.match(C.markdown("```js\nconst a = '<b>';\n```"), /<pre class="md-pre"><code data-lang="js">const a = &#39;&lt;b&gt;&#39;;<\/code><\/pre>/);
  const xss = C.markdown('<img src=x onerror="alert(1)"> [a](javascript:alert(1))');
  assert.ok(!xss.includes("<img"));
  assert.ok(!/href="javascript/.test(xss));
});

test("markdown renders links, mentions, headings, quotes and lists", () => {
  assert.equal(C.markdown("[**Docs**](https://discord.dev)"), '<a href="https://discord.dev" target="_blank" rel="noreferrer noopener"><strong>Docs</strong></a>');
  assert.match(C.markdown("see https://example.com."), /<a href="https:\/\/example\.com"[^>]*>https:\/\/example\.com<\/a>\.$/);
  assert.equal(C.markdown("<@123> <@&45> <#67> @here"), '<span class="mention">@user</span> <span class="mention">@role</span> <span class="mention">#channel</span> <span class="mention">@here</span>');
  assert.match(C.markdown("# Title\ntext"), /^<h3 class="md-h">Title<\/h3>text$/);
  assert.equal(C.markdown("> a\n> b\nc"), "<blockquote>a<br>b</blockquote>c");
  assert.equal(C.markdown("- one\n- two"), "<ul><li>one</li><li>two</li></ul>");
  assert.equal(C.markdown("line1\nline2"), "line1<br>line2");
});

test("inline markdown ignores block syntax (titles, field names)", () => {
  assert.equal(C.markdown("# not a heading\n**b**", { inline: true }), "# not a heading <strong>b</strong>");
});
