# Zählerbuch

Wasseruhren und alte Ferraris-Stromzähler mit der Handykamera ablesen. Die App läuft komplett auf dem Handy:
Die Erkennung rechnet auf dem Gerät, die Daten liegen nur dort, nach dem ersten Öffnen geht alles ohne Internet.

Beim ersten Start sind diese Zähler angelegt: Wasseruhr Stadtwasser, Wasseruhr Warmwasser, Wasseruhr Brunnen,
Wasseruhr Kühlwasser, PV-Stromzähler (Ferraris). Weitere kommen über „+ Zähler“ dazu.

## So wird abgelesen

1. Zähler wählen, „Ablesen“ tippen. Die Kamera zeigt einen weißen Rahmen mit einem Feld je Rolle.
2. **Beim ersten Mal die Schablone einstellen** (Feld „Schablone“ klappt dann von selbst auf):
   - Anzahl schwarzer Rollen (ganze m³ bzw. kWh) und roter Rollen (Nachkommastellen).
   - Hat die Wasseruhr rote Zeigerrädchen (×0,1 ×0,01 …), die Zahl der Zeiger einstellen und die gelben Kreise
     auf die Rädchen ziehen. Am gelben Punkt am Kreisrand lässt sich die Größe ändern.
   - Rahmen verschieben (in den Rahmen tippen und ziehen), Größe an der weißen Ecke unten rechts ziehen, bei
     aufgeklappter Schablone ändert die Ecke auch die Höhe. Für schief montierte Zähler gibt es den Regler „Drehung“.
3. Handy so halten, dass die Rollen genau in den Feldern sitzen, dann **Aufnehmen**.
4. Über jedem Feld steht die erkannte Ziffer, darunter die Ausschnitte. Orange markierte Stellen sind unsicher.
   Sitzt der Rahmen nicht ganz, im Standbild nachziehen (zwei Finger oder „+“ zum Vergrößern); die Erkennung
   rechnet sofort neu.
5. Stand prüfen, notfalls von Hand korrigieren, **Speichern**. Das Foto bleibt als Beleg, die Schablone wird für
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
  js/erkenner.js     Worker, der die Ausschnitte rechnet
  modelle/           Ziffern- und Zeigermodell im eigenen Format (.json + .bin) mit Lizenz
  sw.js, manifest.webmanifest, icons/
werkzeug/            Hilfen am PC (Python mit numpy, pillow, tflite)
  modell_wandeln.py  .tflite → app/modelle/*.json/.bin
  modell_ansehen.py  Schichten eines .tflite-Modells auflisten
  vorwaerts.py       Referenzrechnung in numpy, schreibt testvektoren.json
  pruefen.html       vergleicht die JavaScript-Rechnung mit der Referenz, testet die Übertragslogik
  icons_erzeugen.py  App-Symbole
quellmodelle/        Original-Modelle (.tflite) aus AI-on-the-edge-device
test/                Referenzbild aus AI-on-the-edge-device (Rollen 00016, Zeiger 3-1-3-9)
```

Prüfen am PC: im Projektordner `python -m http.server 8765`, dann `http://localhost:8765/werkzeug/pruefen.html`.

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
