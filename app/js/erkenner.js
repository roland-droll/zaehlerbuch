/* Worker: rechnet die Ausschnitte durch die Modelle und sucht die Rollenreihe, damit die Bedienung flüssig bleibt. */
"use strict";
importScripts("netz.js", "suche.js");

const bereit = Promise.all([Netz.ladeNetz("../modelle/ziffer"), Netz.ladeNetz("../modelle/zeiger")])
  .then(([ziffer, zeiger]) => ({ ziffer, zeiger }));

// 32×32-Ausschnitt aus einem quadratischen RGB-Bild (Seite S), Mitte (cx, cy) und Seitenlänge in Pixeln
function ausRegion(px, S, cx, cy, seite) {
  const aus = new Float32Array(32 * 32 * 3), schritt = seite / 32;
  let k = 0;
  for (let v = 0; v < 32; v++) for (let u = 0; u < 32; u++) {
    const x = cx + (u + 0.5 - 16) * schritt - 0.5, y = cy + (v + 0.5 - 16) * schritt - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let q = 0; q < 4; q++) {
        const xx = Math.min(S - 1, Math.max(0, x0 + (q & 1))), yy = Math.min(S - 1, Math.max(0, y0 + (q >> 1)));
        s += px[(yy * S + xx) * 3 + c] * ((q & 1) ? fx : 1 - fx) * ((q >> 1) ? fy : 1 - fy);
      }
      aus[k++] = s;
    }
  }
  return aus;
}

/* Zeigerrad: an mehreren eng benachbarten Mitten und zwei Größen lesen und die Richtungen gewichtet mitteln.
   Ein einzelner Ausschnitt springt bei blassen oder spiegelnden Zeigern schon bei kleinen Verschiebungen;
   das Mittel bleibt stabil. Die Region ist 2,6 Radien breit, die angetippte Mitte bleibt, wo sie ist. */
function zeigerLesen(netz, region, gruendlich) {
  const S = Math.round(Math.sqrt(region.length / 3)), r = S / 2.6, m = S / 2;
  const n = gruendlich ? 2 : 1, schritt = gruendlich ? 0.06 : 0.08;
  let sx = 0, sy = 0, summe = 0, anzahl = 0;
  for (const rf of [0.92, 1.0]) for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const f = netz.rechne(ausRegion(region, S, m + i * schritt * r, m + j * schritt * r, 2 * r * rf));
    const q = Math.hypot(f[0], f[1]);
    if (!q) continue;
    const w = q * q;
    sx += (w * f[0]) / q; sy += (w * f[1]) / q; summe += w; anzahl++;
  }
  const w = Netz.zeigerWert([sx, sy]);
  // Güte: wie einig sich die Lesungen sind (1 = alle gleich)
  return { wert: w.wert, guete: summe ? Math.hypot(sx, sy) / summe : 0, dx: 0, dy: 0, rf: 1, lesungen: anzahl };
}

self.onmessage = async e => {
  const d = e.data;
  try {
    const netze = await bereit;
    if (d.typ === "suchen") {
      const treffer = Suche.sucheReihe(d.rgba, d.W, d.H, { erwartet: d.erwartet, pruefen: d.pruefen, netz: netze.ziffer, fokus: d.fokus, sperre: d.sperre });
      self.postMessage({ id: d.id, treffer });
      return;
    }
    self.postMessage({
      id: d.id,
      ziffern: d.ziffern.map(px => Netz.zifferWert(netze.ziffer.rechne(px))),
      zeiger: d.zeiger.map(region => zeigerLesen(netze.zeiger, region, d.gruendlich)),
    });
  } catch (err) {
    self.postMessage({ id: d.id, fehler: String((err && err.message) || err) });
  }
};
