# Converts MakeHuman (CC0) data into one compact file for the 3D wardrobe:
#   body3d.json  structure (groups, morph list, bones, eye proxy)
#   body3d.bin   typed arrays, referenced by byte offset from the json
import json, struct, numpy as np, os
from PIL import Image

D = '/tmp/claude-0/mh/makehuman/makehuman/data'
T = D + '/targets'
OUT = '/tmp/claude-0/mh/out'
os.makedirs(OUT, exist_ok=True)

# ─── Base mesh ────────────────────────────────────────────────────
V, VT, faces = [], [], []   # faces: (group, [(v, vt), ...])
grp = None
for line in open(D + '/3dobjs/base.obj'):
    if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
    elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith('g '): grp = line.split()[1]
    elif line.startswith('f '):
        cs = [tuple(int(p) - 1 for p in t.split('/')[:2]) for t in line.split()[1:]]
        faces.append((grp, cs))
V = np.array(V, dtype=np.float64); VT = np.array(VT, dtype=np.float64)
N = len(V)

def target(name):
    """Sparse target file -> dense (N,3) delta."""
    d = np.zeros((N, 3))
    for line in open(f'{T}/{name}.target'):
        if line.startswith('#') or not line.strip(): continue
        p = line.split(); d[int(p[0])] = [float(p[1]), float(p[2]), float(p[3])]
    return d

# A young woman of average build is the starting shape (MakeHuman's "universal" targets are ethnicity-neutral).
U = lambda m, w: target(f'macrodetails/universal-female-young-{m}muscle-{w}weight')
avg = U('average', 'average')
base = V + avg

# Morphs: (name, negative-end target, positive-end target); each is a delta from the base shape.
H = lambda m, w, h: target(f'macrodetails/height/female-young-{m}muscle-{w}weight-{h}height')
B = lambda c, f: target(f'breast/female-young-averagemuscle-averageweight-{c}cup-{f}firmness')
both = lambda a, b: target(a) + target(b)
morphs = [
    ('weight', U('average', 'min') - avg, U('average', 'max') - avg),
    ('muscle', U('min', 'average') - avg, U('max', 'average') - avg),
    ('height', H('average', 'average', 'min'), H('average', 'average', 'max')),
    ('cup', B('min', 'average'), B('max', 'average')),
    ('firmness', B('average', 'min'), B('average', 'max')),
]
pair = lambda n, a, b: morphs.append((n, target(a), target(b)))
for n, f in [('bust', 'bust-circ'), ('underbust', 'underbust-circ'), ('waist', 'waist-circ'), ('hips', 'hips-circ'), ('thighs', 'thigh-circ'),
             ('shoulders', 'shoulder-dist'), ('upperarm', 'upperarm-circ'), ('torsoLength', 'napetowaist-dist'), ('legLength', 'upperleg-height'),
             ('neckLength', 'neck-height'), ('calves', 'calf-circ')]:
    pair(n, f'measure/measure-{f}-decr', f'measure/measure-{f}-incr')
pair('buttocks', 'buttocks/buttocks-volume-decr', 'buttocks/buttocks-volume-incr')
pair('tummy', 'stomach/stomach-pregnant-decr', 'stomach/stomach-pregnant-incr')
# face
zero = np.zeros((N, 3))
for n in ['round', 'square', 'oval', 'invertedtriangular', 'diamond', 'rectangular']:
    morphs.append(('head_' + n, zero, target('head/head-' + n)))
