"""Erzeugt die App-Symbole (Rollenzählwerk 0 4 2 mit roter Nachkommarolle) nach app/icons/."""
import os
from PIL import Image, ImageDraw, ImageFont

HIER = os.path.dirname(os.path.abspath(__file__))
ZIEL = os.path.join(HIER, "..", "app", "icons")
BLAU, DUNKEL, ROT, HELL = (28, 91, 132), (26, 30, 33), (194, 47, 41), (246, 246, 244)


def schrift(groesse):
    for name in ("arialbd.ttf", "DejaVuSans-Bold.ttf", "Arial Bold.ttf"):
        for ordner in ("C:/Windows/Fonts", "/usr/share/fonts/truetype/dejavu", "/Library/Fonts"):
            p = os.path.join(ordner, name)
            if os.path.exists(p):
                return ImageFont.truetype(p, groesse)
    return ImageFont.load_default()


def symbol(n, rand=0.0, ecken=True):
    """rand: Anteil Sicherheitszone (für maskierbare Symbole)."""
    groß = 1024
    img = Image.new("RGB", (groß, groß), BLAU)
    g = ImageDraw.Draw(img)
    if ecken:
        img = Image.new("RGBA", (groß, groß), (0, 0, 0, 0))
        g = ImageDraw.Draw(img)
        g.rounded_rectangle((0, 0, groß - 1, groß - 1), radius=int(groß * 0.22), fill=BLAU)
    innen = groß * (1 - 2 * rand)
    x0 = groß * rand + innen * 0.1
    breite = innen * 0.8
    rollen = ["0", "4", "2", "7"]
    rb = breite / len(rollen)
    hoehe = rb * 1.75
    y0 = groß / 2 - hoehe / 2
    g.rounded_rectangle((x0 - rb * 0.12, y0 - rb * 0.12, x0 + breite + rb * 0.12, y0 + hoehe + rb * 0.12), radius=int(rb * 0.2), fill=(14, 17, 19))
    f = schrift(int(rb * 1.05))
    for i, z in enumerate(rollen):
        xa = x0 + i * rb + rb * 0.06
        farbe = ROT if i == len(rollen) - 1 else DUNKEL
        g.rounded_rectangle((xa, y0, xa + rb * 0.88, y0 + hoehe), radius=int(rb * 0.1), fill=farbe)
        g.text((xa + rb * 0.44, y0 + hoehe / 2), z, font=f, fill=HELL, anchor="mm")
    # Einheitenstrich unter dem Zählwerk
    g.rounded_rectangle((x0, y0 + hoehe + rb * 0.45, x0 + breite * 0.45, y0 + hoehe + rb * 0.62), radius=int(rb * 0.08), fill=HELL)
    return img.resize((n, n), Image.LANCZOS)


os.makedirs(ZIEL, exist_ok=True)
symbol(192).save(os.path.join(ZIEL, "icon-192.png"))
symbol(512).save(os.path.join(ZIEL, "icon-512.png"))
symbol(512, rand=0.1, ecken=False).save(os.path.join(ZIEL, "icon-maskable-512.png"))
symbol(180, ecken=False).save(os.path.join(ZIEL, "apple-touch-icon.png"))
print("Symbole erzeugt in", os.path.normpath(ZIEL))
