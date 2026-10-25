"""Wandelt ein int8-TFLite-Modell (AI-on-the-edge) in ein schlankes Float-Format für das Zählerbuch:
<name>.json (Schichtenfolge) + <name>.bin (float32-Gewichte, little endian)."""
import sys, json, struct
import numpy as np
import tflite
from tflite.BuiltinOperator import BuiltinOperator as BO
from tflite.BuiltinOptions import BuiltinOptions as BOpt
from tflite.Padding import Padding
from tflite.ActivationFunctionType import ActivationFunctionType as AF

def lade(pfad):
    buf = open(pfad, 'rb').read()
    m = tflite.Model.GetRootAsModel(buf, 0)
    return m, m.Subgraphs(0)

def tensor_wert(m, g, i):
    t = g.Tensors(i)
    raw = m.Buffers(t.Buffer()).DataAsNumpy()
    typ = {tflite.TensorType.INT8: np.int8, tflite.TensorType.INT32: np.int32, tflite.TensorType.FLOAT32: np.float32}[t.Type()]
    a = np.frombuffer(raw.tobytes(), dtype=typ).reshape(t.ShapeAsNumpy())
    q = t.Quantization()
    if t.Type() == tflite.TensorType.FLOAT32 or not q or not q.ScaleLength():
        return a.astype(np.float32)
    s = q.ScaleAsNumpy(); z = q.ZeroPointAsNumpy()
    dim = q.QuantizedDimension()
    if len(s) > 1:
        form = [1]*a.ndim; form[dim] = -1
        s = s.reshape(form); z = z.reshape(form)
    return ((a.astype(np.float32) - z) * s).astype(np.float32)

def opts(op, cls):
    o = cls(); t = op.BuiltinOptions(); o.Init(t.Bytes, t.Pos); return o

AKT = {AF.NONE: None, AF.RELU: "relu"}

def wandeln(pfad, ziel):
    m, g = lade(pfad)
    schichten, gewichte = [], []
    def ablegen(arr):
        start = sum(x.size for x in gewichte)
        gewichte.append(arr.astype('<f4').ravel())
        return [int(start), int(arr.size)]
    for k in range(g.OperatorsLength()):
        op = g.Operators(k)
        code = m.OperatorCodes(op.OpcodeIndex())
        c = max(code.BuiltinCode(), code.DeprecatedBuiltinCode())
        if c in (BO.QUANTIZE, BO.DEQUANTIZE, BO.RESHAPE):
            continue
        if c in (BO.MUL, BO.ADD):
            konst = tensor_wert(m, g, op.Inputs(1))
            a = None
            o = opts(op, tflite.MulOptions if c == BO.MUL else tflite.AddOptions)
            a = AKT[o.FusedActivationFunction()]
            schichten.append({"typ": "mul" if c == BO.MUL else "add", "w": ablegen(konst), "akt": a})
        elif c == BO.CONV_2D:
            o = opts(op, tflite.Conv2DOptions)
            w = tensor_wert(m, g, op.Inputs(1))          # [aus, kh, kw, ein]
            b = tensor_wert(m, g, op.Inputs(2))
            schichten.append({"typ": "conv", "form": [int(x) for x in w.shape], "w": ablegen(w), "b": ablegen(b),
                              "schritt": [o.StrideH(), o.StrideW()], "rand": "same" if o.Padding() == Padding.SAME else "valid",
                              "akt": AKT[o.FusedActivationFunction()]})
        elif c == BO.MAX_POOL_2D:
            o = opts(op, tflite.Pool2DOptions)
            schichten.append({"typ": "maxpool", "fenster": [o.FilterHeight(), o.FilterWidth()], "schritt": [o.StrideH(), o.StrideW()],
                              "rand": "same" if o.Padding() == Padding.SAME else "valid"})
        elif c == BO.LEAKY_RELU:
            o = opts(op, tflite.LeakyReluOptions)
            schichten.append({"typ": "leaky", "alpha": float(o.Alpha())})
        elif c == BO.FULLY_CONNECTED:
            o = opts(op, tflite.FullyConnectedOptions)
            w = tensor_wert(m, g, op.Inputs(1))          # [aus, ein]
            b = tensor_wert(m, g, op.Inputs(2))
            schichten.append({"typ": "dense", "form": [int(x) for x in w.shape], "w": ablegen(w), "b": ablegen(b),
                              "akt": AKT[o.FusedActivationFunction()]})
        elif c == BO.SOFTMAX:
            schichten.append({"typ": "softmax", "beta": float(opts(op, tflite.SoftmaxOptions).Beta())})
        else:
            raise SystemExit(f"Operator {c} nicht unterstützt")
    eingang = [int(x) for x in g.Tensors(g.Inputs(0)).ShapeAsNumpy()][1:]
    aus = [int(x) for x in g.Tensors(g.Outputs(0)).ShapeAsNumpy()][1:]
    alle = np.concatenate(gewichte)
    open(ziel + ".bin", "wb").write(alle.tobytes())
    json.dump({"quelle": pfad.replace("\\", "/").split("/")[-1], "eingang": eingang, "ausgang": aus, "schichten": schichten},
              open(ziel + ".json", "w"), indent=1)
    print(ziel, eingang, aus, len(schichten), "Schichten", alle.size * 4 // 1024, "KiB")

if __name__ == "__main__":
    wandeln(sys.argv[1], sys.argv[2])
