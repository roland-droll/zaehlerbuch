/* Rechenwerk für die Ziffern- und Zeigermodelle.
   Die Modelle stammen aus AI-on-the-edge-device (https://github.com/jomjol/AI-on-the-edge-device) und sind mit
   werkzeug/modell_wandeln.py in ein schlankes Float-Format gewandelt: <name>.json (Schichten) + <name>.bin (Gewichte).
   Eingang jeder Rechnung: Bildausschnitt als Float32Array H×B×3 (RGB, Pixelwerte 0–255).
   Klassisches Skript, damit es im Worker (importScripts) und auf der Prüfseite gleich läuft. */
(function (wurzel) {
  "use strict";

  async function ladeNetz(basis) {
    const [bau, bin] = await Promise.all([
      fetch(basis + ".json").then(r => { if (!r.ok) throw new Error(basis + ".json: HTTP " + r.status); return r.json(); }),
      fetch(basis + ".bin").then(r => { if (!r.ok) throw new Error(basis + ".bin: HTTP " + r.status); return r.arrayBuffer(); }),
    ]);
    const w = new Float32Array(bin);
    const teil = ([start, n]) => w.subarray(start, start + n);
    const schichten = bau.schichten.map(s => {
      const t = Object.assign({}, s, { W: s.w ? teil(s.w) : null, B: s.b ? teil(s.b) : null });
      if (s.typ === "conv") t.WT = umordnen(t.W, s.form);
      return t;
    });
    return { eingang: bau.eingang, ausgang: bau.ausgang, rechne: x => rechne(schichten, bau.eingang, x) };
  }

  function rechne(schichten, form, eingabe) {
    let x = Float32Array.from(eingabe), h = form[0], b = form[1], c = form[2];
    if (x.length !== h * b * c) throw new Error("Eingang hat " + x.length + " Werte, erwartet " + h * b * c);
    for (const s of schichten) {
      switch (s.typ) {
        case "mul": for (let i = 0; i < x.length; i++) x[i] *= s.W[i % c]; break;
        case "add": for (let i = 0; i < x.length; i++) x[i] += s.W[i % c]; break;
        case "conv": { const r = faltung(x, h, b, c, s); x = r.x; h = r.h; b = r.b; c = r.c; break; }
        case "leaky": { const a = s.alpha; for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] *= a; break; }
        case "maxpool": { const r = pool(x, h, b, c, s); x = r.x; h = r.h; b = r.b; break; }
        case "dense": { x = dicht(x, s); h = 1; b = 1; c = x.length; break; }
        case "softmax": {
          let m = -Infinity, summe = 0;
          for (let i = 0; i < x.length; i++) m = Math.max(m, x[i]);
          for (let i = 0; i < x.length; i++) { x[i] = Math.exp((x[i] - m) * s.beta); summe += x[i]; }
          for (let i = 0; i < x.length; i++) x[i] /= summe;
          break;
        }
        default: throw new Error("Unbekannte Schicht " + s.typ);
      }
      if (s.akt === "relu") for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0;
    }
    return x;
  }

  // Gewichte [aus, kh, kb, ein] nach [kh, kb, ein, aus], damit die innerste Schleife fortlaufend liest
  function umordnen(W, [O, kh, kb, Ci]) {
    const t = new Float32Array(W.length);
    for (let o = 0; o < O; o++) for (let k = 0; k < kh * kb; k++) for (let ci = 0; ci < Ci; ci++)
      t[(k * Ci + ci) * O + o] = W[(o * kh * kb + k) * Ci + ci];
    return t;
  }

  // Faltung im Format H×B×C, Gewichte wie in TFLite
  function faltung(x, H, B, C, s) {
    const [O, kh, kb, Ci] = s.form, [sh, sb] = s.schritt;
    let oh, ob, oben = 0, links = 0;
    if (s.rand === "same") {
      oh = Math.ceil(H / sh); ob = Math.ceil(B / sb);
      oben = Math.max(0, (oh - 1) * sh + kh - H) >> 1;
      links = Math.max(0, (ob - 1) * sb + kb - B) >> 1;
    } else {
      oh = Math.floor((H - kh) / sh) + 1; ob = Math.floor((B - kb) / sb) + 1;
    }
    const y = new Float32Array(oh * ob * O), WT = s.WT, bias = s.B;
    for (let oy = 0; oy < oh; oy++) {
      for (let ox = 0; ox < ob; ox++) {
        const ziel = (oy * ob + ox) * O;
        for (let o = 0; o < O; o++) y[ziel + o] = bias[o];
        for (let ky = 0; ky < kh; ky++) {
          const iy = oy * sh + ky - oben;
          if (iy < 0 || iy >= H) continue;
          for (let kx = 0; kx < kb; kx++) {
            const ix = ox * sb + kx - links;
            if (ix < 0 || ix >= B) continue;
            const quelle = (iy * B + ix) * C, wk = (ky * kb + kx) * Ci;
            for (let ci = 0; ci < Ci; ci++) {
              const xv = x[quelle + ci];
              if (xv === 0) continue;
              const wo = (wk + ci) * O;
              for (let o = 0; o < O; o++) y[ziel + o] += xv * WT[wo + o];
            }
          }
        }
      }
    }
    return { x: y, h: oh, b: ob, c: O };
  }

  function pool(x, H, B, C, s) {
    const [fh, fb] = s.fenster, [sh, sb] = s.schritt;
    let oh, ob, oben = 0, links = 0;
    if (s.rand === "same") {
      oh = Math.ceil(H / sh); ob = Math.ceil(B / sb);
      oben = Math.max(0, (oh - 1) * sh + fh - H) >> 1;
      links = Math.max(0, (ob - 1) * sb + fb - B) >> 1;
    } else {
      oh = Math.floor((H - fh) / sh) + 1; ob = Math.floor((B - fb) / sb) + 1;
    }
    const y = new Float32Array(oh * ob * C).fill(-Infinity);
    for (let oy = 0; oy < oh; oy++) for (let ox = 0; ox < ob; ox++) {
      const ziel = (oy * ob + ox) * C;
      for (let ky = 0; ky < fh; ky++) {
        const iy = oy * sh + ky - oben; if (iy < 0 || iy >= H) continue;
        for (let kx = 0; kx < fb; kx++) {
          const ix = ox * sb + kx - links; if (ix < 0 || ix >= B) continue;
          const q = (iy * B + ix) * C;
          for (let c = 0; c < C; c++) if (x[q + c] > y[ziel + c]) y[ziel + c] = x[q + c];
        }
      }
    }
    return { x: y, h: oh, b: ob };
  }

  function dicht(x, s) {
    const [O, I] = s.form, y = new Float32Array(O);
    for (let o = 0; o < O; o++) {
      let summe = s.B[o];
      const r = o * I;
      for (let i = 0; i < I; i++) summe += s.W[r + i] * x[i];
      y[o] = summe;
    }
    return y;
  }

  /* ---------- Auswertung wie in AI-on-the-edge-device ---------- */

  // Rollenmodell mit 10 Klassen: Ziffer mit Nachbarklasse zu einem stetigen Wert 0 … <10 verrechnet
  function zifferWert(p) {
    let n = 0;
    for (let i = 1; i < 10; i++) if (p[i] > p[n]) n = i;
    const plus = p[(n + 1) % 10], minus = p[(n + 9) % 10];
    let wert, guete;
    if (plus > minus) { wert = n + plus / (plus + p[n]); guete = p[n] + plus; }
    else { wert = n - minus / (p[n] + minus); guete = p[n] + minus; }
    wert = ((wert % 10) + 10) % 10;
    return { wert, guete };
  }

  // Zeigermodell liefert (sin, cos) des Zeigerwinkels
  function zeigerWert(f) {
    let t = Math.atan2(f[0], f[1]) / (2 * Math.PI);
    t = ((t % 1) + 1) % 1;
    return { wert: t * 10, guete: Math.min(1, Math.hypot(f[0], f[1])) };
  }

  const ganz10 = d => ((Math.round(d) % 10) + 10) % 10;

  /* Setzt Rollen (links nach rechts) und Zeiger (×0,1 abwärts) zu einem Stand zusammen.
     Jede Stelle wird mit dem Rohwert der nächstniedrigeren Stelle abgeglichen: steht die untere Stelle kurz vor
     dem Übertrag, darf die obere schon halb weitergedreht sein, ohne dass das schon zählt. */
  function zusammensetzen(rollen, zeiger, rot) {
    const zeigerZiffern = [], zeigerUnsicher = [];
    let unten = null;
    for (let i = zeiger.length - 1; i >= 0; i--) {
      const a = zeiger[i].wert;
      let d, unsicher;
      if (unten == null) { d = Math.floor(a + 0.05); unsicher = false; }
      else { const k = a - unten / 10; d = Math.round(k); unsicher = Math.abs(k - d) > 0.35; }
      zeigerZiffern[i] = ganz10(d); zeigerUnsicher[i] = unsicher || zeiger[i].guete < 0.5;
      unten = a;
    }
    const rollenZiffern = [], rollenUnsicher = [], zwischen = [];
    // Stellung der unteren Stelle bezogen auf ihre schon entschiedene Ziffer: eine als 9,8 gelesene,
    // aber als 0 entschiedene Rolle steht bei −0,2 (schon übergelaufen), nicht kurz vor dem Übertrag.
    const huelle = x => ((((x + 5) % 10) + 10) % 10) - 5;
    let untenZiffer = zeigerZiffern.length ? zeigerZiffern[0] : null;
    for (let i = rollen.length - 1; i >= 0; i--) {
      const v = rollen[i].wert;
      let d, unsicher = false;
      if (unten == null) {
        d = Math.floor(v + 0.1);
        const f = v - Math.floor(v);
        zwischen[i] = f > 0.35 && f < 0.9;
      } else {
        const l = untenZiffer + huelle(unten - untenZiffer);
        const schritt = v - (l >= 9 ? l - 9 : 0);   // Rolle springt nur beim Übertrag der unteren
        const stetig = v - l / 10;                    // Rolle läuft mit der unteren mit
        const rs = Math.abs(schritt - Math.round(schritt)), rt = Math.abs(stetig - Math.round(stetig));
        const k = rs <= rt ? schritt : stetig;
        d = Math.round(k);
        unsicher = Math.min(rs, rt) > 0.3;
        zwischen[i] = false;
      }
      rollenZiffern[i] = ganz10(d);
      rollenUnsicher[i] = unsicher || rollen[i].guete < 0.5;
      unten = v; untenZiffer = rollenZiffern[i];
    }
    const vor = rollenZiffern.slice(0, rollenZiffern.length - rot).join("");
    const nach = rollenZiffern.slice(rollenZiffern.length - rot).join("") + zeigerZiffern.join("");
    const text = (vor || "0") + (nach ? "," + nach : "");
    return {
      rollenZiffern, rollenUnsicher, zwischen, zeigerZiffern, zeigerUnsicher, text,
      stand: Number((vor || "0") + (nach ? "." + nach : "")),
    };
  }

  wurzel.Netz = { ladeNetz, rechne, zifferWert, zeigerWert, zusammensetzen };
})(typeof self !== "undefined" ? self : window);
