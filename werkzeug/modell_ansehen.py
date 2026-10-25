import sys, tflite
from tflite.BuiltinOperator import BuiltinOperator
from tflite.TensorType import TensorType
OPS = {v:k for k,v in BuiltinOperator.__dict__.items() if not k.startswith('_')}
TT = {v:k for k,v in TensorType.__dict__.items() if not k.startswith('_')}
buf = open(sys.argv[1],'rb').read()
m = tflite.Model.GetRootAsModel(buf, 0)
g = m.Subgraphs(0)
def t(i):
    x = g.Tensors(i); q = x.Quantization()
    sc = q.ScaleAsNumpy() if q and q.ScaleLength() else None
    zp = q.ZeroPointAsNumpy() if q and q.ZeroPointLength() else None
    return f"#{i} {x.Name().decode()} {list(x.ShapeAsNumpy()) if x.ShapeLength() else []} {TT[x.Type()]} s={None if sc is None else (sc[:3] if len(sc)>1 else sc[0])} z={None if zp is None else (zp[:3] if len(zp)>1 else zp[0])}"
print("inputs", [t(g.Inputs(i)) for i in range(g.InputsLength())])
print("outputs", [t(g.Outputs(i)) for i in range(g.OutputsLength())])
for i in range(g.OperatorsLength()):
    op = g.Operators(i); code = m.OperatorCodes(op.OpcodeIndex())
    c = max(code.BuiltinCode(), code.DeprecatedBuiltinCode())
    print(i, OPS.get(c,c), "in:", [t(op.Inputs(j)) for j in range(op.InputsLength()) if op.Inputs(j)>=0], "out:", [t(op.Outputs(j)) for j in range(op.OutputsLength())])
