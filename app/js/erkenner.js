/* Worker: rechnet die Ausschnitte durch die Modelle, damit die Bedienung flüssig bleibt. */
"use strict";
importScripts("netz.js");

const bereit = Promise.all([Netz.ladeNetz("../modelle/ziffer"), Netz.ladeNetz("../modelle/zeiger")])
  .then(([ziffer, zeiger]) => ({ ziffer, zeiger }));

self.onmessage = async e => {
  const { id, ziffern, zeiger } = e.data;
  try {
    const netze = await bereit;
    self.postMessage({
      id,
      ziffern: ziffern.map(px => Netz.zifferWert(netze.ziffer.rechne(px))),
      zeiger: zeiger.map(px => Netz.zeigerWert(netze.zeiger.rechne(px))),
    });
  } catch (err) {
    self.postMessage({ id, fehler: String((err && err.message) || err) });
  }
};
