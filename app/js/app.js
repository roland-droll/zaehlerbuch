/* Zählerbuch – Ablesen von Wasseruhren und Ferraris-Stromzählern, ganz auf dem Gerät.
   Ablauf: Schablone (Rahmen über den Rollen, Kreise über den Zeigerrädchen) auf das Kamerabild legen, aufnehmen,
   die Ausschnitte im Worker durch die Ziffern-/Zeigermodelle rechnen, Stand prüfen, speichern (IndexedDB). */

const ARTEN = {
  wasser_kalt:    { text: "Kaltwasser",       einheit: "m³",  klasse: "wasser", schwarz: 5, rot: 3 },
  wasser_warm:    { text: "Warmwasser",       einheit: "m³",  klasse: "warm",   schwarz: 5, rot: 3 },
  strom_ferraris: { text: "Strom · Ferraris", einheit: "kWh", klasse: "strom",  schwarz: 6, rot: 1 },
  strom:          { text: "Strom",            einheit: "kWh", klasse: "strom",  schwarz: 6, rot: 1 },
};
// Beim ersten Start angelegt (die Zähler im Haus)
const ERSTE_ZAEHLER = [
  { name: "Wasseruhr Stadtwasser", art: "wasser_kalt" },
  { name: "Wasseruhr Warmwasser", art: "wasser_warm" },
  { name: "Wasseruhr Brunnen", art: "wasser_kalt" },
  { name: "Wasseruhr Kühlwasser", art: "wasser_kalt" },
  { name: "PV-Stromzähler", art: "strom_ferraris" },
];
const TAG = 86400000;
const ZEIGER_NAMEN = ["×0,1", "×0,01", "×0,001", "×0,0001"];

const $ = id => document.getElementById(id);
const S = { zaehler: new Map(), ablesungen: new Map(), ansicht: "liste", detailId: null, bearbeiteId: null, fotoUrls: new Map() };

