"""Crown support units (sheet 02).

Cleric: a calm young woman in a deep cream hood and flowing cream robes with wide bell
sleeves, all gold-hemmed, a team stole down the front with a gold crown, a belt with
pouches, and a tall gold staff crowned with a glowing green crystal.
Outrider: a bearded scout in a team hood and short cape over a cream tunic and leather
jerkin, on a chestnut horse with a team saddle cloth, saddlebags and a bedroll, carrying a
spear with a long team pennant."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, ANKLE, SHOULDER, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import cloth_legs, face, hand_at, arm_x, crown_outline, GOLD, LEATHER, LEATHER_D
import archer as AR
import beasts as BS
import horse as HS
import sylvan as SY

CREAM = '#efe6d2'
CREAM_D = '#d8ccb2'
TRIM = '#e2b04a'


def cleric():
    F = Figure(bulk=1.05)
    b = F.bulk
    cream, cream_d, gold, team = mat('matte', CREAM), mat('matte', CREAM_D), mat('gold', TRIM), mat('team')
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    cloth_legs(F, pants=CREAM_D, boots=LEATHER_D)
    # Robes: a fitted bodice, a long skirt flaring to the ground, gold hem.
    lathe('robeTop', [(0.0, 0.0), (0.115 * b, 0.0), (0.13 * b, 0.08), (0.14 * b, 0.16), (0.13 * b, 0.21), (0.075, 0.245), (0.0, 0.25)], cream, ch, at=(0, 0, 0.5), scale=(1, 0.84, 1), segs=20, sub=1)
    lathe('robe', [(0.3 * b, 0.0), (0.24 * b, 0.18), (0.17 * b, 0.36), (0.135 * b, 0.45)], cream, hips, at=(0, 0.01, 0.04), scale=(1, 0.9, 1), segs=28, sub=1)
    lathe('robeHem', [(0.302 * b, 0.0), (0.296 * b, 0.035)], gold, hips, at=(0, 0.01, 0.038), scale=(1, 0.9, 1), segs=28)
    # The team stole: two panels down the front, gold-edged, a crown on the lower end.
    for sx in (-1, 1):
        box(f'stole{sx}', (0.055, 0.012, 0.3), team, ch, at=(sx * 0.045, -0.118 * b, 0.6), rot=(-0.06, 0, sx * -0.05), bevel=0.004)
    sheet('stoleTail', 0.11, 0.36, team, hips, at=(0, -0.13 * b, HIP + 0.02), bend=0.02, flare=0.1, cols=3, rows=5, thick=0.008)
    for sx in (-1, 1):
        curve_tube(f'stoleEdge{sx}', [(sx * 0.058, -0.137 * b, HIP + 0.02), (sx * 0.062, -0.16 * b, HIP - 0.17), (sx * 0.068, -0.19 * b, HIP - 0.34)], 0.006, gold, hips)
    extrude('stoleCrown', crown_outline(0.075, 0.055), 0.008, gold, hips, at=(0, -0.2 * b, HIP - 0.27), rot=(math.pi / 2 - 0.15, 0, 0), bevel=0.002)
    torus('belt', 0.13 * b, 0.018, mat('matte', LEATHER_D), spine, at=(0, 0, 0.5), scale=(1, 0.86, 1), segs=20, rsegs=5)
    sphere('beltDisc', 0.026, gold, spine, at=(0, -0.115 * b, 0.5), scale=(1, 0.5, 1), sub=1)
    for sx in (-1, 1):
        box(f'pouch{sx}', (0.065, 0.04, 0.07), mat('matte', LEATHER), spine, at=(sx * 0.115 * b, -0.06, 0.45), rot=(0, 0, sx * 0.45), bevel=0.012, sub=1)
    # A gold-trimmed mantle and the deep hood.
    lathe('mantle', [(0.07, 0.03), (0.135 * b, 0.0), (0.18 * b, -0.05), (0.19 * b, -0.075)], cream_d, ch, at=(0, 0, NECK), scale=(1, 0.88, 1), segs=22, sub=1)
    torus('mantleTrim', 0.188 * b, 0.009, gold, ch, at=(0, 0, NECK - 0.073), scale=(1, 0.88, 1), segs=24, rsegs=4)
    face(F, hair='#6a4426', brows='#5a3418', size=1.02)
    lathe('hood', [(0.0, -0.09), (0.115, -0.085), (0.123, -0.02), (0.117, 0.05), (0.085, 0.11), (0.0, 0.13)], cream, h,
          at=(0, 0.014, HEAD), scale=(1.05, 1.1, 1.05), segs=22, sub=1, angle=math.pi * 1.5, rot=(0, 0, -math.pi * 0.25))
    lathe('hoodPoint', [(0.05, 0.0), (0.03, 0.06), (0.0, 0.11)], cream, h, at=(0, 0.08, HEAD + 0.07), rot=(1.0, 0, 0), segs=12, sub=1)
    # A long cape behind, gold-hemmed.
    sheet('cape', 0.3 * b, 0.68, cream, ch, at=(0, 0.11 * b, NECK - 0.05), bend=0.08, flare=0.5, cols=10, rows=12, thick=0.012, seed=8)
    # Wide bell sleeves with gold cuffs, bare hands.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        sphere(f'shoulder.{s}', 0.056 * b, cream, ua, at=(x, 0, SHOULDER - 0.005), sub=1)
        tube(f'sleeve.{s}', 0.05 * b, 0.048 * b, ELBOW_DROP, cream, ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=12, sub=1)
        lathe(f'bell.{s}', [(0.05 * b, 0.13), (0.075 * b, 0.05), (0.1 * b, -0.02)], cream, fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.02), segs=16, sub=1)
        torus(f'cuff.{s}', 0.1 * b, 0.009, gold, fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=16, rsegs=4)
        hx, hy, hz = hand_at(F, s)
        sphere(f'hand.{s}', 0.036, mat('matte', '#eab58a'), hd, at=(hx, hy, hz), scale=(0.9, 1.0, 1.15), sub=1)
    # The gold staff with a sunburst cradle and a green crystal.
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (0.2, 0, 0)
    F.p['weapon'] = w
    tube('staff', 0.016, 0.018, 1.12, mat('matte', '#6e4626'), w, at=(hx, hy, hz - 0.45), segs=8)
    for i, z in enumerate((-0.44, 0.0, 0.42, 0.6)):
        torus(f'staffBand{i}', 0.02, 0.007, gold, w, at=(hx, hy, hz + z), segs=10, rsegs=3)
    top = (hx, hy, hz + 0.78)
    lathe('cradle', [(0.0, 0.0), (0.03, 0.03), (0.055, 0.09), (0.045, 0.1)], gold, w, at=(hx, hy, hz + 0.66), segs=10, sub=1)
    for i in range(4):
        a = 2 * math.pi * i / 4 + math.pi / 4
        curve_tube(f'prong{i}', [(hx + math.cos(a) * 0.045, hy + math.sin(a) * 0.045, hz + 0.75), (hx + math.cos(a) * 0.07, hy + math.sin(a) * 0.07, hz + 0.82), (hx + math.cos(a) * 0.03, hy + math.sin(a) * 0.03, hz + 0.9)], 0.008, gold, w, taper=[1.0, 0.8, 0.3])
    lathe('crystal', [(0.0, 0.0), (0.04, 0.05), (0.032, 0.11), (0.0, 0.17)], mat('glow', '#8aff5a'), w, at=(top[0], top[1], top[2] - 0.04), segs=8, sub=1)
    F.animate(attack=None, cast=True)
    SY.spear_thrust(F)
    return F


def outrider():
    B = HS.horse(coat='#9a5630', mane='#3a2416', barded=False)
    g, L, cz = 0.19, 0.92, B.cz
    bm, sd, hd = B['barrel'], B['saddle'], B['head']
    team, gold = mat('team'), mat('gold', TRIM)
    # Bridle, a team saddle cloth with a gold hem, saddle, saddlebags and a bedroll.
    hy, hz = -L * 0.62, cz + g * 1.75
    torus('noseband', g * 0.3, 0.01, mat('matte', LEATHER_D), hd, at=(0, hy - g * 0.6, hz - g * 0.35), rot=(math.pi / 2 + 0.55, 0, 0), segs=14, rsegs=3)
    torus('browband', g * 0.36, 0.01, mat('matte', LEATHER_D), hd, at=(0, hy + g * 0.05, hz + g * 0.15), rot=(math.pi / 2 - 0.3, 0, 0), segs=14, rsegs=3)
    lathe('cloth', [(g * 1.02, 0.0), (g * 1.05, g * 0.3), (g * 1.0, g * 0.55), (g * 0.6, g * 0.72)], team, bm, at=(0, 0.02, cz + g * 0.32), scale=(1.0, 1.25, 1.0), segs=24, sub=1)
    lathe('clothHem', [(g * 1.025, 0.0), (g * 1.04, g * 0.06)], gold, bm, at=(0, 0.02, cz + g * 0.3), scale=(1.0, 1.25, 1.0), segs=24)
    box('saddleSeat', (g * 0.95, g * 1.1, 0.05), mat('matte', LEATHER), sd, at=(0, 0.02, cz + g * 1.0), bevel=0.02, sub=1)
    box('saddleCantle', (g * 0.85, 0.04, 0.09), mat('matte', LEATHER_D), sd, at=(0, 0.02 + g * 0.55, cz + g * 1.04), rot=(-0.2, 0, 0), bevel=0.015, sub=1)
    box('saddlePommel', (g * 0.45, 0.04, 0.08), mat('matte', LEATHER_D), sd, at=(0, 0.02 - g * 0.52, cz + g * 1.03), rot=(0.25, 0, 0), bevel=0.015, sub=1)
    tube('bedroll', g * 0.22, g * 0.22, g * 1.5, mat('matte', '#b89a6a'), sd, at=(-g * 0.75, g * 0.82, cz + g * 1.08), rot=(0, math.pi / 2, 0), segs=12)
    for sx in (-0.4, 0.4):
        torus(f'bedrollStrap{sx}', g * 0.23, 0.008, mat('matte', LEATHER_D), sd, at=(sx * g, g * 0.82, cz + g * 1.08), rot=(0, math.pi / 2, 0), segs=12, rsegs=3)
    for sx in (-1, 1):
        box(f'saddlebag{sx}', (0.05, g * 0.6, g * 0.5), mat('matte', '#a07a48'), sd, at=(sx * g * 1.1, g * 0.6, cz + g * 0.62), bevel=0.02, sub=1)
        box(f'saddlebagFlap{sx}', (0.054, g * 0.62, g * 0.2), mat('matte', LEATHER), sd, at=(sx * g * 1.11, g * 0.6, cz + g * 0.78), bevel=0.015, sub=1)
        tube(f'stirrupStrap{sx}', 0.008, 0.008, g * 1.0, mat('matte', LEATHER_D), sd, at=(sx * g * 1.06, -0.02, cz + g * 0.05), segs=4)
    # The rider: team hood and short cape, cream tunic, leather jerkin, a dark beard.
    F = Figure(bulk=1.05)
    AR.hooded_body(F, cape_len=0.45, hair='#3a2414', beard='#3a2414')
    rh = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', rh, (hx, hy, hz))
    w.rotation_euler = (0.15, 0, 0)
    F.p['weapon'] = w
    tube('spear', 0.013, 0.015, 1.2, mat('matte', '#8a5a30'), w, at=(hx, hy, hz - 0.35), segs=8)
    lathe('spearTip', [(0.0, 0.0), (0.026, 0.03), (0.02, 0.08), (0.0, 0.16)], mat('metal', '#cfd6de'), w, at=(hx, hy, hz + 0.85), segs=6)
    torus('spearCollar', 0.019, 0.006, gold, w, at=(hx, hy, hz + 0.85), segs=10, rsegs=3)
    pen = pivot('pennant', w, (hx, hy, hz + 0.8))
    sheet('pennantCloth', 0.1, 0.42, team, pen, at=(hx, hy, hz + 0.8), rot=(0, -math.pi / 2, 0), bend=0.05, flare=-0.6, cols=3, rows=8, thick=0.004)
    F.p['pennant'] = pen
    BS.seat_rider(B, F)
    for s, sx in (('R', -1), ('L', 1)):
        F[f'thigh.{s}'].rotation_euler = (-1.3, sx * 0.5, 0)
        F[f'shin.{s}'].rotation_euler = (1.4, 0, 0)
    B.animate(gait='trot', attack='rear')
    F.animate(attack=None, mounted=True)
    SY.spear_thrust(F, mounted=True)
    return F
