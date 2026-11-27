"""Crown heavy infantry in heroic plate (sheets 02 and 16): the Guard, the Sentinel and
the Bearwarden share one body - broad layered pauldrons with gold rims, a sculpted
breastplate crossed by gold straps, a wide belt with a big buckle, steel tassets over
a short pointed team tabard, plated legs with knee cops and broad sabatons.

- guard: great helm with a tall team plume, kite shield with a crown, a broadsword.
- sentinel: crowned great helm, a tall tower shield, broadsword, short cape.
- bearwarden: bare-headed with long hair and beard, a long team cape, a kite shield
  with crown and laurels, and a long warhammer."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, curve_tube, boolean_cut
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import face, hand_at, arm_x, GOLD, LEATHER, LEATHER_D
import crown as CR

STEEL = '#a3adba'
STEEL_D = '#6e7886'
MAIL = '#5f6874'
TRIM = '#e8b84c'


def legs(F):
    steel, trim, b = mat('metal', STEEL), mat('gold', TRIM), F.bulk
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.078 * b * sx
        th, sh, ft = F[f'thigh.{s}'], F[f'shin.{s}'], F[f'foot.{s}']
        tube(f'mailThigh.{s}', 0.066 * b, 0.054 * b, HIP - KNEE, mat('metal', MAIL), th, at=(x, 0, KNEE + 0.01), segs=12, sub=1)
        lathe(f'cuisse.{s}', [(0.072 * b, 0.0), (0.078 * b, 0.07), (0.07 * b, 0.15), (0.056 * b, 0.19)], steel, th, at=(x, -0.006, KNEE + 0.025), scale=(1, 0.95, 1), segs=14, angle=math.pi * 1.25, rot=(0, 0, math.pi * 0.875), sub=1)
        # Knee cop: a dome with a fan wing and a gold rim.
        lathe(f'poleyn.{s}', [(0.0, 0.035), (0.045 * b, 0.028), (0.062 * b, 0.0), (0.058 * b, -0.012)], steel, sh, at=(x, -0.03, KNEE), rot=(math.pi / 2, 0, 0), segs=16, sub=1)
        torus(f'poleynRim.{s}', 0.06 * b, 0.007, trim, sh, at=(x, -0.032, KNEE), rot=(math.pi / 2, 0, 0), segs=18, rsegs=4)
        sphere(f'poleynStud.{s}', 0.014, trim, sh, at=(x, -0.068, KNEE))
        lathe(f'greave.{s}', [(0.0, 0.0), (0.058 * b, 0.0), (0.064 * b, 0.05), (0.058 * b, 0.12), (0.05 * b, KNEE - ANKLE - 0.03), (0.0, KNEE - ANKLE - 0.03)], steel, sh, at=(x, 0, ANKLE + 0.01), segs=14, sub=1)
        torus(f'greaveTrim.{s}', 0.057 * b, 0.007, trim, sh, at=(x, 0, ANKLE + 0.13), segs=16, rsegs=4)
        # Broad sabatons of overlapping lames.
        for i in range(3):
            box(f'sabaton{i}.{s}', (0.095 * b, 0.065, 0.05 - i * 0.008), steel, ft, at=(x, -0.02 - i * 0.045, 0.032 - i * 0.004), bevel=0.016, sub=1)
        box(f'sole.{s}', (0.1 * b, 0.19, 0.018), mat('matte', LEATHER_D), ft, at=(x, -0.05, 0.009), bevel=0.006)


def torso(F, tabard=True):
    team, team_d = mat('team'), mat('team_dark')
    steel, trim, b = mat('metal', STEEL), mat('gold', TRIM), F.bulk
    hips, spine, ch = F['hips'], F['spine'], F['chest']
    # Mail under it all.
    lathe('mail', [(0.0, 0.0), (0.125 * b, 0.0), (0.135 * b, 0.1), (0.14 * b, 0.22), (0.0, 0.24)], mat('metal', MAIL), ch, at=(0, 0, 0.48), scale=(1, 0.82, 1), segs=18, sub=1)
    # Breastplate: a strong chest and a lower plackart, gold-trimmed at the neck and waist.
    lathe('breastplate', [(0.0, 0.0), (0.13 * b, 0.0), (0.155 * b, 0.05), (0.168 * b, 0.12), (0.16 * b, 0.18), (0.12 * b, 0.225), (0.0, 0.235)], steel, ch, at=(0, -0.004, 0.53), scale=(1, 0.84, 1), segs=22, sub=1)
    box('chestRidge', (0.014, 0.012, 0.2), mat('metal', '#c8d0da'), ch, at=(0, -0.142 * b, 0.62), rot=(-0.14, 0, 0), bevel=0.004)
    torus('neckTrim', 0.09 * b, 0.009, trim, ch, at=(0, -0.004, 0.755), scale=(1, 0.86, 1), segs=22, rsegs=4)
    lathe('plackart', [(0.128 * b, 0.0), (0.138 * b, 0.05), (0.13 * b, 0.08)], steel, ch, at=(0, -0.004, 0.5), scale=(1, 0.84, 1), segs=22, sub=1)
    torus('waistTrim', 0.136 * b, 0.008, trim, ch, at=(0, -0.004, 0.535), scale=(1, 0.84, 1), segs=22, rsegs=4)
    torus('gorget', 0.08 * b, 0.024, steel, ch, at=(0, 0, NECK - 0.012), scale=(1, 0.9, 1), segs=18, rsegs=6)
    # Crossed gold straps over the chest (sheet 02), meeting at a boss.
    for sgn in (-1, 1):
        box(f'strap{sgn}', (0.026, 0.014, 0.25), trim, ch, at=(0, -0.15 * b, 0.635), rot=(-0.12, sgn * 0.62, 0), bevel=0.004)
    sphere('strapBoss', 0.022, trim, ch, at=(0, -0.158 * b, 0.635), scale=(1, 0.6, 1), sub=1)
    # A wide belt with a big square buckle and a pouch.
    torus('belt', 0.14 * b, 0.022, mat('matte', LEATHER_D), spine, at=(0, 0, 0.5), scale=(1, 0.86, 1.25), segs=24, rsegs=6)
    box('buckle', (0.075, 0.02, 0.06), mat('gold', TRIM), spine, at=(0, -0.124 * b, 0.5), bevel=0.008)
    box('buckleHole', (0.045, 0.022, 0.03), mat('matte', LEATHER_D), spine, at=(0, -0.13 * b, 0.5), bevel=0.004)
    box('pouch', (0.07, 0.04, 0.07), mat('matte', LEATHER), spine, at=(0.1 * b, -0.09, 0.46), rot=(0, 0, -0.4), bevel=0.014, sub=1)
    # Tassets: steel lames flaring over the hips, gold-edged.
    for i in range(3):
        r0 = (0.142 + i * 0.013) * b
        lathe(f'tasset{i}', [(r0, 0.0), (r0 + 0.012, -0.05)], steel, hips, at=(0, 0, 0.485 - i * 0.045), scale=(1, 0.86, 1), segs=22, sub=1)
    lathe('tassetTrim', [(0.184 * b, 0.0), (0.186 * b, -0.008)], trim, hips, at=(0, 0, 0.395), scale=(1, 0.86, 1), segs=22)
    if tabard:
        # A short team tabard, front and back, cut to a point, gold-edged.
        pts = [(-0.1, 0.0), (0.1, 0.0), (0.095, -0.22), (0.0, -0.3), (-0.095, -0.22)]
        for side, y, rz in (('Front', -0.128 * b, 0.0), ('Back', 0.128 * b, math.pi)):
            extrude(f'tabard{side}', [(px * b, pz) for px, pz in pts], 0.012, team, hips, at=(0, y * 1.08, 0.49), rot=(0, 0, rz), bevel=0.003)
            extrude(f'tabardEdge{side}', [(px * b * 1.08, pz * 1.04 - 0.006) for px, pz in pts], 0.008, trim, hips, at=(0, y * 1.07, 0.494), rot=(0, 0, rz), bevel=0.002)
        extrude('tabardCrown', CR.crown_outline(0.08, 0.058), 0.008, trim, hips, at=(0, -0.146 * b, 0.33), bevel=0.002)


def arms(F):
    for s in 'RL':
        CR.armoured_arm(F, s, plate=STEEL)


def great_helm(F, crest=False):
    h, steel, trim = F['head'], mat('metal', STEEL), mat('gold', TRIM)
    helm = lathe('helm', [(0.0, -0.11), (0.095, -0.11), (0.104, -0.06), (0.106, 0.0), (0.103, 0.05), (0.09, 0.09), (0.055, 0.115), (0.0, 0.122)], steel, h, at=(0, 0, HEAD), scale=(1.12, 1.15, 1.1), segs=22, sub=1)
    slit = box('visorCut', (0.19, 0.06, 0.02), steel, h, at=(0, -0.12, HEAD + 0.016))
    slit['cutter'] = True
    boolean_cut(helm, slit)
    box('visorDark', (0.17, 0.02, 0.018), mat('matte', '#16120e'), h, at=(0, -0.1, HEAD + 0.016))
    for sx in (-1, 1):
        box(f'breaths{sx}', (0.013, 0.01, 0.055), mat('matte', '#16120e'), h, at=(sx * 0.034, -0.119, HEAD - 0.05), bevel=0.003)
    box('helmCross', (0.026, 0.022, 0.18), trim, h, at=(0, -0.121, HEAD - 0.01), bevel=0.006)
    torus('helmBand', 0.105, 0.009, trim, h, at=(0, 0, HEAD + 0.053), scale=(1.12, 1.15, 1), segs=22, rsegs=4)
    torus('helmRim', 0.1, 0.009, trim, h, at=(0, 0, HEAD - 0.115), scale=(1.12, 1.15, 1), segs=22, rsegs=4)
    # A tall plume of team feathers sweeping back (a crowned crest for the Sentinel).
    path = [(0, 0.0, HEAD + 0.12), (0, 0.04, HEAD + 0.22), (0, 0.13, HEAD + 0.24), (0, 0.22, HEAD + 0.16), (0, 0.26, HEAD + 0.05)]
    for i in range(14):
        t = i / 13
        seg = t * (len(path) - 1)
        k = min(int(seg), len(path) - 2)
        f = seg - k
        p = [path[k][j] * (1 - f) + path[k + 1][j] * f for j in range(3)]
        size = 0.05 * (1 - 0.5 * t) + 0.012
        sphere(f'plume{i}', size * 1.2, mat('team'), h, at=p, scale=(0.55, 1.0, 0.8), rot=(0.3 + t * 1.6, 0, 0), sub=1)
    curve_tube('plumeCore', path, 0.03, mat('team_dark'), h, taper=[0.8, 1.0, 0.9, 0.6, 0.2])
    if crest:
        extrude('helmCrown', CR.crown_outline(0.1, 0.075), 0.016, trim, h, at=(0, -0.095, HEAD + 0.075), bevel=0.003)


def bearwarden_head(F):
    h = F['head']
    face(F, hair='#3a2414', beard='#3a2414', brows='#2a180c', size=1.06, hair_style='long')
    for sx in (-1, 1):
        for i in range(3):
            from blib import lump
            lump(f'lock{sx}{i}', 0.034, mat('matte', '#3a2414'), h, at=(sx * 0.09, 0.03 + i * 0.02, HEAD - 0.05 - i * 0.04), scale=(0.8, 1.0, 1.25), seed=80 + i + (sx > 0) * 5, rough=0.2)


def kite_shield(F, laurels=False):
    """Kite shield on the left forearm: gold rim, team face, a crown (with laurels)."""
    fa, team, trim = F['forearm.L'], mat('team'), mat('gold', TRIM)
    sx = SH_X * F.bulk * 1.05 + 0.035
    sz = SHOULDER - WRIST_DROP + 0.07
    yaw = -0.55
    def on(dx, dy, dz):
        c, sn = math.cos(yaw), math.sin(yaw)
        return (sx + dx * c - dy * sn, -0.08 + dx * sn + dy * c, sz + dz)
    extrude('shieldRim', CR.kite_outline(0.38, 0.54), 0.04, trim, fa, at=on(0, 0, 0), rot=(0, 0, yaw), bevel=0.012)
    extrude('shieldFace', CR.kite_outline(0.33, 0.48), 0.046, team, fa, at=on(0, -0.006, 0.004), rot=(0, 0, yaw), bevel=0.008)
    extrude('shieldCrown', CR.crown_outline(0.13, 0.095), 0.02, trim, fa, at=on(0, -0.032, 0.035), rot=(0, 0, yaw), bevel=0.004)
    if laurels:
        for sgn in (-1, 1):
            for i in range(4):
                a = -0.6 + i * 0.35
                extrude(f'laurel{sgn}{i}', [(-0.012, 0.0), (0.0, -0.01), (0.012, 0.0), (0.0, 0.03)], 0.006, trim, fa,
                        at=on(sgn * (0.085 - 0.01 * i), -0.033, -0.07 + i * 0.045), rot=(0, sgn * a, yaw), bevel=0.001)
    else:
        extrude('shieldChevron', [(-0.11, 0.0), (0.0, -0.1), (0.11, 0.0), (0.11, 0.028), (0.0, -0.072), (-0.11, 0.028)], 0.02, trim, fa, at=on(0, -0.03, -0.05), rot=(0, 0, yaw), bevel=0.003)


def broadsword(F):
    hd, trim = F['hand.R'], mat('gold', TRIM)
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (2.55, 0, 0)  # point forward and down at rest
    F.p['weapon'] = w
    tube('grip', 0.016, 0.016, 0.11, mat('matte', LEATHER_D), w, at=(hx, hy, hz - 0.055), segs=8)
    sphere('pommel', 0.026, trim, w, at=(hx, hy, hz - 0.07), sub=1)
    box('crossguard', (0.17, 0.026, 0.026), trim, w, at=(hx, hy, hz + 0.06), bevel=0.008)
    extrude('blade', [(-0.046, 0.0), (0.046, 0.0), (0.042, 0.32), (0.0, 0.4), (-0.042, 0.32)], 0.016, mat('metal', '#e4e9f0'), w, at=(hx, hy + 0.007, hz + 0.07), bevel=0.004)
    box('fuller', (0.012, 0.018, 0.27), mat('metal', '#b8c0ca'), w, at=(hx, hy, hz + 0.22))


def warhammer(F):
    hd, trim, steel = F['hand.R'], mat('gold', TRIM), mat('metal', STEEL)
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (0.5, 0, 0)  # haft upright, leaning a little forward
    F.p['weapon'] = w
    tube('haft', 0.016, 0.016, 0.78, mat('matte', LEATHER_D), w, at=(hx, hy, hz - 0.3), segs=8)
    for i, z in enumerate((-0.28, -0.05, 0.2, 0.4)):
        tube(f'haftBand{i}', 0.019, 0.019, 0.025, trim, w, at=(hx, hy, hz + z), segs=8, caps=False)
    sphere('haftFoot', 0.022, trim, w, at=(hx, hy, hz - 0.31), sub=1)
    top = hz + 0.5
    box('hammerHead', (0.24, 0.1, 0.11), steel, w, at=(hx, hy, top), bevel=0.016, sub=1)
    for sx in (-1, 1):
        box(f'hammerFace{sx}', (0.022, 0.12, 0.13), trim, w, at=(hx + sx * 0.125, hy, top), bevel=0.008)
        box(f'hammerBand{sx}', (0.02, 0.104, 0.115), trim, w, at=(hx + sx * 0.06, hy, top), bevel=0.004)
    extrude('hammerCrown', CR.crown_outline(0.05, 0.035), 0.008, trim, w, at=(hx, hy - 0.052, top - 0.015), bevel=0.002)
    lathe('hammerSpike', [(0.022, 0.0), (0.0, 0.08)], steel, w, at=(hx, hy, top + 0.055), segs=8)


def build(kind='guard', F=None, animate=True):
    F = F or Figure(bulk=1.22)
    legs(F)
    torso(F)
    arms(F)
    if kind == 'bearwarden':
        bearwarden_head(F)
        CR_cape(F, w=0.36, h=0.62)
        kite_shield(F, laurels=True)
        warhammer(F)
    else:
        great_helm(F, crest=kind == 'sentinel')
        if kind == 'sentinel':
            CR_cape(F, w=0.3, h=0.38)
            CR._guard_gear(F, 'tower', 'none', mat('metal', STEEL), mat('gold', TRIM), mat('team'))
        else:
            kite_shield(F)
        broadsword(F)
    if animate:
        F.animate(attack='slash')
    return F


def CR_cape(F, w, h):
    """A long team cape from the shoulders, gold clasps."""
    sheet('cape', w * F.bulk, h, mat('team'), F['chest'], at=(0, 0.11 * F.bulk, NECK - 0.01), bend=0.06, flare=0.4, cols=8, rows=10, thick=0.012)
    for sx in (-1, 1):
        sphere(f'capeClasp{sx}', 0.02, mat('gold', TRIM), F['chest'], at=(sx * 0.1 * F.bulk, -0.05, NECK - 0.02), sub=1)