pair('headWidth', 'head/head-scale-horiz-decr', 'head/head-scale-horiz-incr')
pair('headLength', 'head/head-scale-vert-decr', 'head/head-scale-vert-incr')
pair('jaw', 'chin/chin-width-decr', 'chin/chin-width-incr')
pair('chin', 'chin/chin-prominent-decr', 'chin/chin-prominent-incr')
pair('chinHeight', 'chin/chin-height-decr', 'chin/chin-height-incr')
morphs.append(('cheeks', both('cheek/l-cheek-bones-decr', 'cheek/r-cheek-bones-decr'), both('cheek/l-cheek-bones-incr', 'cheek/r-cheek-bones-incr')))
morphs.append(('cheekFull', both('cheek/l-cheek-volume-decr', 'cheek/r-cheek-volume-decr'), both('cheek/l-cheek-volume-incr', 'cheek/r-cheek-volume-incr')))
pair('noseWidth', 'nose/nose-scale-horiz-decr', 'nose/nose-scale-horiz-incr')
pair('noseFlare', 'nose/nose-flaring-decr', 'nose/nose-flaring-incr')
pair('noseLength', 'nose/nose-scale-vert-decr', 'nose/nose-scale-vert-incr')
pair('noseBridge', 'nose/nose-width1-decr', 'nose/nose-width1-incr')
pair('upperLip', 'mouth/mouth-upperlip-volume-decr', 'mouth/mouth-upperlip-volume-incr')
pair('lowerLip', 'mouth/mouth-lowerlip-volume-decr', 'mouth/mouth-lowerlip-volume-incr')
pair('mouthWidth', 'mouth/mouth-scale-horiz-decr', 'mouth/mouth-scale-horiz-incr')
morphs.append(('eyeSize', both('eyes/l-eye-scale-decr', 'eyes/r-eye-scale-decr'), both('eyes/l-eye-scale-incr', 'eyes/r-eye-scale-incr')))
morphs.append(('eyeGap', both('eyes/l-eye-trans-in', 'eyes/r-eye-trans-in'), both('eyes/l-eye-trans-out', 'eyes/r-eye-trans-out')))
morphs.append(('eyeTilt', both('eyes/l-eye-corner1-down', 'eyes/r-eye-corner1-down'), both('eyes/l-eye-corner1-up', 'eyes/r-eye-corner1-up')))
morphs.append(('eyeOpen', both('eyes/l-eye-height2-decr', 'eyes/r-eye-height2-decr'), both('eyes/l-eye-height2-incr', 'eyes/r-eye-height2-incr')))
pair('browHeight', 'eyebrows/eyebrows-trans-down', 'eyebrows/eyebrows-trans-up')
pair('browAngle', 'eyebrows/eyebrows-angle-down', 'eyebrows/eyebrows-angle-up')

# ─── Quads for the groups we draw (subdivided and split at UV seams in the browser) ─
DRAW = {'body': ['body'], 'tights': ['helper-tights'], 'skirt': ['helper-skirt'],
        'lashes': [g for g in {f[0] for f in faces} if 'eyelashes' in g]}
gquads = {}
for name, gs in DRAW.items():
    q = []
    for g, cs in faces:
        if g not in gs: continue
        assert len(cs) == 4
        for v, t in cs: q += [v, max(t, 0)]
    gquads[name] = q

# ─── Skeleton and weights ─────────────────────────────────────────
skel = json.load(open(D + '/rigs/default.mhskel'))
W = json.load(open(D + '/rigs/default_weights.mhw'))['weights']
names = sorted(skel['bones'], key=lambda n: (0 if skel['bones'][n]['parent'] is None else 1, n))
# order so parents come first
order, seen = [], set()
def add(n):
    if n in seen: return
    p = skel['bones'][n]['parent']
    if p: add(p)
    seen.add(n); order.append(n)
for n in names: add(n)
bones = [{'name': n, 'parent': order.index(skel['bones'][n]['parent']) if skel['bones'][n]['parent'] else -1,
          'head': skel['joints'][skel['bones'][n]['head']], 'tail': skel['joints'][skel['bones'][n]['tail']]} for n in order]
per = [[] for _ in range(N)]
for bn, lst in W.items():
    bi = order.index(bn)
    for v, w in lst: per[v].append((w, bi))
SI = np.zeros((N, 4), dtype=np.uint8); SW = np.zeros((N, 4), dtype=np.float32)
for v in range(N):
    top = sorted(per[v], reverse=True)[:4]
    s = sum(w for w, _ in top) or 1
    for k, (w, bi) in enumerate(top): SI[v, k] = bi; SW[v, k] = w / s

