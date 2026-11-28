"""The six heroes (sheet 01), built on the unit bodies and larger, with their own gear.

Crown: the Marshal (crowned, bearded knight, crowned cape, kite shield, a great square
warhammer), the Pathfinder (a bearded ranger in a green hooded cloak with a team sash,
a recurve bow drawn for real) and the Sage (a white-bearded wizard in long purple
robes with gold trim and a wide pointed hat, a staff crowned with a fire crystal).
Thornwild: the Thorn Warden (a towering carved-wood guardian with great antlers, a
wooden kite shield with the spiral glyph and a spiked mace), the Huntress (an
auburn-braided ranger in a hooded leaf cloak with a bow) and the Grove Speaker (an old
druid with a long white beard and a leaf crown, cream robes under leaves, and a branch
staff cradling a glowing green orb)."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import cloth_legs, face, hand_at, arm_x, leaf, leaf_ring, crown_outline, GOLD, LEATHER, LEATHER_D
import knight as KN
import archer as AR
import bowman as BW
import sylvan as SY
import woodguard as WG
import wild as WD

TRIM = '#e8b84c'


def crown_on_head(F, w=0.13):
    """A gold crown band with points and gems."""
    h = F['head']
    torus('crownBand', w * 0.62, 0.014, mat('gold', TRIM), h, at=(0, 0.0, HEAD + 0.075), scale=(1, 1.05, 1), segs=20, rsegs=4)
    for i in range(7):
        a = 2 * math.pi * i / 7 - math.pi / 2
        lathe(f'crownPoint{i}', [(0.016, 0.0), (0.0, 0.05)], mat('gold', TRIM), h, at=(math.cos(a) * w * 0.62, math.sin(a) * w * 0.65, HEAD + 0.08), segs=5)
    sphere('crownGem', 0.014, mat('glow', '#6aa8ff'), h, at=(0, -w * 0.66, HEAD + 0.085))


def great_hammer(F):
    hd, trim, steel = F['hand.R'], mat('gold', TRIM), mat('metal', KN.STEEL)
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (math.pi - 0.35, 0, 0)  # carried hanging at the side, head low
    F.p['weapon'] = w
    tube('haft', 0.02, 0.02, 0.6, mat('matte', LEATHER_D), w, at=(hx, hy, hz - 0.12), segs=8)
    for i, z in enumerate((-0.1, 0.12, 0.3)):
        tube(f'haftBand{i}', 0.023, 0.023, 0.03, trim, w, at=(hx, hy, hz + z), segs=8, caps=False)
    top = hz + 0.5
    box('hammerHead', (0.3, 0.15, 0.15), steel, w, at=(hx, hy, top), bevel=0.02, sub=1)
    for sx in (-1, 1):
        box(f'hammerFace{sx}', (0.03, 0.17, 0.17), trim, w, at=(hx + sx * 0.16, hy, top), bevel=0.01)
        box(f'hammerBand{sx}', (0.025, 0.155, 0.155), trim, w, at=(hx + sx * 0.07, hy, top), bevel=0.005)
        extrude(f'hammerCrown{sx}', crown_outline(0.07, 0.05), 0.01, trim, w, at=(hx, hy + sx * 0.077, top - 0.025), rot=(0, 0, 0 if sx < 0 else math.pi), bevel=0.002)


def marshal():
    F = Figure(bulk=1.32)
    KN.legs(F)
    KN.torso(F)
    KN.arms(F)
    KN.bearwarden_head(F)
    crown_on_head(F)
    # A long team cape with a big gold crown on the back.
    KN.CR_cape(F, w=0.42, h=0.66)
    extrude('capeCrown', crown_outline(0.16, 0.11), 0.01, mat('gold', TRIM), F['chest'], at=(0, 0.27, 0.38), rot=(0, 0, math.pi), bevel=0.003)
    torus('capeCollar', 0.11 * F.bulk, 0.02, mat('team'), F['chest'], at=(0, 0.0, NECK - 0.01), scale=(1, 0.9, 1), segs=20, rsegs=6)
    KN.kite_shield(F)
    great_hammer(F)
    F.animate(attack='slash', cast=True)
    return F


def pathfinder():
    F = Figure(bulk=1.12)
    AR.hooded_body(F, tunic='#6f5a3a', breeches='#4e4a34', vest='#5a3a22', cape_len=0.7, hair='#4a2e1a', beard='#4a2e1a', crown_hem=False, hood='#5c7a34', ragged=0.05)
    # A team sash and tabard panel at the belt.
    box('sash', (0.07, 0.014, 0.38), mat('team'), F['chest'], at=(0.02, -0.135 * F.bulk, 0.62), rot=(0, 0.55, 0))
    box('tabard', (0.1, 0.014, 0.22), mat('team'), F['hips'], at=(0, -0.125 * F.bulk, 0.4), bevel=0.004)
    AR.quiver(F, arrows=8)
    BW.make_bow(F, length=0.8, wood='#9a6a36', tips=TRIM)
    BW.bow_clips(F, BW.legs_walk(F))
    F.animate(attack=None, cast=True, base=False)
    return F


def sage():
    F = Figure(bulk=1.15)
    b = F.bulk
    purple, purple_d, gold = mat('matte', '#6a3f8e'), mat('matte', '#4a2a68'), mat('gold', TRIM)
    hips, ch, h = F['hips'], F['chest'], F['head']
    cloth_legs(F, pants='#3a2a4a', boots=LEATHER_D)
    # Long robes to the ankles, opening at the front over an inner robe, gold-hemmed.
    lathe('robeTop', [(0.0, 0.0), (0.12 * b, 0.0), (0.135 * b, 0.08), (0.15 * b, 0.16), (0.14 * b, 0.21), (0.08, 0.245), (0.0, 0.25)], purple, ch, at=(0, 0, 0.5), scale=(1, 0.84, 1), segs=20, sub=1)
    lathe('robeInner', [(0.25 * b, 0.0), (0.2 * b, 0.2), (0.15 * b, 0.42)], purple_d, hips, at=(0, 0.0, 0.06), scale=(1, 0.88, 1), segs=24, sub=1)
    gap = 0.35 * math.pi
    lathe('robeOuter', [(0.28 * b, 0.0), (0.23 * b, 0.2), (0.16 * b, 0.44)], purple, hips, at=(0, 0.005, 0.05), scale=(1, 0.88, 1), segs=26, sub=1, angle=2 * math.pi - gap, rot=(0, 0, -math.pi / 2 + gap / 2))
    lathe('robeHem', [(0.282 * b, 0.0), (0.28 * b, 0.03)], gold, hips, at=(0, 0.005, 0.048), scale=(1, 0.88, 1), segs=26, angle=2 * math.pi - gap, rot=(0, 0, -math.pi / 2 + gap / 2))
    for sgn in (-1, 1):
        a = -math.pi / 2 + sgn * gap / 2
        curve_tube(f'robeEdge{sgn}', [(math.cos(a) * 0.16 * b, math.sin(a) * 0.16 * b * 0.88, 0.49), (math.cos(a) * 0.23 * b, math.sin(a) * 0.23 * b * 0.88, 0.25), (math.cos(a) * 0.28 * b, math.sin(a) * 0.28 * b * 0.88, 0.05)], 0.012, gold, hips)
    extrude('robeRune', [(-0.04, 0.0), (0.0, -0.06), (0.04, 0.0), (0.0, 0.06)], 0.008, gold, hips, at=(0, -0.23 * b * 0.88, 0.2), bevel=0.002)
    # Belt with pouches and a blue gem; a team sash.
    torus('belt', 0.135 * b, 0.02, mat('matte', LEATHER_D), F['spine'], at=(0, 0, 0.5), scale=(1, 0.86, 1), segs=20, rsegs=5)
    box('beltPlate', (0.06, 0.016, 0.05), gold, F['spine'], at=(0, -0.12 * b, 0.5), bevel=0.008)
    sphere('beltGem', 0.016, mat('glow', '#6aa8ff'), F['spine'], at=(0, -0.13 * b, 0.5), sub=1)
    box('pouch', (0.07, 0.045, 0.07), mat('matte', LEATHER), F['spine'], at=(-0.11 * b, -0.07, 0.45), rot=(0, 0, 0.4), bevel=0.012, sub=1)
    box('sash', (0.06, 0.014, 0.34), mat('team'), ch, at=(0.02, -0.13 * b, 0.62), rot=(0, 0.55, 0))
    lathe('mantle', [(0.07, 0.03), (0.13 * b, 0.0), (0.175 * b, -0.05), (0.18 * b, -0.07)], purple_d, ch, at=(0, 0, NECK), scale=(1, 0.88, 1), segs=20, sub=1)
    torus('mantleTrim', 0.178 * b, 0.009, gold, ch, at=(0, 0, NECK - 0.068), scale=(1, 0.88, 1), segs=22, rsegs=4)
    # Wide bell sleeves with gold cuffs, bare hands.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        sphere(f'shoulder.{s}', 0.06 * b, purple, ua, at=(x, 0, SHOULDER - 0.005), sub=1)
        tube(f'sleeve.{s}', 0.055 * b, 0.05 * b, ELBOW_DROP, purple, ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=12, sub=1)
        lathe(f'bell.{s}', [(0.05 * b, 0.12), (0.07 * b, 0.05), (0.09 * b, 0.0)], purple, fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.02), segs=14, sub=1)
        torus(f'cuff.{s}', 0.09 * b, 0.009, gold, fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.02), segs=16, rsegs=4)
        hx, hy, hz = hand_at(F, s)
        sphere(f'hand.{s}', 0.038, mat('matte', '#eab58a'), hd, at=(hx, hy, hz), scale=(0.9, 1.0, 1.15), sub=1)
    # Head: an old face, a long white beard and moustache, bushy brows, and the hat.
    face(F, hair='#e8e4dc', brows='#e8e4dc', size=1.05)
    lathe('beard', [(0.0, 0.0), (0.04, 0.03), (0.075, 0.12), (0.09, 0.22), (0.08, 0.3), (0.0, 0.33)], mat('matte', '#efece6'), h, at=(0, -0.07, HEAD - 0.36), scale=(1.15, 0.7, 1), segs=14, sub=1)
    for sx in (-1, 1):
        curve_tube(f'moustache{sx}', [(0, -0.094, HEAD - 0.035), (sx * 0.04, -0.09, HEAD - 0.05), (sx * 0.06, -0.075, HEAD - 0.1)], 0.012, mat('matte', '#efece6'), h, taper=[1.0, 0.9, 0.5])
    hp = pivot('hat', h, (0, 0, HEAD + 0.07))
    lathe('hatBrim', [(0.0, 0.01), (0.14, 0.01), (0.25, -0.015), (0.3, -0.04), (0.305, -0.028), (0.25, 0.012), (0.14, 0.02), (0.0, 0.02)], purple, hp, at=(0, 0, HEAD + 0.07), segs=26, sub=1)
    lathe('hatCone', [(0.11, 0.0), (0.085, 0.12), (0.055, 0.23), (0.022, 0.32), (0.0, 0.34)], purple, hp, at=(0, 0, HEAD + 0.08), segs=20, sub=1)
    curve_tube('hatTip', [(0, 0.0, HEAD + 0.39), (0, 0.05, HEAD + 0.45), (0, 0.13, HEAD + 0.44)], 0.022, purple, hp, taper=[1.0, 0.7, 0.3])
    torus('hatBand', 0.1, 0.014, mat('team'), hp, at=(0, 0, HEAD + 0.095), segs=20, rsegs=4)
    sphere('hatGem', 0.016, mat('glow', '#ffb02a'), hp, at=(0, -0.1, HEAD + 0.1))
    hp.rotation_euler = (-0.12, 0.08, 0)
    F.p['hat'] = hp
    # The staff: gnarled wood, gold claws holding a glowing fire crystal.
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (0.35, 0, 0)
    F.p['weapon'] = w
    curve_tube('staff', [(hx, hy, hz - 0.42), (hx + 0.01, hy, hz), (hx - 0.01, hy, hz + 0.4), (hx, hy, hz + 0.62)], 0.017, mat('matte', '#6e4626'), w, taper=[0.8, 1.0, 1.0, 1.2])
    top = (hx, hy, hz + 0.72)
    for i in range(4):
        a = 2 * math.pi * i / 4
        curve_tube(f'claw{i}', [(hx, hy, hz + 0.62), (hx + math.cos(a) * 0.04, hy + math.sin(a) * 0.04, hz + 0.68), (hx + math.cos(a) * 0.025, hy + math.sin(a) * 0.025, hz + 0.76)], 0.007, mat('gold', TRIM), w, taper=[1.0, 0.8, 0.3])
    lathe('crystal', [(0.0, 0.0), (0.035, 0.05), (0.03, 0.1), (0.0, 0.16)], mat('glow', '#ff8a2a'), w, at=(top[0], top[1], top[2] - 0.05), segs=6)
    # Attack: level the staff and point the crystal at the enemy (the bolt flies from it).
    F.animate(attack=None, cast=True)
    SY.spear_thrust(F)
    return F


def warden():
    F = Figure(bulk=1.55)
    WG.body(F)
    WG.mace(F, size=1.6)
    h = F['head']
    # Great branching antlers.
    for sx in (-1, 1):
        base = (sx * 0.09, 0.0, HEAD + 0.1)
        curve_tube(f'antler{sx}', [base, (sx * 0.17, 0.0, HEAD + 0.2), (sx * 0.24, 0.02, HEAD + 0.32), (sx * 0.27, 0.04, HEAD + 0.42)], 0.02, mat('matte', WG.WOOD_D), h, taper=[1.0, 0.85, 0.6, 0.25])
        for (p0, p1) in (((sx * 0.17, 0.0, HEAD + 0.2), (sx * 0.15, -0.06, HEAD + 0.31)), ((sx * 0.24, 0.02, HEAD + 0.32), (sx * 0.33, -0.02, HEAD + 0.4)), ((sx * 0.21, 0.01, HEAD + 0.26), (sx * 0.2, 0.06, HEAD + 0.36))):
            curve_tube(f'tine{sx}{p1[2]:.2f}', [p0, p1], 0.012, mat('matte', WG.WOOD_D), h, taper=[1.0, 0.25])
    WD.leaf_mantle(F, 1.3)
    # A wooden kite shield with the spiral glyph.
    fa = F['forearm.L']
    sx = arm_x(F, 'L') * 1.05 + 0.06
    sz = SHOULDER - WRIST_DROP + 0.03
    yaw = -0.55
    c, sn = math.cos(yaw), math.sin(yaw)
    def on(dy, dx=0.0, dz=0.0):
        return (sx + dx * c - dy * sn, -0.09 + dx * sn + dy * c, sz + dz)
    import crown as CRN
    extrude('shieldRim', CRN.kite_outline(0.4, 0.58), 0.05, mat('matte', WG.WOOD_D), fa, at=on(0.0), rot=(0, 0, yaw), bevel=0.012)
    extrude('shieldFace', CRN.kite_outline(0.34, 0.5), 0.056, mat('matte', WG.WOOD_L), fa, at=on(-0.005, 0, 0.004), rot=(0, 0, yaw), bevel=0.008)
    pts = []
    for i in range(18):
        t = i / 17
        a = t * 2.6 * math.pi
        rr = 0.11 * (1 - 0.85 * t)
        pts.append(on(-0.036, math.cos(a) * rr, 0.06 + math.sin(a) * rr * 1.1))
    curve_tube('glyph', pts, 0.012, mat('glow', WG.GLYPH), fa)
    sphere('shieldStone', 0.03, mat('team'), fa, at=on(-0.04, 0, -0.14), sub=1)
    F.animate(attack='slash', cast=True)
    return F


def huntress():
    F = Figure(bulk=1.02)
    b = F.bulk
    AR.hooded_body(F, tunic='#6a7a3a', breeches='#4a3a26', vest='#5a3a22', cape_len=0.6, hair='#b5562a', crown_hem=False, hood='#6f8f2e', skin='#eab58a')
    # The cloak frays into leaves; an auburn braid over the shoulder; a team sash.
    SY.leaf_cloak(F, length=0.55, flare=0.12, rows=4, seed=11)
    curve_tube('braid', [(0.07, -0.02, HEAD - 0.02), (0.1, -0.05, HEAD - 0.1), (0.11, -0.08, HEAD - 0.2), (0.1, -0.09, HEAD - 0.28)], 0.022, mat('matte', '#b5562a'), F['head'], taper=[1.0, 0.95, 0.85, 0.6])
    box('sash', (0.06, 0.014, 0.34), mat('team'), F['chest'], at=(0.02, -0.132 * b, 0.62), rot=(0, 0.55, 0))
    AR.quiver(F, arrows=7)
    BW.make_bow(F, length=0.76, wood='#8a5a2c', tips=TRIM)
    BW.bow_clips(F, BW.legs_walk(F))
    F.animate(attack=None, cast=True, base=False)
    return F


def speaker():
    F = Figure(bulk=1.12)
    b = F.bulk
    cream, green, gold = mat('matte', '#e8dcc0'), mat('matte', '#5f7f2c'), mat('gold', TRIM)
    hips, ch, h = F['hips'], F['chest'], F['head']
    cloth_legs(F, pants='#5a4a30', boots=LEATHER_D)
    # Long cream robes, a green over-robe with a gold leaf rune, a rope belt with a gourd.
    lathe('robeTop', [(0.0, 0.0), (0.12 * b, 0.0), (0.135 * b, 0.08), (0.15 * b, 0.16), (0.14 * b, 0.21), (0.08, 0.245), (0.0, 0.25)], cream, ch, at=(0, 0, 0.5), scale=(1, 0.84, 1), segs=20, sub=1)
    lathe('robe', [(0.27 * b, 0.0), (0.22 * b, 0.2), (0.15 * b, 0.44)], cream, hips, at=(0, 0.0, 0.05), scale=(1, 0.88, 1), segs=26, sub=1)
    extrude('overRobe', [(-0.09, 0.0), (0.09, 0.0), (0.12, -0.36), (0.0, -0.44), (-0.12, -0.36)], 0.012, green, hips, at=(0, -0.2 * b, 0.48), rot=(0.12, 0, 0), bevel=0.004)
    extrude('robeRune', [(-0.035, 0.0), (0.0, -0.07), (0.035, 0.0), (0.0, 0.07)], 0.006, gold, hips, at=(0, -0.215 * b, 0.25), rot=(0.12, 0, 0), bevel=0.002)
    torus('ropeBelt', 0.13 * b, 0.016, mat('matte', '#a07a46'), F['spine'], at=(0, 0, 0.5), scale=(1, 0.86, 1), segs=20, rsegs=5)
    sphere('beltAmber', 0.022, mat('glow', '#ffb43a'), F['spine'], at=(0, -0.118 * b, 0.5), scale=(1, 0.6, 1.3), sub=1)
    lump('gourd', 0.05, mat('matte', '#9a6a36'), F['spine'], at=(-0.12 * b, -0.07, 0.43), scale=(1.0, 1.0, 1.3), seed=3, rough=0.05)
    box('sash', (0.06, 0.014, 0.34), mat('team'), ch, at=(0.02, -0.13 * b, 0.62), rot=(0, 0.55, 0))
    # Wide cream sleeves, bare hands.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        tube(f'sleeve.{s}', 0.055 * b, 0.05 * b, ELBOW_DROP, cream, ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=12, sub=1)
        lathe(f'bell.{s}', [(0.05 * b, 0.12), (0.07 * b, 0.05), (0.09 * b, 0.0)], cream, fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.02), segs=14, sub=1)
        hx, hy, hz = hand_at(F, s)
        sphere(f'hand.{s}', 0.038, mat('matte', '#e0ac82'), hd, at=(hx, hy, hz), scale=(0.9, 1.0, 1.15), sub=1)
    # Leaf mantle and a leafy cloak over the robes.
    WD.leaf_mantle(F, 1.3)
    SY.leaf_cloak(F, length=0.65, flare=0.14, rows=5, seed=21)
    # Head: an old druid, a long braided white beard, a leaf crown.
    face(F, skin='#e0ac82', hair='#e8e4dc', brows='#e8e4dc', size=1.05, hair_style='long')
    lathe('beard', [(0.0, 0.0), (0.04, 0.03), (0.075, 0.12), (0.085, 0.24), (0.06, 0.34), (0.0, 0.38)], mat('matte', '#efece6'), h, at=(0, -0.075, HEAD - 0.42), scale=(1.1, 0.7, 1), segs=14, sub=1)
    torus('beardTie', 0.055, 0.01, mat('matte', '#6f8f2e'), h, at=(0, -0.08, HEAD - 0.3), rot=(0.2, 0, 0), segs=12, rsegs=3)
    torus('beardTie2', 0.04, 0.009, mat('matte', '#6f8f2e'), h, at=(0, -0.085, HEAD - 0.38), rot=(0.2, 0, 0), segs=12, rsegs=3)
    leaf_ring('leafCrown', h, (0, 0.0, HEAD + 0.07), 0.1, 10, 0.05, 0.1, WD.LEAVES, tilt=1.2)
    # The staff: twisted branches cradling a glowing green orb, a few leaves.
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (0.32, 0, 0)
    F.p['weapon'] = w
    curve_tube('staff', [(hx, hy, hz - 0.42), (hx + 0.015, hy, hz), (hx - 0.015, hy, hz + 0.35), (hx, hy, hz + 0.6)], 0.02, mat('matte', '#6e4626'), w, taper=[0.8, 1.0, 1.0, 1.2])
    for i in range(4):
        a = 2 * math.pi * i / 4 + 0.4
        curve_tube(f'branch{i}', [(hx, hy, hz + 0.6), (hx + math.cos(a) * 0.07, hy + math.sin(a) * 0.07, hz + 0.68), (hx + math.cos(a) * 0.05, hy + math.sin(a) * 0.05, hz + 0.8), (hx + math.cos(a + 1) * 0.015, hy + math.sin(a + 1) * 0.015, hz + 0.84)], 0.01, mat('matte', '#6e4626'), w, taper=[1.0, 0.9, 0.6, 0.3])
        leaf(f'staffLeaf{i}', w, (hx + math.cos(a) * 0.07, hy + math.sin(a) * 0.07, hz + 0.68), 0.04, 0.08, WD.LEAVES[i % 3], rot=(0.6, 0, a))
    sphere('orb', 0.05, mat('glow', '#9cff5a'), w, at=(hx, hy, hz + 0.72), sub=1)
    F.animate(attack=None, cast=True)
    SY.spear_thrust(F)
    return F
