/* Sucht im Bild die Reihe der Zählerrollen: Ziffern als zusammenhängende helle oder dunkle Flecken
   (adaptive Schwelle), die in gleicher Höhe, gleicher Größe und gleichem Abstand nebeneinander stehen.
   Schwarze Ziffern auf weißen Rollen und weiße Ziffern auf roten oder schwarzen Rollen werden getrennt
   gesucht und danach zu einer Reihe verbunden. Mit `pruefen` entscheidet das Ziffernmodell zwischen den
   besten Vorschlägen (etwa Zählwerk gegen aufgedruckte Seriennummer).
   Klassisches Skript für den Worker; braucht netz.js für die Prüfung. */
(function (wurzel) {
  "use strict";

  function grau(rgba, W, H) {
    const g = new Float32Array(W * H);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2];
    return g;
  }

  // dunkel/hell gegenüber dem örtlichen Mittel (Integralbild)
  function masken(g, W, H, r, c) {
    const B = W + 1, I = new Float64Array(B * (H + 1));
    for (let y = 0; y < H; y++) {
      let s = 0;
      for (let x = 0; x < W; x++) { s += g[y * W + x]; I[(y + 1) * B + x + 1] = I[y * B + x + 1] + s; }
    }
    const dunkel = new Uint8Array(W * H), hell = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const m = (I[y1 * B + x1] - I[y0 * B + x1] - I[y1 * B + x0] + I[y0 * B + x0]) / ((y1 - y0) * (x1 - x0));
        const v = g[y * W + x];
        if (v < m - c) dunkel[y * W + x] = 1; else if (v > m + c) hell[y * W + x] = 1;
      }
    }
    return { dunkel, hell };
  }

  function flecken(maske, W, H) {
    const marke = new Uint8Array(W * H), stapel = new Int32Array(W * H), liste = [];
    for (let i = 0; i < W * H; i++) {
      if (!maske[i] || marke[i]) continue;
      let sp = 0, x0 = W, y0 = H, x1 = -1, y1 = -1, anz = 0;
      stapel[sp++] = i; marke[i] = 1;
      while (sp) {
        const p = stapel[--sp], x = p % W, y = (p - x) / W;
        anz++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && maske[p - 1] && !marke[p - 1]) { marke[p - 1] = 1; stapel[sp++] = p - 1; }
        if (x < W - 1 && maske[p + 1] && !marke[p + 1]) { marke[p + 1] = 1; stapel[sp++] = p + 1; }
        if (y > 0 && maske[p - W] && !marke[p - W]) { marke[p - W] = 1; stapel[sp++] = p - W; }
        if (y < H - 1 && maske[p + W] && !marke[p + W]) { marke[p + W] = 1; stapel[sp++] = p + W; }
      }
      const b = x1 - x0 + 1, h = y1 - y0 + 1;
      liste.push({ x0, y0, x1, y1, b, h, anz, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2 });
    }
    return liste;
  }

  // sieht aus wie eine einzelne Ziffer?
  function zifferfoermig(f, W, H) {
    if (f.x0 === 0 || f.y0 === 0 || f.x1 === W - 1 || f.y1 === H - 1) return false;
    if (f.h < Math.max(8, H * 0.025) || f.h > H * 0.45 || f.b < 2) return false;
    const seiten = f.h / f.b, fuellung = f.anz / (f.b * f.h);
    return seiten >= 1.05 && seiten <= 6.5 && fuellung >= 0.12 && fuellung <= 0.85;
  }

  function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; }

  function ketten(teile, art) {
    teile.sort((a, b) => a.cx - b.cx);
    const alle = [];
    for (let i = 0; i < teile.length; i++) {
      const kette = [teile[i]];
      let teilung = null;
      for (;;) {
        const l = kette[kette.length - 1];
        let beste = null, besterWert = Infinity;
        for (let j = i + 1; j < teile.length; j++) {
          const t = teile[j], d = t.cx - l.cx;
          if (d <= 0) continue;
          if (d > 1.7 * l.h) break;
          const hv = t.h / l.h;
          if (hv < 0.78 || hv > 1.28 || Math.abs(t.cy - l.cy) > 0.25 * l.h || d < 0.45 * l.h) continue;
          if (teilung && Math.abs(d - teilung) > 0.25 * teilung) continue;
          const wert = Math.abs(t.cy - l.cy) / l.h + Math.abs(hv - 1) + (teilung ? Math.abs(d - teilung) / teilung : 0);
          if (wert < besterWert) { besterWert = wert; beste = t; }
        }
        if (!beste) break;
        const d = beste.cx - l.cx;
        teilung = teilung ? (teilung * (kette.length - 1) + d) / kette.length : d;
        kette.push(beste);
      }
      if (kette.length >= 3) alle.push({ teile: kette.map(t => Object.assign({ art }, t)) });
    }
    // Teilketten längerer Ketten weglassen
    alle.sort((a, b) => b.teile.length - a.teile.length);
    const behalten = [];
    for (const k of alle) if (!behalten.some(b => k.teile.every(t => b.teile.some(u => u.cx === t.cx && u.cy === t.cy)))) behalten.push(k);
    return behalten;
  }

  function kennwerte(k) {
    const t = k.teile, n = t.length;
    const h = median(t.map(x => x.h));
    const teilung = n > 1 ? (t[n - 1].cx - t[0].cx) / (n - 1) : h;
    // Ausgleichsgerade durch die Mitten: Schräglage
    const mx = t.reduce((s, x) => s + x.cx, 0) / n, my = t.reduce((s, x) => s + x.cy, 0) / n;
    let sxy = 0, sxx = 0;
    for (const x of t) { sxy += (x.cx - mx) * (x.cy - my); sxx += (x.cx - mx) ** 2; }
    const steigung = sxx ? sxy / sxx : 0;
    const hs = Math.sqrt(t.reduce((s, x) => s + (x.h - h) ** 2, 0) / n) / h;
    const ds = n > 2 ? Math.sqrt(t.slice(1).reduce((s, x, i) => s + (x.cx - t[i].cx - teilung) ** 2, 0) / (n - 1)) / teilung : 0;
    return Object.assign(k, { n, h, teilung, steigung, mx, my, gleichmass: Math.max(0, 1 - hs - ds) });
  }

  // dunkle und helle Kette, die nahtlos aneinander anschließen (schwarze Rollen, dann rote)
  function verbinden(a, b) {
    const [l, r] = a.mx < b.mx ? [a, b] : [b, a];
    const hv = r.h / l.h, teilung = (l.teilung + r.teilung) / 2;
    if (hv < 0.75 || hv > 1.33) return null;
    const lz = l.teile[l.teile.length - 1], rz = r.teile[0], d = rz.cx - lz.cx;
    if (d < 0.6 * teilung || d > 1.5 * teilung || Math.abs(rz.cy - lz.cy) > 0.3 * l.h) return null;
    return kennwerte({ teile: [...l.teile, ...r.teile] });
  }

  function band(k, W, H, n, start) {
    // n Zellen ab Zelle `start` der Kette (negativ = nach links verlängert)
    const cos = 1 / Math.sqrt(1 + k.steigung ** 2), winkel = Math.atan(k.steigung);
    const t0 = k.teile[0];
    const zelle = i => ({ x: t0.cx + (start + i) * k.teilung, y: t0.cy + (start + i) * k.teilung * k.steigung });
    const a = zelle(0), e = zelle(n - 1);
    const breite = n * k.teilung / cos, hoehe = 1.38 * k.h;
    return { cx: (a.x + e.x) / 2 / W, cy: (a.y + e.y) / 2 / H, bw: breite / W, hoehe: hoehe / breite, winkel: winkel * 180 / Math.PI, n,
      zellen: Array.from({ length: n }, (_, i) => zelle(i)), zb: k.teilung / cos, zh: hoehe, th: winkel };
  }

  // Bildausschnitt mit Drehung, je Zielpixel über mehrere Punkte gemittelt
  function probe(rgba, W, H, cx, cy, cb, ch, th, ob, oh) {
    const px = new Float32Array(ob * oh * 3), cos = Math.cos(th), sin = Math.sin(th);
    const nx = Math.max(1, Math.round(cb / ob)), ny = Math.max(1, Math.round(ch / oh));
    let k = 0;
    for (let v = 0; v < oh; v++) for (let u = 0; u < ob; u++) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const lx = ((u + (i + 0.5) / nx) / ob - 0.5) * cb, ly = ((v + (j + 0.5) / ny) / oh - 0.5) * ch;
        const x = cx + lx * cos - ly * sin - 0.5, y = cy + lx * sin + ly * cos - 0.5;
        const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
        for (let q = 0; q < 4; q++) {
          const xx = x0 + (q & 1), yy = y0 + (q >> 1), w = ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) { r += 128 * w; g += 128 * w; b += 128 * w; continue; }
          const p = (yy * W + xx) * 4;
          r += rgba[p] * w; g += rgba[p + 1] * w; b += rgba[p + 2] * w;
        }
      }
      const m = nx * ny;
      px[k++] = r / m; px[k++] = g / m; px[k++] = b / m;
    }
    return px;
  }

  // rote Rollen von rechts zählen (Hintergrund der Zelle deutlich rot)
  function roteRollen(rgba, W, H, b) {
    let rot = 0;
    for (let i = b.n - 1; i >= 0; i--) {
      const c = b.zellen[i], px = probe(rgba, W, H, c.x, c.y, b.zb * 0.8, b.zh * 0.8, b.th, 8, 12);
      let r = 0, g = 0, bl = 0;
      for (let k = 0; k < px.length; k += 3) { r += px[k]; g += px[k + 1]; bl += px[k + 2]; }
      if (r > 1.3 * g && r > 1.3 * bl && r / (px.length / 3) > 70) rot++; else break;
    }
    return Math.min(rot, 4);
  }

  /* Rollen sitzen in Fenstern: über und unter der Ziffernreihe läuft eine durchgehende Kante (Fensterrahmen),
     zwischen den Rollen stehen oft Trennstege. Aufgedruckte Zahlen (Seriennummer, Baujahr, Q3 …) stehen frei
     auf dem Zifferblatt. Gemessen wird der Median ganzer Linien, damit Textzeilen in der Nähe nicht zählen. */
  function rahmenWert(g, W, H, b) {
    const h = b.zh / 1.38, cos = Math.cos(b.th), sin = Math.sin(b.th);
    const pkt = (c, lx, ly) => {
      const x = Math.round(c.x + lx * cos - ly * sin), y = Math.round(c.y + lx * sin + ly * cos);
      return x < 0 || y < 0 || x >= W || y >= H ? null : g[y * W + x];
    };
    const sammeln = (werte, v) => { if (v != null) werte.push(v); };
    const innenWerte = [];
    for (const c of b.zellen) for (const dy of [-0.58 * h, 0.58 * h]) for (let i = -1; i <= 1; i++) sammeln(innenWerte, pkt(c, i * b.zb * 0.25, dy));
    if (innenWerte.length < 6) return 0;
    const innen = median(innenWerte);
    const linie = dy => { const w = []; for (const c of b.zellen) for (let i = -2; i <= 2; i++) sammeln(w, pkt(c, (i * b.zb) / 5, dy)); return w.length > 4 ? median(w) : null; };
    let oben = 0, unten = 0;
    for (let d = 0.62; d <= 1.5; d += 0.06) {
      const o = linie(-d * h), u = linie(d * h);
      if (o != null) oben = Math.max(oben, Math.abs(o - innen));
      if (u != null) unten = Math.max(unten, Math.abs(u - innen));
    }
    const stege = [];
    for (let i = 0; i < b.zellen.length - 1; i++) {
      const a = b.zellen[i], e = b.zellen[i + 1], m = { x: (a.x + e.x) / 2, y: (a.y + e.y) / 2 }, w = [];
      for (let j = -3; j <= 3; j++) sammeln(w, pkt(m, 0, j * h * 0.12));
      if (w.length) stege.push(Math.abs(median(w) - innen));
    }
    const steg = stege.length ? median(stege) : 0;
    return (Math.min(oben, unten) * 0.6 + Math.max(oben, unten) * 0.2 + steg * 0.4) / 255;
  }

  // Abstand eines Punkts zum Band in Zellenhöhen (0 = im Band)
  function abstandZumBand(b, W, H, p) {
    const x = p.x * W - b.cx * W, y = p.y * H - b.cy * H, cos = Math.cos(b.th), sin = Math.sin(b.th);
    const lx = x * cos + y * sin, ly = -x * sin + y * cos, hb = (b.bw * W) / 2, hh = b.zh / 2;
    return Math.hypot(Math.max(0, Math.abs(lx) - hb), Math.max(0, Math.abs(ly) - hh)) / b.zh;
  }

  /* Hauptaufruf.
     erwartet: Zahl der Rollen laut Schablone (oder null); netz: Ziffernmodell (für pruefen);
     fokus: angetippter Punkt {x, y} (0…1), die Reihe muss dort liegen;
     sperre: bisher verfolgtes Band {cx, cy, bw, hoehe} (0…1), Reihen in dessen Nähe werden stark bevorzugt. */
  function sucheReihe(rgba, W, H, { erwartet = null, pruefen = false, netz = null, fokus = null, sperre = null } = {}) {
    const g = grau(rgba, W, H);
    const { dunkel, hell } = masken(g, W, H, Math.max(8, Math.round(Math.min(W, H) / 16)), 10);
    const teile = art => flecken(art === "dunkel" ? dunkel : hell, W, H).filter(f => zifferfoermig(f, W, H));
    const kd = ketten(teile("dunkel"), "dunkel").map(kennwerte), kh = ketten(teile("hell"), "hell").map(kennwerte);
    const ketteListe = [...kd, ...kh];
    for (const a of kd) for (const b of kh) { const v = verbinden(a, b); if (v) ketteListe.push(v); }
    if (!ketteListe.length) return null;

    // Bänder je Kette, bei bekannter Rollenzahl auf diese gebracht
    const baender = [];
    for (const k of ketteListe) {
      const N = erwartet || k.n;
      if (k.n >= N) {
        for (let s = 0; s <= k.n - N; s++) baender.push({ k, b: band(k, W, H, N, s) });
      } else {
        // fehlende Rollen zuerst rechts anhängen (rote Rollen werden oft nicht gefunden), sonst links
        const t0 = k.teile[0], platzRechts = Math.floor((W - (t0.cx + k.n * k.teilung)) / k.teilung);
        const rechts = Math.max(0, Math.min(N - k.n, platzRechts));
        baender.push({ k, b: band(k, W, H, N, -(N - k.n - rechts)) });
      }
    }
    const hMax = Math.max(...ketteListe.map(k => k.h));
    for (const x of baender) {
      const { k, b } = x;
      b.rahmen = rahmenWert(g, W, H, b);
      const anzahl = erwartet ? 1 / (1 + Math.abs(k.n - erwartet)) : k.n <= 8 ? 1 : 0.55;
      const mitte = 1 - 0.6 * Math.hypot(b.cx - 0.5, b.cy - 0.5);
      // Zählerrollen sind fast immer die größte Zahlenreihe am Zähler: Höhe zählt quadratisch
      x.wert = (0.5 + 2 * b.rahmen) * (k.h / hMax) ** 2 * anzahl * mitte * (0.5 + 0.5 * k.gleichmass);
      if (fokus) { const d = abstandZumBand(b, W, H, fokus); x.wert *= d <= 0.1 ? 8 : d <= 0.8 ? 1 - d : 0.01; }
      if (sperre) {
        const nah = Math.abs(b.cx - sperre.cx) < 0.3 * sperre.bw && Math.abs(b.cy - sperre.cy) * H < sperre.hoehe * sperre.bw * W
          && b.bw / sperre.bw > 0.7 && b.bw / sperre.bw < 1.45;
        x.wert *= nah ? 3 : 0.3;
        b.nahSperre = nah;
      }
    }
    baender.sort((a, b) => b.wert - a.wert);
    let bestes = baender[0];
    bestes.b.guete = null;
    if (pruefen && netz) {
      // das Ziffernmodell entscheidet mit, ob in den Feldern wirklich Ziffern stehen
      let besterWert = -1;
      for (const x of baender.slice(0, 4)) {
        let summe = 0;
        for (const c of x.b.zellen) summe += Netz.zifferWert(netz.rechne(probe(rgba, W, H, c.x, c.y, x.b.zb, x.b.zh, x.b.th, 20, 32))).guete;
        x.b.guete = summe / x.b.zellen.length;
        const w = x.wert * (0.4 + x.b.guete);
        if (w > besterWert) { besterWert = w; bestes = x; }
      }
    }
    const b = bestes.b;
    b.rot = roteRollen(rgba, W, H, b);
    b.kandidaten = baender.length;
    // die stärksten Vorschläge zur Kontrolle (Prüfseite)
    b.vorschlaege = baender.slice(0, 5).map(x => ({ cx: +x.b.cx.toFixed(3), cy: +x.b.cy.toFixed(3), n: x.b.n, rahmen: +x.b.rahmen.toFixed(3), wert: +x.wert.toFixed(3) }));
    delete b.zellen;
    return b;
  }

  wurzel.Suche = { sucheReihe, probe };
})(typeof self !== "undefined" ? self : window);
