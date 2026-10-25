"""Referenz-Vorwärtsrechnung (numpy) für das gewandelte Format – Prüfmaßstab für die JavaScript-Fassung."""
import json, os, sys
import numpy as np
from PIL import Image

def lade(basis):
    d = json.load(open(basis + ".json")); w = np.fromfile(basis + ".bin", dtype="<f4")
    return d, w

def faltung(x, W, b, rand):
    H, B_, C = x.shape; O, kh, kw, _ = W.shape
    if rand == "same":
        ph, pw = (kh - 1) // 2, (kw - 1) // 2
        x = np.pad(x, ((ph, kh - 1 - ph), (pw, kw - 1 - pw), (0, 0)))
    oh, ow = x.shape[0] - kh + 1, x.shape[1] - kw + 1
    y = np.zeros((oh, ow, O), np.float32)
    for i in range(kh):
        for j in range(kw):
            y += x[i:i+oh, j:j+ow, :] @ W[:, i, j, :].T
    return y + b

def rechne(basis, bild):
    d, w = lade(basis); x = bild.astype(np.float32)
    nimm = lambda r, form: w[r[0]:r[0]+r[1]].reshape(form)
    for s in d["schichten"]:
        t = s["typ"]
        if t == "mul": x = x * nimm(s["w"], (-1,))
        elif t == "add": x = x + nimm(s["w"], (-1,))
        elif t == "conv": x = faltung(x, nimm(s["w"], s["form"]), nimm(s["b"], (-1,)), s["rand"])
        elif t == "leaky": x = np.where(x > 0, x, x * s["alpha"])
        elif t == "maxpool":
            fh, fw = s["fenster"]; H, B_, C = x.shape
            x = x[:H//fh*fh, :B_//fw*fw].reshape(H//fh, fh, B_//fw, fw, C).max(axis=(1, 3))
        elif t == "dense": x = nimm(s["w"], s["form"]) @ x.ravel() + nimm(s["b"], (-1,))
        elif t == "softmax": e = np.exp(x - x.max()); x = e / e.sum()
        if s.get("akt") == "relu": x = np.maximum(x, 0)
    return x

def ziffer_wert(p):
    n = int(np.argmax(p)); plus, minus = p[(n+1) % 10], p[(n-1) % 10]
    if plus > minus: r, fit = n + plus / (plus + p[n]), p[n] + plus
    else: r, fit = n - minus / (p[n] + minus), p[n] + minus
    return r % 10, fit

HIER = os.path.dirname(os.path.abspath(__file__))
MODELLE = os.path.join(HIER, "..", "app", "modelle")

def zeiger_wert(f):
    return float((np.arctan2(f[0], f[1]) / (2 * np.pi) + 2) % 1 * 10)

if __name__ == "__main__":
    # Prüft das Referenzbild aus AI-on-the-edge-device (Rollen 00016, Zeiger 3-1-3-9) und schreibt
    # Testvektoren, mit denen werkzeug/pruefen.html die JavaScript-Fassung vergleicht.
    bild = Image.open(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HIER, "..", "test", "referenz_ai-on-the-edge.jpg")).convert("RGB")
    vektoren = {"ziffer": [], "zeiger": []}
    for x in (213, 260, 308, 356, 404):
        a = np.asarray(bild.crop((x, 122, x + 32, 178)).resize((20, 32), Image.BILINEAR))
        p = rechne(os.path.join(MODELLE, "ziffer"), a); v, fit = ziffer_wert(p)
        print("Rolle  x=%3d  Wert %.2f  Güte %.2f" % (x, v, fit))
        vektoren["ziffer"].append({"eingang": a.ravel().tolist(), "ausgang": [float(t) for t in p]})
    for cx, cy in ((478, 276), (425, 378), (329, 420), (201, 374)):
        a = np.asarray(bild.crop((cx - 46, cy - 46, cx + 46, cy + 46)).resize((32, 32), Image.BILINEAR))
        f = rechne(os.path.join(MODELLE, "zeiger"), a)
        print("Zeiger (%d,%d)  Wert %.2f" % (cx, cy, zeiger_wert(f)))
        vektoren["zeiger"].append({"eingang": a.ravel().tolist(), "ausgang": [float(t) for t in f]})
    json.dump(vektoren, open(os.path.join(HIER, "testvektoren.json"), "w"))
