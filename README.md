# Zählerbuch

Wasseruhren und alte Ferraris-Stromzähler mit der Handykamera ablesen. Die App läuft komplett auf dem Handy:
Die Erkennung rechnet auf dem Gerät, die Daten liegen nur dort, nach dem ersten Öffnen geht alles ohne Internet.

Beim ersten Start sind diese Zähler angelegt: Wasseruhr Stadtwasser, Wasseruhr Warmwasser, Wasseruhr Brunnen,
Wasseruhr Kühlwasser, PV-Stromzähler (Ferraris), Heizölzähler (Liter), Heizung Betriebsstunden (h) und
Brenner Starts. Bei bestehenden Daten kommen die drei Heizungszähler beim nächsten Start einmal dazu.
Weitere kommen über „+ Zähler“ dazu.

**Gute Fotos:** nah heran (die Rollen sollten mindestens ein Drittel der Bildbreite füllen), gerade von vorn,
scharf, ohne Spiegelung im Glas. Bei sehr kleinen oder unscharfen Ziffern findet die Automatik die Reihe oft
noch, liest aber einzelne Ziffern falsch.

## So wird abgelesen

1. Zähler wählen, „Ablesen“ tippen. Die Kamera zeigt einen weißen Rahmen mit einem Feld je Rolle.
2. **Automatik** (grüner Knopf oben links im Kamerabild): Die App sucht im Live-Bild die Reihe der Zählerrollen
   (gleich große Ziffern in gleichem Abstand nebeneinander, schwarze und rote Rollen) und legt den Rahmen darauf,
   mit passender Größe, Höhe und Schräglage. Beim ersten Ablesen eines Zählers zählt sie auch die Rollen und
   erkennt rote Nachkommarollen an der Farbe. Ist eine Schablone gespeichert, bleibt deren Rollenzahl fest und nur
   Lage und Größe folgen. Wer den Rahmen von Hand zieht, schaltet die Automatik für diese Aufnahme aus.
   Eine gefundene Reihe wird festgehalten; andere Zahlenreihen (Seriennummer, Baujahr, Aufdrucke) übernimmt die
   Automatik erst, wenn das Zählwerk einige Sekunden nicht mehr zu sehen ist. **Nimmt sie die falsche Reihe, einmal
   im Bild auf das Zählwerk tippen**: Dann sucht sie genau dort und bleibt dabei.
3. Handy ruhig und gerade vor das Zählwerk halten, bis „Zählwerk erkannt“ erscheint, dann den **runden Auslöser**
   unten im Kamerabild tippen. Im Standbild sucht die App noch einmal genauer und lässt bei mehreren Möglichkeiten
   (etwa Zählwerk oder aufgedruckte Seriennummer) das Ziffernmodell entscheiden. „Automatisch ausrichten“ wiederholt das.
4. **Zeigerrädchen** (×0,1 ×0,01 … auf Wasseruhren) findet die Automatik nicht von selbst. Einmal je Zähler unter
   „Schablone“ bei „Zeigerrädchen“ auf „+“ tippen und dann im Bild auf die Mitte des Rädchens tippen, mit ×0,1
   anfangen, dann ×0,01 usw. „Antippen“ setzt alle noch einmal neu. Die Kreise lassen sich bei offener Schablone
   auch verschieben und am gelben Randpunkt in der Größe ändern. Sie sind an den Rollenrahmen gebunden und wandern
   mit ihm mit, beim nächsten Mal sitzen sie also von selbst richtig. Jedes Rädchen liest ein eigenes Zeigermodell
   (Winkel des roten Zeigers), und zwar an mehreren eng benachbarten Mitten; die Richtungen werden gemittelt, damit
   ein Tipp etwas neben der Mitte oder ein blasser Zeiger nicht gleich zu einer falschen Ziffer führt. Sind sich
   die Lesungen uneinig (Spiegelung), wird die Stelle orange markiert. Die Stellen werden mit Übertrag zusammengesetzt.
   Unter „Schablone“ lassen sich auch Rollenzahl, Rahmenhöhe und Drehung von Hand einstellen.
5. Über jedem Feld steht die erkannte Ziffer, darunter die Ausschnitte. Orange markierte Stellen sind unsicher.
   Sitzt der Rahmen nicht ganz, im Standbild nachziehen (zwei Finger oder „+“ zum Vergrößern); die Erkennung
   rechnet sofort neu.
6. Stand prüfen, notfalls von Hand korrigieren, **Speichern**. Das Foto bleibt als Beleg, die Schablone wird für
   das nächste Mal gemerkt.

Die App warnt, wenn der Stand kleiner ist als zuletzt oder der Verbrauch ungewöhnlich hoch ist (mehr als das
Dreifache des Durchschnitts).

**Wichtig:** Die Netze lesen, was in den Feldern steht. Sitzt der Rahmen daneben, kommt zuverlässig Unsinn
heraus, manchmal sogar ohne Warnung. Deshalb jeden Stand vor dem Speichern mit dem Zähler vergleichen.

Ohne Live-Kamera (z. B. wenn die Seite über einfaches http geöffnet ist) geht es über „Foto aufnehmen“ oder
„Aus Galerie“: Foto wählen, Rahmen auf die Rollen ziehen. Bei Fotos aus der Galerie wird das Aufnahmedatum der
Datei als Ablesezeit vorgeschlagen.

## Aufs Handy bringen

