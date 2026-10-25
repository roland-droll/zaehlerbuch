/* Worker: rechnet die Ausschnitte durch die Modelle und sucht die Rollenreihe, damit die Bedienung flüssig bleibt. */
"use strict";
importScripts("netz.js", "suche.js");

const bereit = Promise.all([Netz.ladeNetz("../modelle/ziffer"), Netz.ladeNetz("../modelle/zeiger")])
  .then(([ziffer, zeiger]) => ({ ziffer, zeiger }));

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
      zeiger: d.zeiger.map(px => Netz.zeigerWert(netze.zeiger.rechne(px))),
    });
  } catch (err) {
    self.postMessage({ id: d.id, fehler: String((err && err.message) || err) });
  }
};