/* ---------- kleine Helfer ---------- */
function h(tag, attrs, ...kinder) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kinder.flat()) { if (k == null || k === false) continue; el.append(k.nodeType ? k : String(k)); }
  return el;
}
const SVG = "http://www.w3.org/2000/svg";
function s(tag, attrs, text) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}
function abschneiden(v, n) { const f = 10 ** n; return Math.floor(v * f + 1e-7) / f; }
function zahlText(v, n, runden) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: n, maximumFractionDigits: n }).format(runden ? v : abschneiden(v, n));
}
function verbrauchText(v) { const a = Math.abs(v); return zahlText(v, a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3, true); }
function zahlLesen(t) {
  let x = String(t ?? "").trim().replace(/\s|'/g, "");
  if (!x) return NaN;
  if (x.includes(",") && x.includes(".")) x = x.replace(/\./g, "");
  x = x.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(x) ? Number(x) : NaN;
}
const datum = d => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
const datumKurz = d => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
const uhrzeit = d => new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
function lokalFeld(d) { const x = new Date(d); return new Date(x - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
const neueId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const art = z => ARTEN[z?.art] || ARTEN.wasser_kalt;
const klon = o => JSON.parse(JSON.stringify(o));
const begrenze = (v, a, b) => Math.min(b, Math.max(a, v));
function nk(z) { const sb = z?.schablone; return sb ? sb.rot + sb.zeiger.length : art(z).rot; }
function sortiert() { return [...S.zaehler.values()].sort((a, b) => (a.reihe ?? 99) - (b.reihe ?? 99) || String(a.name).localeCompare(String(b.name), "de")); }

let meldungUhr;
function meldung(t) {
  const m = $("meldung"); m.textContent = t; m.hidden = false;
  clearTimeout(meldungUhr); meldungUhr = setTimeout(() => (m.hidden = true), 3400);
}
function zweiStufen(knopf, text, aktion) {
  knopf.addEventListener("click", async () => {
    if (!knopf.dataset.scharf) {
      knopf.dataset.scharf = "1"; knopf.dataset.alt = knopf.textContent; knopf.textContent = text; knopf.classList.add("scharf");
      setTimeout(() => { if (knopf.isConnected && knopf.dataset.scharf) { delete knopf.dataset.scharf; knopf.textContent = knopf.dataset.alt; knopf.classList.remove("scharf"); } }, 4000);
      return;
    }
    delete knopf.dataset.scharf; knopf.textContent = knopf.dataset.alt; knopf.classList.remove("scharf");
    knopf.disabled = true;
    try { await aktion(); } catch (e) { console.error(e); meldung("Das hat nicht geklappt: " + (e.message || e)); }
    knopf.disabled = false;
  });
}

/* ---------- Speicher (IndexedDB) ---------- */
let dbVersprechen;
function db() {
  dbVersprechen ??= new Promise((ok, fehl) => {
    const r = indexedDB.open("zaehlerbuch", 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore("zaehler", { keyPath: "id" });
      d.createObjectStore("ablesungen", { keyPath: "id" }).createIndex("zaehler", "zaehlerId");
      d.createObjectStore("meta", { keyPath: "schluessel" });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fehl(r.error);
  });
  return dbVersprechen;
}
async function vorgang(store, modus, arbeit) {
  const d = await db();
  return new Promise((ok, fehl) => {
    const t = d.transaction(store, modus); const st = t.objectStore(store);
    let ergebnis;
    const r = arbeit(st);
    if (r) r.onsuccess = () => (ergebnis = r.result);
    t.oncomplete = () => ok(ergebnis);
    t.onerror = t.onabort = () => fehl(t.error);
  });
}
const alle = store => vorgang(store, "readonly", st => st.getAll());
const ablegen = (store, obj) => vorgang(store, "readwrite", st => st.put(obj));
const entfernen = (store, id) => vorgang(store, "readwrite", st => st.delete(id));

async function speichereZaehler(z) { await ablegen("zaehler", z); S.zaehler.set(z.id, z); }
async function speichereAblesung(a) { await ablegen("ablesungen", a); S.ablesungen.set(a.id, a); dauerhaft(); }
async function loescheAblesung(id) {
  await entfernen("ablesungen", id); S.ablesungen.delete(id);
  const u = S.fotoUrls.get(id); if (u) { URL.revokeObjectURL(u); S.fotoUrls.delete(id); }
}
function dauerhaft() { navigator.storage?.persist?.().catch(() => {}); }
function fotoUrl(a) {
  if (!(a.foto instanceof Blob)) return null;
  if (!S.fotoUrls.has(a.id)) S.fotoUrls.set(a.id, URL.createObjectURL(a.foto));
  return S.fotoUrls.get(a.id);
}

/* ---------- Auswertung ---------- */
function ablesungenVon(zid) {
  return [...S.ablesungen.values()].filter(a => a.zaehlerId === zid && Number.isFinite(a.stand)).sort((a, b) => new Date(a.zeit) - new Date(b.zeit));
}
function statistik(zid) {
  const liste = ablesungenVon(zid), perioden = [];
  let summe = 0, tage = 0;
  for (let i = 1; i < liste.length; i++) {
    const von = liste[i - 1], bis = liste[i], t = (new Date(bis.zeit) - new Date(von.zeit)) / TAG, diff = bis.stand - von.stand;
    perioden.push({ von, bis, diff, tage: t, proTag: t > 0 ? diff / t : null });
    if (diff >= 0 && t > 0) { summe += diff; tage += t; }
  }
  return { liste, perioden, letzte: liste[liste.length - 1] || null, proTag: tage >= 1 ? summe / tage : null };
}
function pruefe(zid, stand, zeit) {
  const w = [];
  if (!Number.isFinite(stand)) return w;
  const z = S.zaehler.get(zid), e = art(z).einheit, n = nk(z), t = new Date(zeit).getTime(), liste = ablesungenVon(zid);
  const vorher = [...liste].reverse().find(a => new Date(a.zeit).getTime() < t);
  const nachher = liste.find(a => new Date(a.zeit).getTime() > t);
  if (vorher && stand < vorher.stand) w.push(`Der Stand ist kleiner als am ${datum(vorher.zeit)} (${zahlText(vorher.stand, n)} ${e}). Lesefehler oder Zählerwechsel?`);
  if (nachher && stand > nachher.stand) w.push(`Der Stand ist größer als die spätere Ablesung vom ${datum(nachher.zeit)} (${zahlText(nachher.stand, n)} ${e}).`);
  const { proTag } = statistik(zid);
  if (vorher && stand >= vorher.stand && proTag > 0) {
    const tg = (t - new Date(vorher.zeit).getTime()) / TAG;
    if (tg >= 1) {
      const jetzt = (stand - vorher.stand) / tg;
      if (jetzt > 3 * proTag) w.push(`Ungewöhnlich hoher Verbrauch: ${verbrauchText(jetzt)} ${e} pro Tag seit ${datum(vorher.zeit)}, sonst im Schnitt ${verbrauchText(proTag)} ${e}. Ziffern bitte prüfen.`);
    }
  }
  return w;
}

/* ---------- Rollenzählwerk ---------- */
function rollen(stand, n, unsicher) {
  const box = h("span", { class: "rollen", role: "img" });
  if (stand == null || !Number.isFinite(stand)) {
    for (let i = 0; i < 5; i++) box.append(h("span", { class: "z leer" }, "0"));
    for (let i = 0; i < n; i++) box.append(h("span", { class: "z rot leer" }, "0"));
    box.setAttribute("aria-label", "noch kein Stand");
    return box;
  }
  const w = abschneiden(stand, n), ganz = Math.floor(w).toString().padStart(5, "0");
  const rest = n ? Math.round((w - Math.floor(w)) * 10 ** n).toString().padStart(n, "0").slice(0, n) : "";
  [...ganz].forEach(c => box.append(h("span", { class: "z" }, c)));
  [...rest].forEach(c => box.append(h("span", { class: "z rot" }, c)));
  if (unsicher) [...box.children].forEach((el, i) => { if (unsicher[i - (box.children.length - unsicher.length)]) el.classList.add("unsicher"); });
  box.setAttribute("aria-label", zahlText(stand, n));
  return box;
}

/* ---------- Ansichten ---------- */
function zeige(name) {
  if (S.ansicht === "ablesen" && name !== "ablesen") ablesenVerlassen();
  S.ansicht = name;
  for (const v of ["liste", "ablesen", "detail", "zaehler", "daten"]) $("v-" + v).hidden = v !== name;
  zeichne();
  window.scrollTo(0, 0);
}
function zeichne() {
  if (S.ansicht === "liste") zeichneListe();
  if (S.ansicht === "detail") zeichneDetail();
  if (S.ansicht === "daten") zeichneDaten();
}

function zeichneListe() {
  const alleZ = sortiert();
  $("liste").replaceChildren(...(alleZ.length ? alleZ.map(z => {
    const a = art(z), n = nk(z), st = statistik(z.id), meta = [];
    if (st.letzte) meta.push(`abgelesen ${datum(st.letzte.zeit)}`);
    if (st.proTag != null) meta.push(`Ø ${verbrauchText(st.proTag)} ${a.einheit}/Tag`, `≈ ${verbrauchText(st.proTag * 365)} ${a.einheit}/Jahr`);
    return h("article", { class: "karte" },
      h("div", { class: "karte-kopf" }, h("span", { class: "chip " + a.klasse }, a.text), h("h2", {}, z.name || "Ohne Namen"),
        z.nummer && h("span", { class: "nr" }, "Nr. " + z.nummer)),
      h("div", { class: "zaehlwerk" }, rollen(st.letzte?.stand, n), h("span", { class: "einheit" }, a.einheit)),
      h("div", { class: "meta" }, meta.length ? meta.join(" · ") : h("span", { class: "kein-stand" }, z.schablone ? "Noch nicht abgelesen" : "Noch nicht abgelesen, beim ersten Mal die Schablone einstellen")),
      h("div", { class: "knopfreihe" },
        h("button", { class: "knopf primaer", type: "button", onclick: () => oeffneAblesen(z.id) }, "Ablesen"),
        h("button", { class: "knopf", type: "button", onclick: () => { S.detailId = z.id; zeige("detail"); } }, `Verlauf (${st.liste.length})`)));
  }) : [h("p", { class: "hinweistext" }, "Noch kein Zähler. Lege mit „+ Zähler“ einen an.")]));
}

function zeichneDetail() {
  const v = $("v-detail"), z = S.zaehler.get(S.detailId);
  const zurueck = h("button", { class: "knopf leise zurueck", type: "button", onclick: () => zeige("liste") }, "← Übersicht");
  if (!z) { v.replaceChildren(zurueck, h("p", { class: "hinweistext" }, "Dieser Zähler ist nicht mehr vorhanden.")); return; }
  const a = art(z), n = nk(z), st = statistik(z.id), letzterZeitraum = st.perioden[st.perioden.length - 1];
  const kz = (wert, text) => h("div", { class: "kz" }, h("b", {}, wert), h("span", {}, text));
  const zeilen = [...st.liste].reverse().map(ab => {
    const i = st.liste.indexOf(ab), p = i > 0 ? st.perioden[i - 1] : null, url = fotoUrl(ab);
    const loesch = h("button", { class: "knopf leise", type: "button" }, "Löschen");
    zweiStufen(loesch, "Wirklich?", async () => { await loescheAblesung(ab.id); zeichne(); });
    const quelle = ab.quelle === "erkannt"
      ? h("span", { class: "chip " + (ab.erkennung?.korrigiert ? "warn" : "ok") }, ab.erkennung?.korrigiert ? "erkannt, korrigiert" : "erkannt")
      : h("span", { class: "chip grau" }, ab.quelle === "foto" ? "Foto, von Hand" : "von Hand");
    return h("tr", {},
      h("td", {}, url ? h("img", { class: "daumen", src: url, alt: "Belegfoto " + datum(ab.zeit), onclick: () => gross(url) }) : h("div", { class: "daumen-leer" })),
      h("td", {}, datum(ab.zeit), h("br"), h("span", { class: "nr" }, uhrzeit(ab.zeit))),
      h("td", { class: "zahl" }, h("b", {}, zahlText(ab.stand, n))),
      h("td", { class: "zahl" }, p ? `${p.diff >= 0 ? "+" : ""}${verbrauchText(p.diff)}` : "–", p && h("br"), p && h("span", { class: "nr" }, `${Math.round(p.tage)} Tage`)),
      h("td", {}, quelle, ab.notiz && h("div", { class: "nr" }, ab.notiz)),
      h("td", { class: "zahl" }, loesch));
  });
  v.replaceChildren(zurueck,
    h("div", { class: "karte-kopf" }, h("span", { class: "chip " + a.klasse }, a.text), h("h2", {}, z.name),
      z.nummer && h("span", { class: "nr" }, "Nr. " + z.nummer), z.ort && h("span", { class: "nr" }, "· " + z.ort), z.konstante && h("span", { class: "nr" }, "· " + z.konstante)),
    h("div", { class: "zaehlwerk" }, rollen(st.letzte?.stand, n), h("span", { class: "einheit" }, a.einheit)),
    h("div", { class: "knopfreihe" },
      h("button", { class: "knopf primaer", type: "button", onclick: () => oeffneAblesen(z.id) }, "Ablesen"),
      h("button", { class: "knopf", type: "button", onclick: () => oeffneZaehler(z.id) }, "Zähler bearbeiten")),
    h("div", { class: "kennzahlen" },
      kz(st.letzte ? `${zahlText(st.letzte.stand, n)} ${a.einheit}` : "–", st.letzte ? "Stand " + datum(st.letzte.zeit) : "noch kein Stand"),
      kz(letzterZeitraum ? `${verbrauchText(letzterZeitraum.diff)} ${a.einheit}` : "–", letzterZeitraum ? `in ${Math.round(letzterZeitraum.tage)} Tagen` : "letzter Zeitraum"),
      kz(st.proTag != null ? `${verbrauchText(st.proTag)} ${a.einheit}` : "–", "Ø pro Tag"),
      kz(st.proTag != null ? `${verbrauchText(st.proTag * 365)} ${a.einheit}` : "–", "hochgerechnet aufs Jahr")),
    diagramm(st, a),
    zeilen.length
      ? h("div", { class: "tabelle-huelle" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", {}, "Beleg"), h("th", {}, "Datum"), h("th", { class: "zahl" }, "Stand " + a.einheit), h("th", { class: "zahl" }, "Verbrauch"), h("th", {}, "Quelle"), h("th", {}))),
          h("tbody", {}, zeilen)))
      : h("p", { class: "hinweistext" }, "Noch keine Ablesung."));
}

function diagramm(st, a) {
  const box = h("div", { class: "panel diagramm" }, h("h3", {}, `Verbrauch pro Tag je Ablesezeitraum (${a.einheit})`));
  const per = st.perioden.filter(p => p.proTag != null && p.diff >= 0 && p.tage > 0).slice(-12);
  if (!per.length) { box.append(h("p", { class: "hinweistext" }, "Ab zwei Ablesungen zeigt sich hier der Verbrauch.")); return box; }
  const B = 600, H = 220, L = 48, R = 12, O = 14, U = 30;
  const max = Math.max(...per.map(p => p.proTag), st.proTag || 0) || 1;
  const schritt = schoen(max / 4), oben = Math.ceil(max / schritt) * schritt, y = v => O + (H - O - U) * (1 - v / oben);
  const farbe = a.klasse === "strom" ? "var(--strom)" : a.klasse === "warm" ? "var(--warm)" : "var(--accent)";
  const svg = s("svg", { viewBox: `0 0 ${B} ${H}`, role: "img", "aria-label": "Verbrauch pro Tag je Zeitraum" });
  for (let v = 0; v <= oben + 1e-9; v += schritt) {
    svg.append(s("line", { x1: L, x2: B - R, y1: y(v), y2: y(v), class: "achse" }));
    svg.append(s("text", { x: L - 6, y: y(v) + 4, "text-anchor": "end" }, verbrauchText(v)));
  }
  const breite = (B - L - R) / per.length;
  per.forEach((p, i) => {
    const x = L + i * breite + breite * 0.18, w = breite * 0.64;
    const r = s("rect", { x, y: y(p.proTag), width: w, height: Math.max(1, y(0) - y(p.proTag)), rx: 2, fill: farbe, opacity: i === per.length - 1 ? 1 : 0.5 });
    r.append(s("title", {}, `${datum(p.von.zeit)} bis ${datum(p.bis.zeit)}: ${verbrauchText(p.proTag)} ${a.einheit}/Tag`));
    svg.append(r);
    if (per.length <= 8 || i % Math.ceil(per.length / 8) === 0 || i === per.length - 1)
      svg.append(s("text", { x: x + w / 2, y: H - 10, "text-anchor": "middle" }, datumKurz(p.bis.zeit)));
  });
  if (st.proTag != null) {
    svg.append(s("line", { x1: L, x2: B - R, y1: y(st.proTag), y2: y(st.proTag), class: "schnitt" }));
    svg.append(s("text", { x: B - R, y: y(st.proTag) - 5, "text-anchor": "end" }, `Ø ${verbrauchText(st.proTag)}`));
  }
  box.append(svg);
  return box;
}
function schoen(x) { const p = 10 ** Math.floor(Math.log10(x)), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function gross(src) { $("gross-img").src = src; $("gross").hidden = false; }
$("gross").addEventListener("click", () => ($("gross").hidden = true));

/* ---------- Zähler anlegen / bearbeiten ---------- */
function oeffneZaehler(id) {
  S.bearbeiteId = id || null;
  const z = id ? S.zaehler.get(id) : null;
  $("z-titel").textContent = z ? "Zähler bearbeiten" : "Zähler anlegen";
  $("z-name").value = z?.name || "";
  $("z-art").value = z?.art || "wasser_kalt";
  $("z-nummer").value = z?.nummer || "";
  $("z-ort").value = z?.ort || "";
  $("z-einheit").value = z?.einheit || ARTEN[$("z-art").value].einheit;
  $("z-konstante").value = z?.konstante || "";
  $("z-loeschen").hidden = !z;
  $("z-konstante-feld").hidden = $("z-art").value !== "strom_ferraris";
  zeige("zaehler");
}
$("z-art").addEventListener("change", () => {
  $("z-einheit").value = ARTEN[$("z-art").value].einheit;
  $("z-konstante-feld").hidden = $("z-art").value !== "strom_ferraris";
});
$("z-form").addEventListener("submit", async e => {
  e.preventDefault();
  const name = $("z-name").value.trim();
  if (!name) { $("z-name").focus(); meldung("Bitte eine Bezeichnung eingeben."); return; }
  const alt = S.bearbeiteId ? S.zaehler.get(S.bearbeiteId) : null;
  const z = {
    ...(alt || { id: neueId(), reihe: S.zaehler.size + 1, erstellt: new Date().toISOString() }),
    name, art: $("z-art").value, nummer: $("z-nummer").value.trim(), ort: $("z-ort").value.trim(),
    einheit: $("z-einheit").value.trim() || ARTEN[$("z-art").value].einheit,
    konstante: $("z-art").value === "strom_ferraris" ? $("z-konstante").value.trim() : "",
  };
  try { await speichereZaehler(z); meldung(alt ? "Zähler gespeichert" : "Zähler angelegt"); S.detailId = z.id; zeige(alt ? "detail" : "liste"); }
  catch (err) { meldung("Speichern fehlgeschlagen: " + err.message); }
});
zweiStufen($("z-loeschen"), "Mit allen Ablesungen löschen?", async () => {
  const id = S.bearbeiteId;
  for (const a of ablesungenVon(id)) await loescheAblesung(a.id);
  await entfernen("zaehler", id); S.zaehler.delete(id);
  meldung("Zähler gelöscht"); zeige("liste");
});

/* ---------- Daten: Sicherung, Export ---------- */
async function zeichneDaten() {
  const el = $("d-speicher"), teile = [`${S.zaehler.size} Zähler, ${S.ablesungen.size} Ablesungen.`];
  try {
    const sch = await navigator.storage?.estimate?.();
    if (sch?.usage != null) teile.push(`Belegt: ${(sch.usage / 1048576).toFixed(1)} MB.`);
    const fest = await navigator.storage?.persisted?.();
    if (fest === false) teile.push("Der Browser darf die Daten bei Speichermangel löschen. Als App auf dem Startbildschirm installiert ist das sicherer; die Sicherung schützt in jedem Fall.");
  } catch {}
  el.textContent = teile.join(" ");
}
async function speichereDatei(name, blob) {
  const datei = new File([blob], name, { type: blob.type });
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && navigator.canShare?.({ files: [datei] })) {
    try { await navigator.share({ files: [datei], title: name }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const heute = () => new Date().toISOString().slice(0, 10);
function blobZuText(b) { return new Promise((ok, fehl) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => fehl(r.error); r.readAsDataURL(b); }); }
$("d-sichern").addEventListener("click", async () => {
  const abl = [];
  for (const a of S.ablesungen.values()) abl.push({ ...a, foto: a.foto instanceof Blob ? await blobZuText(a.foto) : null });
  const daten = { format: "zaehlerbuch", version: 1, erstellt: new Date().toISOString(), zaehler: [...S.zaehler.values()], ablesungen: abl };
  await speichereDatei(`Zaehlerbuch_Sicherung_${heute()}.json`, new Blob([JSON.stringify(daten)], { type: "application/json" }));
});
$("d-laden").addEventListener("change", async e => {
  const f = e.target.files?.[0]; e.target.value = "";
  if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.format !== "zaehlerbuch" || !Array.isArray(d.zaehler) || !Array.isArray(d.ablesungen)) throw new Error("Das ist keine Zählerbuch-Sicherung.");
    for (const z of d.zaehler) if (z && z.id) await speichereZaehler(z);
    for (const a of d.ablesungen) {
      if (!a || !a.id) continue;
      const foto = typeof a.foto === "string" && a.foto.startsWith("data:") ? await (await fetch(a.foto)).blob() : null;
      await speichereAblesung({ ...a, foto });
    }
    meldung(`Sicherung geladen: ${d.zaehler.length} Zähler, ${d.ablesungen.length} Ablesungen`);
    zeichne();
  } catch (err) { meldung("Laden fehlgeschlagen: " + err.message); }
});
$("d-csv").addEventListener("click", async () => {
  const zeilen = [["Zähler", "Zählernummer", "Art", "Einheit", "Datum", "Uhrzeit", "Stand", "Verbrauch seit vorher", "Tage", "Quelle", "Notiz"]];
  for (const z of sortiert()) {
    const st = statistik(z.id), n = nk(z);
    st.liste.forEach((a, i) => {
      const p = i ? st.perioden[i - 1] : null;
      zeilen.push([z.name, z.nummer || "", art(z).text, art(z).einheit, datum(a.zeit), uhrzeit(a.zeit), zahlText(a.stand, n).replace(/\./g, ""),
        p ? zahlText(p.diff, n, true).replace(/\./g, "") : "", p ? String(Math.round(p.tage)) : "",
        a.quelle === "erkannt" ? (a.erkennung?.korrigiert ? "erkannt, korrigiert" : "erkannt") : a.quelle === "foto" ? "Foto, von Hand" : "von Hand", a.notiz || ""]);
    });
  }
  if (zeilen.length < 2) { meldung("Noch keine Ablesungen zum Exportieren."); return; }
  const text = "﻿" + zeilen.map(r => r.map(f => /[;"\n]/.test(f) ? `"${String(f).replace(/"/g, '""')}"` : f).join(";")).join("\r\n");
  await speichereDatei(`Zaehlerstaende_${heute()}.csv`, new Blob([text], { type: "text/csv" }));
});

/* =====================================================================
   Ablesen
   ===================================================================== */
const leinwand = $("leinwand"), video = $("video"), buehne = $("buehne");
const A = {
  zid: null, schab: null, modus: "leer", bild: null, ansicht: { zoom: 1, ox: 0, oy: 0 },
  stream: null, licht: false, ergebnis: null, handEingabe: false, fotoQuelle: null, auftrag: 0,
  // Automatik: Rollenreihe suchen und Rahmen darauf legen
  auto: true, zaehlFest: false, sucheOffen: false, letzterTreffer: null, stabil: 0, zaehlVerlauf: [],
};

function standardSchablone(z) {
  const a = art(z), n = a.schwarz + a.rot;
  return { schwarz: a.schwarz, rot: a.rot, hoehe: +(1.5 / n).toFixed(3), zeiger: [], lage: { cx: 0.5, cy: 0.35, bw: 0.8, winkel: 0 } };
}

// Erkenner-Worker
let erkenner = null;
const offeneAuftraege = new Map();
function erkennerHolen() {
  if (erkenner) return erkenner;
  erkenner = new Worker("js/erkenner.js");
  erkenner.onmessage = e => { const f = offeneAuftraege.get(e.data.id); offeneAuftraege.delete(e.data.id); f?.(e.data); };
  erkenner.onerror = e => { console.error(e); for (const f of offeneAuftraege.values()) f({ fehler: "Erkennung konnte nicht geladen werden." }); offeneAuftraege.clear(); };
  return erkenner;
}

function oeffneAblesen(zid) {
  const sel = $("a-zaehler"), alleZ = sortiert();
  if (!alleZ.length) { oeffneZaehler(); return; }
  sel.replaceChildren(...alleZ.map(z => h("option", { value: z.id }, z.name + (z.nummer ? " · Nr. " + z.nummer : ""))));
  sel.value = zid && S.zaehler.has(zid) ? zid : alleZ[0].id;
  zeige("ablesen");
  zaehlerWaehlen();
  erkennerHolen();
}
function zaehlerWaehlen() {
  const z = S.zaehler.get($("a-zaehler").value);
  A.zid = z.id;
  A.schab = klon(z.schablone || standardSchablone(z));
  A.zaehlFest = !!z.schablone;   // gespeicherte Schablone: Rollenzahl steht fest, nur Lage und Größe folgen
  A.auto = true; autoKnopf();
  $("schablone").open = false;
  schabloneAnzeigen();
  neueAufnahme();
}
$("a-zaehler").addEventListener("change", zaehlerWaehlen);

function neueAufnahme() {
  A.bild = null; A.ergebnis = null; A.handEingabe = false; A.fotoQuelle = null; A.ansicht = { zoom: 1, ox: 0, oy: 0 };
  $("erkannt").hidden = true;
  $("a-stand").value = ""; $("a-notiz").value = ""; $("a-zeit").value = lokalFeld(Date.now());
  $("w-neu").hidden = true; $("w-zoom").hidden = true; $("w-ausrichten").hidden = true;
  A.letzterTreffer = null; A.stabil = 0; A.zaehlVerlauf = [];
  standHinweis(); pruefeEingabe();
  kameraStart();
}
function ablesenVerlassen() { kameraStopp(); A.bild = null; }

/* ---------- Kamera ---------- */
async function kameraStart() {
  kameraStopp();
  A.modus = "leer";
  buehnenHinweis("Kamera wird gestartet …");
  $("w-aufnehmen").hidden = false;   // der Auslöser ist immer da: ohne Live-Bild öffnet er die Kamera-App
  zeichneBuehne();
  if (!navigator.mediaDevices?.getUserMedia) {
    kameraFehlt(window.isSecureContext ? "Dieses Gerät bietet keine Live-Kamera." : "Live-Kamera nur über HTTPS oder als installierte App.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } } });
    if (S.ansicht !== "ablesen" || A.bild) { stream.getTracks().forEach(t => t.stop()); return; }
    A.stream = stream;
    video.srcObject = stream; video.hidden = false;
    video.play().catch(() => {});   // nicht abwarten: manche Handys melden das Abspielen nie
    A.modus = "live";
    $("w-foto-label").hidden = true;
    const spur = stream.getVideoTracks()[0], kann = spur.getCapabilities?.() || {};
    $("w-licht").hidden = !kann.torch;
    if (kann.focusMode?.includes?.("continuous")) spur.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
    buehnenHinweis(A.auto ? "Zählwerk wird gesucht …" : "Rollen in den Rahmen bringen, je Rolle ein Feld.");
    zeichneBuehne();
  } catch (e) {
    kameraFehlt(e.name === "NotAllowedError" ? "Kamerazugriff wurde nicht erlaubt." : "Die Kamera ließ sich nicht starten.");
  }
}
function kameraFehlt(text) {
  A.modus = "leer";
  $("w-foto-label").hidden = false; $("w-licht").hidden = true;
  buehnenHinweis(text + " Der Auslöser öffnet die Kamera-App, danach wird die Ziffernreihe im Foto gesucht.");
  zeichneBuehne();
}
function kameraStopp() {
  A.stream?.getTracks().forEach(t => t.stop());
  A.stream = null; A.licht = false;
  video.srcObject = null; video.hidden = true;
  $("w-licht").setAttribute("aria-pressed", "false");
}
$("w-licht").addEventListener("click", async () => {
  const spur = A.stream?.getVideoTracks()[0];
  if (!spur) return;
  try { A.licht = !A.licht; await spur.applyConstraints({ advanced: [{ torch: A.licht }] }); $("w-licht").setAttribute("aria-pressed", String(A.licht)); }
  catch { meldung("Das Licht lässt sich hier nicht schalten."); }
});
document.addEventListener("visibilitychange", () => {
  if (S.ansicht !== "ablesen") return;
  if (document.hidden) kameraStopp();
  else if (!A.bild) kameraStart();
});
function buehnenHinweis(t) { const el = $("buehne-hinweis"); el.textContent = t || ""; el.hidden = !t; }

// genau den sichtbaren Teil des Videos (object-fit: cover), damit die Schablone passt; maxSeite verkleinert
function videoBild(maxSeite) {
  const bw = buehne.clientWidth, bh = buehne.clientHeight, vw = video.videoWidth, vh = video.videoHeight;
  const f = Math.max(bw / vw, bh / vh), sw = bw / f, sh = bh / f, k = maxSeite ? Math.min(1, maxSeite / Math.max(sw, sh)) : 1;
  const c = h("canvas"); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  c.getContext("2d", { willReadFrequently: !!maxSeite }).drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
  return c;
}
$("w-aufnehmen").addEventListener("click", () => {
  if (A.modus === "bild") return;
  if (A.modus !== "live") { $("w-foto").click(); return; }
  if (!video.videoWidth) { meldung("Die Kamera startet noch, gleich noch einmal tippen."); return; }
  const c = videoBild();
  kameraStopp();
  A.fotoQuelle = "kamera";
  bildUebernehmen(c);
  $("a-zeit").value = lokalFeld(Date.now());
});
for (const id of ["w-foto", "w-galerie"]) {
  $(id).addEventListener("change", async e => {
    const datei = e.target.files?.[0]; e.target.value = "";
    if (datei) await bildDateiLaden(datei, id === "w-galerie");
  });
}
async function bildDateiLaden(datei, ausGalerie) {
  try {
    let quelle;
    try { quelle = await createImageBitmap(datei, { imageOrientation: "from-image" }); }
    catch { quelle = await new Promise((ok, fehl) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fehl(new Error("Bild lässt sich nicht öffnen")); i.src = URL.createObjectURL(datei); }); }
    const w = quelle.width, hh = quelle.height, f = Math.min(1, 3200 / Math.max(w, hh));
    const c = h("canvas"); c.width = Math.round(w * f); c.height = Math.round(hh * f);
    c.getContext("2d").drawImage(quelle, 0, 0, c.width, c.height);
    kameraStopp();
    A.fotoQuelle = "datei";
    bildUebernehmen(c);
    $("a-zeit").value = lokalFeld(ausGalerie && datei.lastModified ? datei.lastModified : Date.now());
  } catch (err) { meldung(err.message || "Bild lässt sich nicht öffnen."); }
}
function bildUebernehmen(canvas) {
  const stufen = [canvas];
  while (Math.max(stufen.at(-1).width, stufen.at(-1).height) > 300) {
    const v = stufen.at(-1), n = h("canvas");
    n.width = Math.max(1, Math.round(v.width / 2)); n.height = Math.max(1, Math.round(v.height / 2));
    const g = n.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(v, 0, 0, n.width, n.height);
    stufen.push(n);
  }
  A.bild = { quelle: canvas, stufen, W: canvas.width, H: canvas.height };
  A.modus = "bild"; A.ansicht = { zoom: 1, ox: 0, oy: 0 }; A.handEingabe = false;
  $("w-aufnehmen").hidden = true; $("w-neu").hidden = false; $("w-zoom").hidden = false; $("w-ausrichten").hidden = false;
  buehnenHinweis("");
  zeichneBuehne();
  if (A.auto) standbildSuchen(); else erkennen();
}
$("w-neu").addEventListener("click", neueAufnahme);

/* ---------- Automatik: Rollenreihe finden ---------- */
function autoKnopf() {
  $("w-auto").setAttribute("aria-pressed", String(A.auto));
  $("w-auto").textContent = A.auto ? "Automatik" : "Automatik aus";
}
$("w-auto").addEventListener("click", () => {
  A.auto = !A.auto; autoKnopf();
  A.letzterTreffer = null; A.stabil = 0;
  if (A.modus === "live") buehnenHinweis(A.auto ? "Zählwerk wird gesucht …" : "Rollen in den Rahmen bringen, je Rolle ein Feld.");
  if (A.auto && A.modus === "bild") standbildSuchen();
});
$("w-ausrichten").addEventListener("click", () => { A.auto = true; autoKnopf(); standbildSuchen(); });

const erwarteteRollen = () => (A.zaehlFest ? A.schab.schwarz + A.schab.rot : null);
let sucheNr = 0;
function suchen(canvas, pruefen) {
  const g = canvas.getContext("2d", { willReadFrequently: true });
  const daten = g.getImageData(0, 0, canvas.width, canvas.height);
  const id = -(++sucheNr);   // eigene (negative) Nummern, damit laufende Erkennungen gültig bleiben
  return new Promise(ok => {
    offeneAuftraege.set(id, ok);
    erkennerHolen().postMessage({ id, typ: "suchen", rgba: daten.data, W: canvas.width, H: canvas.height, erwartet: erwarteteRollen(), pruefen }, [daten.data.buffer]);
  });
}
// Treffer auf die Schablone übertragen; live erst nach zwei passenden Funden hintereinander und geglättet
function trefferUebernehmen(t, live) {
  const L = A.schab.lage;
  if (live) {
    const v = A.letzterTreffer;
    A.stabil = v && Math.abs(v.cx - t.cx) < 0.06 && Math.abs(v.cy - t.cy) < 0.06 && Math.abs(t.bw / v.bw - 1) < 0.2 ? A.stabil + 1 : 0;
    A.letzterTreffer = t;
    if (A.stabil < 1) return false;
  }
  const a = live ? 0.55 : 1;
  L.cx += a * (t.cx - L.cx); L.cy += a * (t.cy - L.cy); L.bw += a * (t.bw - L.bw);
  L.winkel = Math.round((L.winkel + a * (t.winkel - L.winkel)) * 2) / 2;
  A.schab.hoehe += a * (t.hoehe - A.schab.hoehe);
  if (!A.zaehlFest) {
    // Rollenzahl aus den letzten Funden (häufigster Wert), damit sie nicht springt
    A.zaehlVerlauf.push(t.n + "/" + t.rot);
    if (A.zaehlVerlauf.length > 6) A.zaehlVerlauf.shift();
    const zaehl = {};
    for (const x of (live ? A.zaehlVerlauf : [t.n + "/" + t.rot])) zaehl[x] = (zaehl[x] || 0) + 1;
    const [n, rot] = Object.entries(zaehl).sort((x, y) => y[1] - x[1])[0][0].split("/").map(Number);
    A.schab.rot = Math.min(rot, n - 1); A.schab.schwarz = n - A.schab.rot;
  }
  schabloneAnzeigen();
  zeichneBuehne();
  return true;
}
let sucheUhr = null;
function liveSucheStarten() {
  clearInterval(sucheUhr);
  sucheUhr = setInterval(async () => {
    if (S.ansicht !== "ablesen" || A.modus !== "live" || !A.auto || A.sucheOffen || zug || !video.videoWidth || document.hidden) return;
    A.sucheOffen = true;
    try {
      const antwort = await suchen(videoBild(640), false);
      if (A.modus !== "live" || !A.auto) return;
      const t = antwort.treffer;
      if (t && trefferUebernehmen(t, true)) buehnenHinweis(`Zählwerk erkannt: ${A.schab.schwarz + A.schab.rot} Rollen. Ruhig halten und auslösen.`);
      else if (!t) buehnenHinweis("Zählwerk wird gesucht … näher heran, gerade von vorn, ohne Spiegelung.");
    } finally { A.sucheOffen = false; }
  }, 450);
}
liveSucheStarten();
async function standbildSuchen() {
  if (!A.bild) return;
  $("erkannt").hidden = false; $("e-status").textContent = "sucht die Ziffernreihe …";
  const q = A.bild.quelle, f = Math.min(1, 1000 / Math.max(q.width, q.height));
  const c = h("canvas"); c.width = Math.round(q.width * f); c.height = Math.round(q.height * f);
  const g = c.getContext("2d", { willReadFrequently: true }); g.imageSmoothingQuality = "high"; g.drawImage(q, 0, 0, c.width, c.height);
  const antwort = await suchen(c, true);
  if (!A.bild) return;
  if (antwort.treffer) trefferUebernehmen(antwort.treffer, false);
  else meldung("Keine Ziffernreihe gefunden. Rahmen bitte von Hand auf die Rollen ziehen.");
  erkennen();
}

/* ---------- Bühne: Abbildung Bild ↔ Bildschirm ---------- */
function bildMasse() {
  if (A.modus === "bild") return { W: A.bild.W, H: A.bild.H };
  return { W: buehne.clientWidth, H: buehne.clientHeight };
}
function abbildung() {
  const bw = buehne.clientWidth, bh = buehne.clientHeight;
  if (A.modus !== "bild") return { s: 1, tx: 0, ty: 0 };
  const { W, H } = A.bild, basis = Math.min(bw / W, bh / H), sk = basis * A.ansicht.zoom;
  return { s: sk, tx: bw / 2 + A.ansicht.ox - (W / 2) * sk, ty: bh / 2 + A.ansicht.oy - (H / 2) * sk };
}
const zuBild = (q, m) => ({ x: (q.x - m.tx) / m.s, y: (q.y - m.ty) / m.s });
const zuSchirm = (p, m) => ({ x: p.x * m.s + m.tx, y: p.y * m.s + m.ty });

// Geometrie der Schablone in Bildkoordinaten
function geometrie() {
  const { W, H } = bildMasse(), sb = A.schab, L = sb.lage;
  const n = sb.schwarz + sb.rot, w = L.bw * W, hh = sb.hoehe * w, th = (L.winkel * Math.PI) / 180;
  const cos = Math.cos(th), sin = Math.sin(th), C = { x: L.cx * W, y: L.cy * H };
  const welt = (lx, ly) => ({ x: C.x + lx * cos - ly * sin, y: C.y + lx * sin + ly * cos });
  const lokal = p => { const dx = p.x - C.x, dy = p.y - C.y; return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }; };
  const zellen = Array.from({ length: n }, (_, i) => ({ ...welt(-w / 2 + (i + 0.5) * (w / n), 0), b: w / n, h: hh, rot: i >= sb.schwarz }));
  const zeiger = sb.zeiger.map(z => ({ ...welt(z.x * w, z.y * w), r: z.r * w }));
  return { W, H, C, w, h: hh, th, n, welt, lokal, zellen, zeiger, ecke: welt(w / 2, hh / 2) };
}

function zeichneBuehne() {
  const dpr = window.devicePixelRatio || 1, bw = buehne.clientWidth, bh = buehne.clientHeight;
  if (!bw || !bh || !A.schab) return;
  if (leinwand.width !== Math.round(bw * dpr) || leinwand.height !== Math.round(bh * dpr)) { leinwand.width = Math.round(bw * dpr); leinwand.height = Math.round(bh * dpr); }
  const g = leinwand.getContext("2d"), m = abbildung();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, leinwand.width, leinwand.height);
  if (A.modus === "bild") {
    g.fillStyle = "#000"; g.fillRect(0, 0, leinwand.width, leinwand.height);
    const ziel = m.s * dpr;
    let stufe = A.bild.stufen[0];
    for (const st of A.bild.stufen) if (st.width / A.bild.W >= ziel) stufe = st;
    g.setTransform(ziel, 0, 0, ziel, m.tx * dpr, m.ty * dpr);
    g.imageSmoothingQuality = "high";
    g.drawImage(stufe, 0, 0, A.bild.W, A.bild.H);
  }
  // Schablone in Bildschirmkoordinaten zeichnen
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const geo = geometrie(), offen = $("schablone").open, erg = A.ergebnis;
  const ecken = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => zuSchirm(geo.welt(a * geo.w / 2, b * geo.h / 2), m));
  const pfad = pts => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); };
  // rote Felder leicht tönen
  geo.zellen.forEach(z => {
    if (!z.rot) return;
    const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => zuSchirm(geo.welt(geo.lokal(z).x + a * z.b / 2, b * z.h / 2), m));
    pfad(pts); g.fillStyle = "rgba(226,60,50,.18)"; g.fill();
  });
  const linie = (breite, farbe) => { g.lineWidth = breite; g.strokeStyle = farbe; g.stroke(); };
  pfad(ecken); linie(4, "rgba(0,0,0,.55)"); pfad(ecken); linie(2, "#fff");
  for (let i = 1; i < geo.n; i++) {
    const lx = -geo.w / 2 + (i * geo.w) / geo.n, a = zuSchirm(geo.welt(lx, -geo.h / 2), m), b = zuSchirm(geo.welt(lx, geo.h / 2), m);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); linie(3, "rgba(0,0,0,.45)");
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); linie(i === geo.n - A.schab.rot ? 2 : 1, i === geo.n - A.schab.rot ? "#ff6b5e" : "rgba(255,255,255,.85)");
  }
  // erkannte Ziffern über den Feldern
  g.font = "600 15px ui-monospace, Menlo, Consolas, monospace"; g.textAlign = "center"; g.textBaseline = "bottom";
  if (erg) geo.zellen.forEach((z, i) => {
    const p = zuSchirm(geo.welt(geo.lokal(z).x, -geo.h / 2), m), d = erg.zus.rollenZiffern[i];
    if (d == null) return;
    g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(p.x - 9, p.y - 24, 18, 20);
    g.fillStyle = erg.zus.rollenUnsicher[i] ? "#ffb347" : "#fff"; g.fillText(String(d), p.x, p.y - 5);
  });
  // Zeigerkreise
  geo.zeiger.forEach((z, i) => {
    const c = zuSchirm(z, m), r = z.r * m.s;
    g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); linie(4, "rgba(0,0,0,.5)");
    g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); linie(2, "#ffd34d");
    g.fillStyle = "#ffd34d"; g.textBaseline = "top";
    const beschriftung = ZEIGER_NAMEN[i] + (erg?.zus.zeigerZiffern[i] != null ? " → " + erg.zus.zeigerZiffern[i] : "");
    g.font = "600 12px system-ui, sans-serif"; g.fillText(beschriftung, c.x, c.y + r + 3);
    if (offen) { const hp = zuSchirm({ x: z.x + z.r * Math.cos(geo.th), y: z.y + z.r * Math.sin(geo.th) }, m); punktGriff(g, hp, "#ffd34d"); }
  });
  punktGriff(g, zuSchirm(geo.ecke, m), "#fff");
}
function punktGriff(g, p, farbe) {
  g.beginPath(); g.arc(p.x, p.y, 9, 0, Math.PI * 2); g.fillStyle = "rgba(0,0,0,.55)"; g.fill();
  g.beginPath(); g.arc(p.x, p.y, 6, 0, Math.PI * 2); g.fillStyle = farbe; g.fill();
}
new ResizeObserver(() => zeichneBuehne()).observe(buehne);

/* ---------- Bühne: Ziehen, Zoomen ---------- */
const zeigerAktiv = new Map();
let zug = null;
const punkt = e => { const r = leinwand.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
function treffer(q) {
  const m = abbildung(), p = zuBild(q, m), geo = geometrie(), tol = 26 / m.s, offen = $("schablone").open;
  if (Math.hypot(p.x - geo.ecke.x, p.y - geo.ecke.y) < tol) return { art: "groesse" };
  if (offen) {
    for (let i = geo.zeiger.length - 1; i >= 0; i--) {
      const z = geo.zeiger[i], hp = { x: z.x + z.r * Math.cos(geo.th), y: z.y + z.r * Math.sin(geo.th) };
      if (Math.hypot(p.x - hp.x, p.y - hp.y) < tol) return { art: "radius", i };
      if (Math.hypot(p.x - z.x, p.y - z.y) < z.r) return { art: "zeiger", i };
    }
  }
  const l = geo.lokal(p);
  if (Math.abs(l.x) <= geo.w / 2 + tol / 2 && Math.abs(l.y) <= geo.h / 2 + tol / 2) return { art: "verschieben" };
  if (geo.zeiger.some(z => Math.hypot(p.x - z.x, p.y - z.y) < z.r)) return { art: "verschieben" };
  return { art: A.modus === "bild" ? "schwenken" : "nichts" };
}
leinwand.addEventListener("pointerdown", e => {
  try { leinwand.setPointerCapture(e.pointerId); } catch {}
  const q = punkt(e);
  zeigerAktiv.set(e.pointerId, q);
  if (zeigerAktiv.size === 2 && A.modus === "bild") {
    const [a, b] = [...zeigerAktiv.values()], mitte = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    zug = { art: "kneifen", d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom0: A.ansicht.zoom, p0: zuBild(mitte, abbildung()) };
    return;
  }
  if (zeigerAktiv.size > 1) return;
  zug = { ...treffer(q), letzter: q, geaendert: false };
});
leinwand.addEventListener("pointermove", e => {
  if (!zeigerAktiv.has(e.pointerId) || !zug) return;
  const q = punkt(e);
  zeigerAktiv.set(e.pointerId, q);
  if (zug.art === "kneifen") {
    const [a, b] = [...zeigerAktiv.values()];
    if (!b) return;
    const mitte = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    zoomeAuf(begrenze(zug.zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / zug.d0, 1, 12), zug.p0, mitte);
    return;
  }
  const m = abbildung(), { W, H } = bildMasse(), p = zuBild(q, m), vorher = zuBild(zug.letzter, m);
  const L = A.schab.lage, geo = geometrie();
  switch (zug.art) {
    case "verschieben": L.cx = begrenze(L.cx + (p.x - vorher.x) / W, 0, 1); L.cy = begrenze(L.cy + (p.y - vorher.y) / H, 0, 1); break;
    case "groesse": {
      const l = geo.lokal(p), wNeu = begrenze(2 * l.x, W * 0.04, W * 1.5);
      L.bw = wNeu / W;
      if ($("schablone").open) A.schab.hoehe = begrenze((2 * l.y) / wNeu, 0.03, 1.2);
      break;
    }
    case "zeiger": { const l = geo.lokal(p), z = A.schab.zeiger[zug.i]; z.x = l.x / geo.w; z.y = l.y / geo.w; break; }
    case "radius": { const z = geo.zeiger[zug.i]; A.schab.zeiger[zug.i].r = begrenze(Math.hypot(p.x - z.x, p.y - z.y) / geo.w, 0.02, 0.6); break; }
    case "schwenken": A.ansicht.ox += q.x - zug.letzter.x; A.ansicht.oy += q.y - zug.letzter.y; break;
    default: return;
  }
  zug.letzter = q;
  if (zug.art !== "schwenken") zug.geaendert = true;
  if (A.modus === "live" && A.auto && (zug.art === "verschieben" || zug.art === "groesse")) {
    // wer den Rahmen selbst legt, will keine Automatik, die ihn wieder wegzieht
    A.auto = false; autoKnopf();
    buehnenHinweis("Automatik aus: Rahmen von Hand. Oben links wieder einschalten.");
  }
  schabloneAnzeigen(true);
  zeichneBuehne();
});
function zugEnde(e) {
  zeigerAktiv.delete(e.pointerId);
  if (zeigerAktiv.size) return;
  if (zug?.geaendert && A.modus === "bild") erkennen();
  zug = null;
}
leinwand.addEventListener("pointerup", zugEnde);
leinwand.addEventListener("pointercancel", zugEnde);
leinwand.addEventListener("wheel", e => {
  if (A.modus !== "bild") return;
  e.preventDefault();
  const q = punkt(e);
  zoomeAuf(begrenze(A.ansicht.zoom * Math.exp(-e.deltaY * 0.0015), 1, 12), zuBild(q, abbildung()), q);
}, { passive: false });
// Bildpunkt p soll beim Zoom z an Bildschirmpunkt q liegen
function zoomeAuf(z, p, q) {
  const bw = buehne.clientWidth, bh = buehne.clientHeight, { W, H } = A.bild, sk = Math.min(bw / W, bh / H) * z;
  A.ansicht = { zoom: z, ox: q.x - bw / 2 - (p.x - W / 2) * sk, oy: q.y - bh / 2 - (p.y - H / 2) * sk };
  if (z === 1) A.ansicht.ox = A.ansicht.oy = 0;
  zeichneBuehne();
}
$("w-zoom").addEventListener("click", e => {
  const k = e.target.closest("[data-zoom]"); if (!k || !A.bild) return;
  const r = Number(k.dataset.zoom);
  if (r === 0) { zoomeAuf(1, { x: A.bild.W / 2, y: A.bild.H / 2 }, { x: buehne.clientWidth / 2, y: buehne.clientHeight / 2 }); return; }
  // um die Schablone herum zoomen
  const geo = geometrie(), mitte = { x: buehne.clientWidth / 2, y: buehne.clientHeight / 2 };
  zoomeAuf(begrenze(A.ansicht.zoom * (r > 0 ? 1.5 : 1 / 1.5), 1, 12), geo.C, r > 0 ? mitte : zuSchirm(geo.C, abbildung()));
});

/* ---------- Schablonen-Einstellungen ---------- */
function schabloneAnzeigen(nurWerte) {
  const sb = A.schab;
  $("s-schwarz").textContent = sb.schwarz; $("s-rot").textContent = sb.rot; $("s-zeiger").textContent = sb.zeiger.length;
  $("s-hoehe").value = sb.hoehe;
  $("s-winkel").value = sb.lage.winkel; $("s-winkel-wert").textContent = String(sb.lage.winkel).replace(".", ",") + "°";
  $("s-zusammenfassung").textContent = `· ${sb.schwarz} schwarz, ${sb.rot} rot` + (sb.zeiger.length ? `, ${sb.zeiger.length} Zeiger` : "");
  if (!nurWerte) standHinweis();
}
$("schablone").addEventListener("click", e => {
  const k = e.target.closest("[data-stufe]"); if (!k) return;
  const [feld, d] = k.dataset.stufe.split(":"), sb = A.schab, schritt = Number(d);
  if (feld === "schwarz") { sb.schwarz = begrenze(sb.schwarz + schritt, 1, 9); A.zaehlFest = true; }
  if (feld === "rot") { sb.rot = begrenze(sb.rot + schritt, 0, 4); A.zaehlFest = true; }
  if (feld === "zeiger") {
    if (schritt > 0 && sb.zeiger.length < 4) { const i = sb.zeiger.length; sb.zeiger.push({ x: 0.3 - 0.2 * i, y: sb.hoehe / 2 + 0.2, r: 0.08 }); }
    if (schritt < 0) sb.zeiger.pop();
  }
  schabloneAnzeigen(); zeichneBuehne();
  if (A.bild) erkennen();
});
$("schablone").addEventListener("toggle", zeichneBuehne);
$("s-hoehe").addEventListener("input", e => { A.schab.hoehe = Number(e.target.value); zeichneBuehne(); });
$("s-winkel").addEventListener("input", e => { A.schab.lage.winkel = Number(e.target.value); schabloneAnzeigen(true); zeichneBuehne(); });
for (const id of ["s-hoehe", "s-winkel"]) $(id).addEventListener("change", () => { if (A.bild) erkennen(); });

/* ---------- Ausschnitte und Erkennung ---------- */
function ausschnitt(cx, cy, cb, ch, th, ob, oh) {
  const { W, stufen } = A.bild, bedarf = ob / cb;
  let stufe = stufen[0];
  for (const st of stufen) if (st.width / W >= bedarf * 2) stufe = st;
  const fx = stufe.width / A.bild.W, fy = stufe.height / A.bild.H;
  const c = h("canvas"); c.width = ob; c.height = oh;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.fillStyle = "#808080"; g.fillRect(0, 0, ob, oh);
  g.translate(ob / 2, oh / 2); g.scale(ob / cb, oh / ch); g.rotate(-th); g.translate(-cx, -cy); g.scale(1 / fx, 1 / fy);
  g.drawImage(stufe, 0, 0);
  const d = g.getImageData(0, 0, ob, oh).data, px = new Float32Array(ob * oh * 3);
  for (let i = 0, j = 0; i < d.length; i += 4) { px[j++] = d[i]; px[j++] = d[i + 1]; px[j++] = d[i + 2]; }
  return { canvas: c, px };
}
let erkennenUhr = null;
function erkennen() {
  clearTimeout(erkennenUhr);
  erkennenUhr = setTimeout(erkennenJetzt, 60);
}
async function erkennenJetzt() {
  if (!A.bild) return;
  const geo = geometrie(), auftrag = ++A.auftrag;
  const ziffern = geo.zellen.map(z => ausschnitt(z.x, z.y, z.b, z.h, geo.th, 20, 32));
  const zeiger = geo.zeiger.map(z => ausschnitt(z.x, z.y, 2 * z.r, 2 * z.r, geo.th, 32, 32));
  $("erkannt").hidden = false; $("e-status").textContent = "rechnet …";
  const antwort = await new Promise(ok => {
    offeneAuftraege.set(auftrag, ok);
    erkennerHolen().postMessage({ id: auftrag, ziffern: ziffern.map(x => x.px), zeiger: zeiger.map(x => x.px) });
  });
  if (auftrag !== A.auftrag || !A.bild) return;
  if (antwort.fehler) { $("e-status").textContent = "Erkennung nicht verfügbar: " + antwort.fehler; return; }
  const zus = Netz.zusammensetzen(antwort.ziffern, antwort.zeiger, A.schab.rot);
  A.ergebnis = { roh: antwort, zus, ziffernBilder: ziffern.map(x => x.canvas), zeigerBilder: zeiger.map(x => x.canvas) };
  zeigeErgebnis();
  zeichneBuehne();
}
function zeigeErgebnis() {
  const { roh, zus, ziffernBilder, zeigerBilder } = A.ergebnis, sb = A.schab, n = sb.schwarz + sb.rot;
  const zellen = [];
  ziffernBilder.forEach((c, i) => {
    if (i === n - sb.rot && sb.rot) zellen.push(h("span", { class: "trenner" }, ","));
    zellen.push(h("div", { class: "zelle" + (zus.rollenUnsicher[i] ? " unsicher" : "") }, c, h("b", {}, zus.rollenZiffern[i]), h("span", {}, roh.ziffern[i].wert.toFixed(1).replace(".", ","))));
  });
  if (zeigerBilder.length && !sb.rot) zellen.push(h("span", { class: "trenner" }, ","));
  zeigerBilder.forEach((c, i) => zellen.push(h("div", { class: "zelle zeiger" + (zus.zeigerUnsicher[i] ? " unsicher" : "") }, c, h("b", {}, zus.zeigerZiffern[i]), h("span", {}, ZEIGER_NAMEN[i]))));
  $("e-zellen").replaceChildren(...zellen);
  const unsicher = [...zus.rollenUnsicher, ...zus.zeigerUnsicher].filter(Boolean).length;
  const zwischen = zus.zwischen.some(Boolean);
  $("e-status").textContent = unsicher ? `${unsicher} Stelle${unsicher > 1 ? "n" : ""} unsicher, bitte prüfen` : zwischen ? "letzte Rolle steht zwischen zwei Ziffern" : "alle Stellen sicher";
  const a = art(S.zaehler.get(A.zid));
  $("e-zaehlwerk").replaceChildren(rollen(zus.stand, nk({ schablone: sb }), [...zus.rollenUnsicher, ...zus.zeigerUnsicher]), h("span", { class: "einheit" }, a.einheit));
  if (!A.handEingabe) $("a-stand").value = zus.text.replace(/^0+(?=\d)/, "");
  pruefeEingabe();
}

/* ---------- Stand prüfen und speichern ---------- */
function standHinweis() {
  const z = S.zaehler.get(A.zid); if (!z) return;
  const st = statistik(z.id), n = nk({ schablone: A.schab }), teile = [`${art(z).einheit}, ${n} Nachkommastellen`];
  if (st.letzte) teile.push(`zuletzt ${zahlText(st.letzte.stand, n)} am ${datum(st.letzte.zeit)}`);
  $("a-hinweis").textContent = teile.join(" · ");
}
$("a-stand").addEventListener("input", () => { A.handEingabe = true; pruefeEingabe(); });
$("a-zeit").addEventListener("input", pruefeEingabe);
function pruefeEingabe() {
  const stand = zahlLesen($("a-stand").value), zeit = $("a-zeit").value ? new Date($("a-zeit").value) : new Date();
  const w = $("a-stand").value.trim() && !Number.isFinite(stand) ? ["Bitte nur Ziffern und ein Komma eingeben, z. B. 1234,567."] : pruefe(A.zid, stand, zeit);
  $("a-warnungen").replaceChildren(...w.map(t => h("li", {}, t)));
  $("a-warnungen").hidden = !w.length;
  $("a-speichern").textContent = w.length && Number.isFinite(stand) ? "Trotzdem speichern" : "Speichern";
}
function belegfoto() {
  if (!A.bild) return Promise.resolve(null);
  const q = A.bild.quelle, f = Math.min(1, 1200 / Math.max(q.width, q.height));
  const c = h("canvas"); c.width = Math.round(q.width * f); c.height = Math.round(q.height * f);
  const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(q, 0, 0, c.width, c.height);
  return new Promise(ok => c.toBlob(ok, "image/jpeg", 0.8));
}
$("a-speichern").addEventListener("click", async () => {
  const z = S.zaehler.get(A.zid), stand = zahlLesen($("a-stand").value);
  if (!z) return;
  if (!Number.isFinite(stand)) { $("a-stand").focus(); meldung("Bitte den Zählerstand eintragen, z. B. 1234,567."); return; }
  const zeit = $("a-zeit").value ? new Date($("a-zeit").value) : new Date();
  if (isNaN(zeit)) { meldung("Bitte ein gültiges Datum eintragen."); return; }
  const erg = A.ergebnis;
  const ablesung = {
    id: neueId(), zaehlerId: z.id, stand, zeit: zeit.toISOString(),
    quelle: erg ? "erkannt" : A.bild ? "foto" : "hand",
    erkennung: erg ? { text: erg.zus.text, stand: erg.zus.stand, unsicher: [...erg.zus.rollenUnsicher, ...erg.zus.zeigerUnsicher].filter(Boolean).length, korrigiert: Math.abs(erg.zus.stand - stand) > 1e-9 } : null,
    notiz: $("a-notiz").value.trim(), foto: await belegfoto(), erfasst: new Date().toISOString(),
  };
  $("a-speichern").disabled = true;
  try {
    await speichereAblesung(ablesung);
    if (A.bild || !z.schablone) await speichereZaehler({ ...z, schablone: klon(A.schab) });
    meldung(`Gespeichert: ${zahlText(stand, nk(S.zaehler.get(z.id)))} ${art(z).einheit}`);
    S.detailId = z.id; zeige("detail");
  } catch (err) { meldung("Speichern fehlgeschlagen: " + err.message); }
  finally { $("a-speichern").disabled = false; }
});

/* ---------- Verdrahtung und Start ---------- */
document.querySelectorAll("[data-zurueck]").forEach(b => b.addEventListener("click", () => zeige("liste")));
$("k-neu").addEventListener("click", () => oeffneZaehler());
$("k-daten").addEventListener("click", () => zeige("daten"));

function banner(text, knopf) {
  const b = $("banner"); b.replaceChildren(h("span", {}, text), knopf || ""); b.hidden = !text;
}

async function start() {
  try {
    const [zs, as, meta] = await Promise.all([alle("zaehler"), alle("ablesungen"), alle("meta")]);
    zs.forEach(z => S.zaehler.set(z.id, z));
    as.forEach(a => S.ablesungen.set(a.id, a));
    if (!meta.some(m => m.schluessel === "eingerichtet")) {
      let reihe = 1;
      for (const v of ERSTE_ZAEHLER) await speichereZaehler({ id: neueId(), reihe: reihe++, nummer: "", ort: "", einheit: ARTEN[v.art].einheit, konstante: "", erstellt: new Date().toISOString(), ...v });
      await ablegen("meta", { schluessel: "eingerichtet", am: new Date().toISOString() });
    }
  } catch (err) {
    banner("Der Speicher des Browsers ist nicht verfügbar (privates Fenster?). Ablesungen können nicht gespeichert werden.");
    console.error(err);
  }
  zeichne();
  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("sw.js").then(reg => {
      reg.addEventListener("updatefound", () => {
        const neu = reg.installing;
        neu?.addEventListener("statechange", () => {
          if (neu.state === "installed" && navigator.serviceWorker.controller)
            banner("Eine neue Version ist da.", h("button", { class: "knopf", type: "button", onclick: () => {
              navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
              (reg.waiting || neu).postMessage("uebernehmen");
            } }, "Neu laden"));
        });
      });
    }).catch(err => console.warn("Service Worker:", err));
  }
}

// Für Tests im Browser: Bild ohne Dateiauswahl laden
window.zaehlerbuch = { bildDateiLaden, oeffneAblesen, S, A };

// netz.js (Zusammensetzen der Stellen) auch im Hauptfenster
await new Promise((ok, fehl) => { const sk = h("script", { src: "js/netz.js" }); sk.onload = ok; sk.onerror = fehl; document.head.append(sk); });
start();