Kamera und Offline-Betrieb erlauben Browser nur über **HTTPS**. Die App braucht dafür nur einen Ort, der die
Dateien aus `app/` ausliefert. Deine Zählerstände gelangen nie dorthin.

**Weg A: GitHub Pages (kostenlos)**
1. Diesen Ordner als Repository auf GitHub hochladen (öffentlich; private Repos können Pages nur mit Bezahlkonto).
2. Im Repository unter *Settings → Pages* bei *Source* „GitHub Actions“ wählen. Der Ablauf in
   `.github/workflows/pages.yml` veröffentlicht dann bei jedem Push den Ordner `app/`.
3. Die Adresse (`https://<name>.github.io/<repo>/`) auf dem Handy öffnen.

**Weg B: Netlify Drop (ohne Git)**
`app.netlify.com/drop` öffnen und den Ordner `app/` hineinziehen. Man bekommt sofort eine HTTPS-Adresse.

**Dann auf dem Handy installieren**
- iPhone (Safari): Teilen → „Zum Home-Bildschirm“.
- Android (Chrome): Menü ⋮ → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

Ab dann startet das Zählerbuch wie eine App vom Startbildschirm, auch ohne Netz. Die Kamera einmal erlauben.

**Nur am PC testen:** im Ordner `app/` `python -m http.server 8000` starten und `http://localhost:8000` öffnen
(auf localhost erlaubt der Browser Kamera und Offline-Betrieb auch ohne HTTPS).

## Daten sichern

Alles liegt im Speicher des Browsers auf dem Handy (IndexedDB). Unter **Daten**:
- **Sicherung speichern** erzeugt eine JSON-Datei mit allen Zählern, Ablesungen und Fotos (auf dem Handy über
  „Teilen“, z. B. in „Dateien“ oder Google Drive ablegen). **Sicherung laden** spielt sie wieder ein, etwa auf
  einem neuen Handy.
- **Tabelle (CSV) exportieren** für Excel (Semikolon, deutsches Komma).

Als installierte App bleiben die Daten erhalten. Im normalen Browser-Tab darf vor allem Safari nach längerer
Nichtnutzung Daten löschen. Deshalb installieren und ab und zu sichern.

## Updates

Nach Änderungen an Dateien in `app/` in `app/sw.js` die Zeile `const STAND = "zaehlerbuch-1"` hochzählen. Die
installierte App zeigt dann „Eine neue Version ist da“ und lädt mit einem Tipp neu.

## Aufbau

```
app/                 die App (das wird ausgeliefert)
  index.html, app.css
  js/app.js          Bedienung, Kamera, Schablone, Speicher, Verlauf
  js/netz.js         Rechenwerk der neuronalen Netze und Zusammensetzen der Stellen (Überträge)
  js/suche.js        Automatik: findet die Rollenreihe im Bild (adaptive Schwelle, Ziffernketten)
  js/erkenner.js     Worker, der die Ausschnitte rechnet
  modelle/           Ziffern- und Zeigermodell im eigenen Format (.json + .bin) mit Lizenz
  sw.js, manifest.webmanifest, icons/
werkzeug/            Hilfen am PC (Python mit numpy, pillow, tflite)
  modell_wandeln.py  .tflite → app/modelle/*.json/.bin
  modell_ansehen.py  Schichten eines .tflite-Modells auflisten
  vorwaerts.py       Referenzrechnung in numpy, schreibt testvektoren.json
  pruefen.html       vergleicht die JavaScript-Rechnung mit der Referenz, testet die Übertragslogik
  suche-pruefen.html Automatik an eigenen Fotos in test/eigene/1.jpg … (nicht im Repository), mit Ergebnisbildern
  testserver.py      Testserver: wie http.server, nimmt zusätzlich Ergebnisbilder der Prüfseiten an (test/ausgabe/)
  icons_erzeugen.py  App-Symbole
quellmodelle/        Original-Modelle (.tflite) aus AI-on-the-edge-device
test/                Referenzbild aus AI-on-the-edge-device (Rollen 00016, Zeiger 3-1-3-9)
```

Prüfen am PC: im Projektordner `python werkzeug/testserver.py 8791`, dann
`http://localhost:8791/werkzeug/pruefen.html` (Rechenwerk) und
`http://localhost:8791/werkzeug/suche-pruefen.html?pruefen=1` (Automatik an eigenen Fotos).

## Erkennung und Lizenz

Die Erkennung nutzt zwei kleine neuronale Netze aus dem Projekt
[AI-on-the-edge-device](https://github.com/jomjol/AI-on-the-edge-device) von jomjol:
`dig-cont_0900_s3_q` (Rollenziffern, liefert auch Zwischenstellungen) und `ana-cont_1500_s2_q` (Zeigerrädchen).
Sie sind hier verändert, nämlich vom int8-TFLite-Format in Float-Gewichte für ein eigenes JavaScript-Rechenwerk
umgewandelt. Das Original stammt nicht von hier, und jomjol ist für diese Fassung nicht verantwortlich.

Die Modelle stehen unter der *Dual Use License for AI-on-the-Edge Device*: Die private, nicht kommerzielle Nutzung
ist frei, kommerzielle Nutzung braucht eine eigene Lizenz. Der unveränderte Lizenztext liegt in
`app/modelle/LIZENZ-AI-on-the-edge.md` und `quellmodelle/`. Nach dieser Lizenz dürfen die Ergebnisse nicht für
Zwecke verwendet werden, bei denen es auf hohe Zuverlässigkeit ankommt. Für die Abrechnung zählt der Stand am
Zähler selbst.
