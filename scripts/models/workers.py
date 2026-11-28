"""The workers (sheets 02 and 03).

Laborer: a stout, cheerful bearded man in a straw hat, team dungarees with brass-buckled
straps over a rolled-up cream shirt, a wide tool belt with pouches and a short leather
apron, heavy boots, a pack frame for the gold sack and logs.
Tender: a young Thornwild woman in a green leaf hood and cloak, auburn braids, a leafy
tunic over a cream apron, a seed basket at her hip, and living tools of vine-bound wood.

Both hold one tool on its own pivot in the right hand; the game shows the head for the
job (nodes 'pick', 'axe', 'hammer'), and the sack ('sack') and logs ('log0'-'log2')
when carrying."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import cloth_legs, face, hand_at, arm_x, leaf, leaf_ring, GOLD, LEATHER, LEATHER_D
import sylvan as SY
import wild as WD

CREAM = '#efe2c2'
BRASS = '#d1a24a'
SKIN = '#eab58a'


def tool(F, haft='#9a6838', living=False):
    """The tool pivot (haft along +Z from the hand) and a head for each job at its end."""
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    t = pivot('tool', hd, (hx, hy, hz))
    t.rotation_euler = (1.95, 0, 0)  # held ready, head forward at knee height
    F.p['tool'] = t
    tube('haft', 0.017, 0.019, 0.5, mat('matte', haft), t, at=(hx, hy, hz - 0.08), segs=8)
    if living:
        pts = [(hx + 0.02 * math.cos(i * 1.6), hy + 0.02 * math.sin(i * 1.6), hz - 0.05 + i * 0.035) for i in range(12)]
        curve_tube('haftVine', pts, 0.006, mat('matte', '#5a7a26'), t)
        for i in range(3):
            leaf(f'haftLeaf{i}', t, (hx, hy, hz + 0.1 + i * 0.12), 0.03, 0.06, WD.LEAVES[i], rot=(0.4, 0, i * 2.1))
    top = (hx, hy, hz + 0.4)
    stone = '#8a8e94' if living else '#9aa3ae'
    pk = pivot('pick', t, top)
    lathe('pickHead', [(0.0, -0.17), (0.022, -0.12), (0.034, 0.0), (0.022, 0.12), (0.0, 0.17)], mat('metal', stone), pk, at=top, rot=(math.pi / 2, 0, 0), segs=6, sub=1)
    ax = pivot('axe', t, top)
    extrude('axeHead', [(0.0, -0.03), (0.12, -0.075), (0.14, 0.0), (0.12, 0.075), (0.0, 0.03)], 0.022, mat('metal', '#b8c0ca' if not living else stone), ax, at=(top[0], top[1] + 0.01, top[2]), rot=(0, -math.pi / 2, math.pi / 2), bevel=0.006)
    hm = pivot('hammer', t, top)
    if living:
        lump('malletHead', 0.07, mat('matte', '#a0703f'), hm, at=top, scale=(1.5, 0.9, 0.9), seed=4, rough=0.06)
        torus('malletBand', 0.065, 0.008, mat('matte', '#5a7a26'), hm, at=top, rot=(0, math.pi / 2, 0), segs=12, rsegs=3)
    else:
        box('hammerHead', (0.17, 0.08, 0.08), mat('metal', '#767c86'), hm, at=top, bevel=0.015, sub=1)


def carry(F, logs_color=('#8a5a32', '#a26e3c')):
    """A pack frame with a gold sack ('sack') and three logs ('log0'-'log2')."""
    ch = F['chest']
    box('packFrame', (0.2, 0.03, 0.3), mat('matte', LEATHER_D), ch, at=(0, 0.14, 0.62), bevel=0.01)
    sk = pivot('sack', ch, (0, 0.18, 0.62))
    lump('sackBody', 0.11, mat('matte', '#b08a52'), sk, at=(0, 0.2, 0.62), scale=(1.1, 0.9, 1.1), seed=5, rough=0.06)
    torus('sackTie', 0.04, 0.011, mat('matte', LEATHER_D), sk, at=(0, 0.2, 0.74), segs=10, rsegs=3)
    for i in range(5):
        lump(f'nugget{i}', 0.03, mat('gold', '#ffd34a'), sk, at=(-0.05 + i * 0.025, 0.18 + (i % 2) * 0.03, 0.76 + (i % 2) * 0.01), seed=60 + i, rough=0.2, sub=0)
    for i in range(3):
        lg = pivot(f'log{i}', ch, (0, 0.2, 0.56 + i * 0.08))
        tube(f'logBody{i}', 0.045, 0.045, 0.38, mat('matte', logs_color[i % 2]), lg, at=(-0.19, 0.2, 0.56 + i * 0.075), rot=(0, math.pi / 2, 0), segs=10)
        for sx in (-1, 1):
            lathe(f'logEnd{i}{sx}', [(0.0, 0.0), (0.04, 0.0), (0.0, 0.004)], mat('matte', '#e0c08a'), lg, at=(sx * 0.19, 0.2, 0.56 + i * 0.075), rot=(0, sx * math.pi / 2, 0), segs=10)


def laborer():
    F = Figure(bulk=1.3)
    b = F.bulk
    team = mat('team')
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    # Dungarees (team) tucked into heavy cuffed boots.
    cloth_legs(F, pants='team', boots=LEATHER_D)
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * b * sx
        sh = F[f'shin.{s}']
        lathe(f'boot.{s}', [(0.0, 0.0), (0.062 * b, 0.0), (0.06 * b, 0.07), (0.064 * b, 0.11), (0.0, 0.11)], mat('matte', LEATHER_D), sh, at=(x, -0.004, ANKLE - 0.02), segs=14, sub=1)
        lathe(f'bootCuff.{s}', [(0.064 * b, 0.0), (0.075 * b, 0.02), (0.07 * b, 0.04)], mat('matte', LEATHER), sh, at=(x, -0.004, ANKLE + 0.08), segs=14, sub=1)
        box(f'toeCap.{s}', (0.085 * b, 0.1, 0.06), mat('matte', LEATHER_D), F[f'foot.{s}'], at=(x, -0.07, 0.03), bevel=0.025, sub=1)
    # A round cream shirt and belly, the dungaree bib and straps with brass buckles.
    lathe('shirt', [(0.0, 0.0), (0.13 * b, 0.0), (0.155 * b, 0.07), (0.16 * b, 0.14), (0.145 * b, 0.2), (0.08, 0.245), (0.0, 0.25)], mat('matte', CREAM), ch, at=(0, 0, 0.5), scale=(1, 0.86, 1), segs=18, sub=1)
    sphere('belly', 0.15 * b, team, spine, at=(0, -0.025, 0.52), scale=(1.0, 0.92, 0.85), sub=1)
    lathe('dungareeHips', [(0.14 * b, 0.0), (0.15 * b, 0.06), (0.14 * b, 0.12)], team, hips, at=(0, 0, HIP - 0.06), scale=(1, 0.88, 1), segs=18, sub=1)
    box('bib', (0.2 * b, 0.04, 0.17), team, ch, at=(0, -0.13 * b, 0.62), rot=(-0.12, 0, 0), bevel=0.02, sub=1)
    box('bibPocket', (0.08, 0.012, 0.06), mat('matte', '#2a4a8a'), ch, at=(0, -0.155 * b, 0.63), rot=(-0.12, 0, 0), bevel=0.005)
    for sx in (-1, 1):
        curve_tube(f'strap{sx}', [(sx * 0.075, -0.15 * b, 0.68), (sx * 0.1, -0.08, 0.76), (sx * 0.1, 0.06, 0.76), (sx * 0.08, 0.14 * b, 0.62)], 0.012, team, ch)
        box(f'buckle{sx}', (0.035, 0.014, 0.03), mat('gold', BRASS), ch, at=(sx * 0.075, -0.158 * b, 0.68), rot=(-0.12, 0, 0), bevel=0.004)
    # A wide tool belt with a big buckle, pouches, and a short leather apron.
    torus('belt', 0.15 * b, 0.024, mat('matte', LEATHER_D), spine, at=(0, 0, 0.47), scale=(1, 0.88, 1.2), segs=22, rsegs=6)
    box('beltBuckle', (0.07, 0.02, 0.055), mat('gold', BRASS), spine, at=(0, -0.135 * b, 0.47), bevel=0.008)
    box('beltBuckleHole', (0.04, 0.022, 0.028), mat('matte', LEATHER_D), spine, at=(0, -0.14 * b, 0.47), bevel=0.004)
    for sx, y in ((-1, -0.08), (1, -0.08), (1, 0.05)):
        box(f'pouch{sx}{y}', (0.07, 0.045, 0.075), mat('matte', LEATHER), spine, at=(sx * 0.13 * b, y, 0.43), rot=(0, 0, sx * 0.45), bevel=0.014, sub=1)
        box(f'pouchFlap{sx}{y}', (0.072, 0.047, 0.03), mat('matte', LEATHER_D), spine, at=(sx * 0.13 * b, y, 0.455), rot=(0, 0, sx * 0.45), bevel=0.01, sub=1)
    sheet('apron', 0.18 * b, 0.2, mat('matte', LEATHER), hips, at=(0, -0.15 * b, HIP + 0.0), bend=0.03, flare=0.2, cols=5, rows=5, thick=0.01)
    # Sleeves rolled to the elbow, strong forearms, leather gloves.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        sphere(f'shoulder.{s}', 0.065 * b, mat('matte', CREAM), ua, at=(x, 0, SHOULDER - 0.005), sub=1)
        tube(f'sleeve.{s}', 0.058 * b, 0.054 * b, ELBOW_DROP, mat('matte', CREAM), ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=12, sub=1)
        torus(f'roll.{s}', 0.055 * b, 0.014, mat('matte', CREAM), ua, at=(x, 0, SHOULDER - ELBOW_DROP + 0.01), segs=12, rsegs=4)
        tube(f'forearm.{s}', 0.05 * b, 0.044 * b, WRIST_DROP - ELBOW_DROP, mat('matte', SKIN), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=12, sub=1)
        hx, hy, hz = hand_at(F, s)
        lathe(f'glove.{s}', [(0.04 * b, 0.0), (0.05 * b, 0.03), (0.045 * b, 0.06)], mat('matte', LEATHER), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=12, sub=1)
        sphere(f'fist.{s}', 0.045 * b, mat('matte', LEATHER), hd, at=(hx, hy, hz), scale=(0.9, 1.05, 1.1), sub=1)
    # A broad, cheerful face: full beard, a big grin, rosy cheeks, a straw hat.
    face(F, hair='#6a4022', beard='#6a4022', brows='#5a3418', size=1.1)
    box('grin', (0.06, 0.012, 0.016), mat('matte', '#f4efe6'), h, at=(0, -0.093, HEAD - 0.045), bevel=0.006)
    for sx in (-1, 1):
        sphere(f'cheek{sx}', 0.018, mat('matte', '#e89a7a'), h, at=(sx * 0.05, -0.08, HEAD - 0.015))
    hp = pivot('hat', h, (0, 0, HEAD + 0.06))
    lathe('hatBrim', [(0.0, 0.012), (0.12, 0.012), (0.2, 0.0), (0.225, -0.012), (0.228, -0.002), (0.2, 0.012), (0.12, 0.02), (0.0, 0.02)], mat('matte', '#e0b85a'), hp, at=(0, 0, HEAD + 0.065), segs=24, sub=1)
    lathe('hatCrown', [(0.104, 0.0), (0.1, 0.05), (0.08, 0.09), (0.0, 0.095)], mat('matte', '#e7c468'), hp, at=(0, 0, HEAD + 0.07), segs=18, sub=1)
    torus('hatBand', 0.103, 0.011, mat('matte', '#8a4a2a'), hp, at=(0, 0, HEAD + 0.085), segs=18, rsegs=4)
    hp.rotation_euler = (-0.1, 0.1, 0)
    F.p['hat'] = hp
    tool(F)
    carry(F)
    F.animate(attack='slash', work=True)
    return F


def tender():
    F = Figure(bulk=1.0)
    b = F.bulk
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    green, green_d = mat('matte', '#6f8f2e'), mat('matte', '#4f6b22')
    cloth_legs(F, pants='#5a4a30', boots=LEATHER_D, wraps='#6f8f2e')
    for s, sx in (('R', -1), ('L', 1)):
        lathe(f'boot.{s}', [(0.0, 0.0), (0.05, 0.0), (0.05, 0.1), (0.056, 0.13), (0.0, 0.13)], mat('matte', LEATHER_D), F[f'shin.{s}'], at=(0.075 * b * sx, -0.004, ANKLE - 0.02), segs=12, sub=1)
    # Leafy green tunic over a cream apron, a belt with an amber stone, a seed basket.
    lathe('tunic', [(0.0, 0.0), (0.11 * b, 0.0), (0.125 * b, 0.07), (0.135 * b, 0.15), (0.125 * b, 0.21), (0.07, 0.245), (0.0, 0.25)], green, ch, at=(0, 0, 0.5), scale=(1, 0.82, 1), segs=16, sub=1)
    lathe('skirt', [(0.17 * b, 0.0), (0.14 * b, 0.12), (0.12 * b, 0.2)], green_d, hips, at=(0, 0, 0.26), scale=(1, 0.88, 1), segs=18, sub=1)
    extrude('apron', [(-0.06, 0.0), (0.06, 0.0), (0.07, -0.2), (0.0, -0.25), (-0.07, -0.2)], 0.01, mat('matte', '#e8dcc0'), hips, at=(0, -0.15 * b, 0.47), bevel=0.003)
    extrude('apronRune', [(-0.02, 0.0), (0.0, -0.04), (0.02, 0.0), (0.0, 0.04)], 0.004, mat('gold', GOLD), hips, at=(0, -0.158 * b, 0.36), bevel=0.001)
    leaf_ring('leafSkirt', hips, (0, 0, HIP + 0.03), 0.13 * b, 12, 0.07, 0.15, WD.LEAVES, tilt=2.6)
    torus('belt', 0.12 * b, 0.016, mat('matte', LEATHER_D), spine, at=(0, 0, 0.5), scale=(1, 0.86, 1), segs=18, rsegs=5)
    sphere('beltAmber', 0.017, mat('glow', '#ffb43a'), spine, at=(0, -0.106 * b, 0.5), sub=1)
    box('sash', (0.05, 0.012, 0.3), mat('team'), ch, at=(0.02, -0.12 * b, 0.62), rot=(0, 0.55, 0))
    basket = (0.14 * b, -0.04, 0.42)
    lathe('basket', [(0.0, 0.0), (0.06, 0.0), (0.075, 0.07), (0.07, 0.08), (0.0, 0.02)], mat('matte', '#b08a52'), spine, at=basket, segs=14, sub=1)
    for i in range(3):
        lump(f'seed{i}', 0.025, mat('matte', '#8a5a2c'), spine, at=(basket[0] - 0.02 + i * 0.02, basket[1], basket[2] + 0.075), seed=30 + i, rough=0.1)
    # Arms: green sleeves, leather bracers, bare hands.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        tube(f'sleeve.{s}', 0.046 * b, 0.04 * b, ELBOW_DROP, green, ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=10, sub=1)
        tube(f'fore.{s}', 0.04 * b, 0.034 * b, WRIST_DROP - ELBOW_DROP, mat('matte', SKIN), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=10, sub=1)
        lathe(f'bracer.{s}', [(0.042, 0.0), (0.046, 0.05), (0.04, 0.09)], mat('matte', LEATHER), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.01), segs=12, sub=1)
        hx, hy, hz = hand_at(F, s)
        sphere(f'hand.{s}', 0.036, mat('matte', SKIN), hd, at=(hx, hy, hz), scale=(0.9, 1.0, 1.15), sub=1)
    # Head: auburn braids under a leafy green hood; a leaf cloak.
    face(F, hair='#b5562a', brows='#8a3a1a', size=1.02)
    for sx in (-1, 1):
        curve_tube(f'braid{sx}', [(sx * 0.07, -0.02, HEAD - 0.02), (sx * 0.09, -0.04, HEAD - 0.1), (sx * 0.09, -0.06, HEAD - 0.2)], 0.02, mat('matte', '#b5562a'), h, taper=[1.0, 0.9, 0.6])
    WD.leaf_hood(F, color='#6f8f2e', tall=0.04)
    WD.leaf_mantle(F, 0.9)
    SY.leaf_cloak(F, length=0.34, flare=0.1, rows=3, seed=31)
    tool(F, haft='#8a5a2c', living=True)
    carry(F, logs_color=('#7a5a32', '#8a6a3c'))
    F.animate(attack='slash', work=True)
    return F