# ─── Eye proxy (fitted to the moving eye helpers at run time) ──────
def proxy(path):
    lines = open(path).read().split('\n')
    scale = {}; refs = []; in_v = False; obj = None
    for l in lines:
        p = l.split()
        if not p: continue
        if p[0] in ('x_scale', 'y_scale', 'z_scale'): scale[p[0][0]] = [int(p[1]), int(p[2]), float(p[3])]
        elif p[0] == 'obj_file': obj = p[1]
        elif p[0] == 'verts': in_v = True; continue
        elif in_v and len(p) == 9:
            refs.append([int(p[0]), int(p[1]), int(p[2]), float(p[3]), float(p[4]), float(p[5]), float(p[6]), float(p[7]), float(p[8])])
        elif in_v and p[0] in ('weights', 'delete_verts', 'material', 'z_depth'): in_v = False
    pv, puv, pf = [], [], []
    for l in open(os.path.join(os.path.dirname(path), obj)):
        if l.startswith('v '): pv.append(l)
        elif l.startswith('vt '): puv.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('f '): pf.append([tuple(int(q) - 1 for q in t.split('/')[:2]) for t in l.split()[1:]])
    assert len(refs) == len(pv), (len(refs), len(pv))
    # split by uv
    k2, rm, ru, ix = {}, [], [], []
    for cs in pf:
        rs = []
        for v, t in cs:
            if (v, t) not in k2: k2[(v, t)] = len(rm); rm.append(v); ru.append(puv[t])
            rs.append(k2[(v, t)])
        for i in range(1, len(rs) - 1): ix += [rs[0], rs[i], rs[i + 1]]
    return scale, np.array(refs), np.array(rm), np.array(ru), ix
esc, erefs, ermap, eruv, eidx = proxy(D + '/eyes/high-poly/high-poly.mhclo')

# ─── Write ────────────────────────────────────────────────────────
buf = bytearray(); meta = {}
def put(key, arr, dtype):
    global buf
    a = np.ascontiguousarray(arr, dtype=dtype)
    while len(buf) % 4: buf += b'\0'
    meta[key] = {'off': len(buf), 'len': int(a.size), 'type': np.dtype(dtype).name}
    buf += a.tobytes()
put('base', base, np.float32)
put('vt', VT, np.float32)
for k, v in gquads.items(): put('q_' + k, v, np.uint32)
put('skinIndex', SI, np.uint8); put('skinWeight', SW, np.float32)
mlist = []
for name, lo, hi in morphs:
    entry = {'name': name}
    for end, d in (('lo', lo), ('hi', hi)):
        nz = np.nonzero(np.abs(d).sum(1) > 1e-6)[0]
        if not len(nz): continue
        m = float(np.abs(d[nz]).max()) or 1e-6
        put(f'm_{name}_{end}_i', nz, np.uint32)
        put(f'm_{name}_{end}_d', np.round(d[nz] / m * 32767), np.int16)
        entry[end] = {'i': f'm_{name}_{end}_i', 'd': f'm_{name}_{end}_d', 'scale': m / 32767}
    mlist.append(entry)
put('eye_refs_i', erefs[:, :3], np.uint32); put('eye_refs_w', erefs[:, 3:6], np.float32); put('eye_refs_o', erefs[:, 6:9], np.float32)
put('eye_rmap', ermap, np.uint32); put('eye_uv', eruv, np.float32); put('eye_idx', eidx, np.uint32)
json.dump({'n': N, 'nt': len(VT), 'arrays': meta, 'morphs': mlist, 'bones': bones, 'eyeScale': esc,
           'groups': list(gquads.keys()), 'license': 'Body, morphs, skeleton and eyes: MakeHuman (makehumancommunity.org), CC0 1.0.'},
          open(OUT + '/body3d.json', 'w'))
open(OUT + '/body3d.bin', 'wb').write(bytes(buf))
print('verts', N, 'uvs', len(VT), 'morphs', len(mlist), 'bin MB', round(len(buf) / 1e6, 2))
print('bbox', base.min(0).round(2), base.max(0).round(2))

# Masks for lips / eyelids / nails in UV space -> one RGB image
M = '/tmp/claude-0/mh/mpfb2/src/mpfb/data/textures/'
g = lambda n: Image.open(M + n + '.jpg').convert('L').resize((1024, 1024), Image.LANCZOS)
nails = Image.fromarray(np.maximum(np.array(g('mpfb_fingernails')), np.array(g('mpfb_toenails'))))
Image.merge('RGB', (g('mpfb_lips'), g('mpfb_eyelids'), nails)).save(OUT + '/skin-masks.png', optimize=True)
eye = Image.open(D + '/eyes/materials/brown_eye.png'); eye.convert('RGB').resize((512, 512)).save(OUT + '/eye.jpg', quality=88)
