"""Shared bodies, faces and gear for the unit models."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD

GOLD = '#f0bd4c'
LEATHER = '#8a5630'
LEATHER_D = '#5e3a20'
SKIN = '#eab58a'
DARK = '#1a140e'
WOOD = '#9a6838'
WOOD_D = '#6e4626'


def hand_at(F, s):
    sx = -1 if s == 'R' else 1
    return (SH_X * F.bulk * 1.06 * sx, -0.015, SHOULDER - WRIST_DROP - 0.035)


def arm_x(F, s):
    return SH_X * F.bulk * (-1 if s == 'R' else 1)


# ---- bodies ------------------------------------------------------------------------


def cloth_legs(F, pants, boots, boot_top=None, wraps=None):
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * F.bulk * sx
        th, sh, ft = F[f'thigh.{s}'], F[f'shin.{s}'], F[f'foot.{s}']
        tube(f'thigh.{s}', 0.06 * F.bulk, 0.048 * F.bulk, HIP - KNEE + 0.01, mat('matte', pants), th, at=(x, 0, KNEE - 0.005), segs=10, sub=1)
        tube(f'calf.{s}', 0.046 * F.bulk, 0.04 * F.bulk, KNEE - ANKLE, mat('matte', pants), sh, at=(x, -0.004, ANKLE), segs=10, sub=1)
        # Boots: a cuffed shaft and a rounded toe.
        lathe(f'boot.{s}', [(0.0, 0.0), (0.05, 0.0), (0.052, 0.07), (0.049, 0.13), (0.056, 0.15), (0.0, 0.15)], mat('matte', boots), sh, at=(x, 0, ANKLE - 0.06), segs=10, sub=1)
        if boot_top:
            torus(f'bootCuff.{s}', 0.054, 0.012, mat('matte', boot_top), sh, at=(x, 0, ANKLE + 0.085), segs=12, rsegs=4)
        if wraps:
            for i in range(3):
                torus(f'wrap{i}.{s}', 0.045, 0.006, mat('matte', wraps), sh, at=(x, 0, ANKLE + 0.04 + i * 0.045), rot=(0.15 * (i - 1), 0, 0), segs=10, rsegs=3)
        box(f'toe.{s}', (0.08 * F.bulk, 0.15, 0.055), mat('matte', boots), ft, at=(x, -0.035, 0.028), bevel=0.02, sub=1, taper=(0.9, 0.75))


def torso(F, shirt, belt=LEATHER, buckle=GOLD, robe=None, belly=0.0, waist=1.0):
    b = F.bulk
    lathe('hipsBody', [(0.0, 0.0), (0.12 * b * waist, 0.0), (0.125 * b * waist, 0.06), (0.12 * b, 0.1)], mat('matte', shirt), F['hips'], at=(0, 0, HIP - 0.05), scale=(1, 0.82, 1), segs=14, sub=1)
    lathe('torso', [(0.0, 0.0), (0.12 * b * waist, 0.0), (0.13 * b + belly, 0.07), (0.15 * b, 0.15), (0.14 * b, 0.21), (0.08, 0.245), (0.0, 0.25)], mat('matte', shirt), F['chest'], at=(0, 0, 0.52), scale=(1, 0.8, 1), segs=16, sub=1)
    if belly:
        sphere('belly', 0.11 * b + belly, mat('matte', shirt), F['spine'], at=(0, -0.03, 0.56), scale=(1, 0.9, 0.9), sub=1)
    if belt:
        torus('belt', 0.128 * b * waist + belly * 0.6, 0.016, mat('matte', belt), F['spine'], at=(0, 0, 0.515), scale=(1, 0.84, 1), segs=20, rsegs=5)
        if buckle:
            box('buckle', (0.045, 0.014, 0.04), mat('gold', buckle), F['spine'], at=(0, -0.112 * b * waist - belly * 0.8, 0.515), bevel=0.006)
    if robe:
        lathe('robe', [(0.17 * b, 0.0), (0.15 * b, 0.12), (0.13 * b, 0.26), (0.125 * b, 0.32)], mat('matte', robe), F['hips'], at=(0, 0, HIP - 0.36), scale=(1, 0.9, 1), segs=16, sub=1)


def cloth_arms(F, sleeve, skin=SKIN, glove=None, bracer=None, rolled=False):
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        sphere(f'shoulder.{s}', 0.058 * F.bulk, mat('matte', sleeve), ua, at=(x, 0, SHOULDER - 0.005), sub=1)
        tube(f'upper.{s}', 0.05 * F.bulk, 0.044 * F.bulk, ELBOW_DROP, mat('matte', sleeve), ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=10, sub=1)
        fore = skin if rolled else sleeve
        tube(f'fore.{s}', 0.044 * F.bulk, 0.036 * F.bulk, WRIST_DROP - ELBOW_DROP, mat('matte', fore), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=10, sub=1)
        if bracer:
            lathe(f'bracer.{s}', [(0.0, 0.0), (0.045, 0.0), (0.042, 0.08), (0.0, 0.08)], mat('matte', bracer), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.005), segs=10, sub=1)
        hx, hy, hz = hand_at(F, s)
        sphere(f'hand.{s}', 0.04 * F.bulk, mat('matte', glove or skin), hd, at=(hx, hy, hz), scale=(0.9, 1.0, 1.15), sub=1)
        sphere(f'thumb.{s}', 0.016 * F.bulk, mat('matte', glove or skin), hd, at=(hx - 0.02 * (1 if s == 'L' else -1), hy - 0.03, hz + 0.01), sub=0)


def face(F, skin=SKIN, hair=None, beard=None, brows=None, eyes='#2a1d14', ears=True, hair_style='cap', size=1.0):
    """A big, readable head: eyes, brows, nose, ears, hair and beard."""
    h = F['head']
    r = 0.088 * size
    sphere('head', r, mat('matte', skin), h, at=(0, 0, HEAD), scale=(0.95, 0.95, 1.0), segs=20, rings=14, sub=1)
    for sx in (-1, 1):
        sphere(f'eye{sx}', 0.012 * size, mat('matte', '#f4efe6'), h, at=(sx * 0.032 * size, -r * 0.86, HEAD + 0.012), scale=(1, 0.5, 1))
        sphere(f'pupil{sx}', 0.0075 * size, mat('matte', eyes), h, at=(sx * 0.032 * size, -r * 0.93, HEAD + 0.012))
        if brows:
            box(f'brow{sx}', (0.032 * size, 0.012, 0.01), mat('matte', brows), h, at=(sx * 0.033 * size, -r * 0.9, HEAD + 0.035 * size), rot=(0, -sx * 0.18, 0), bevel=0.003)
        if ears:
            sphere(f'ear{sx}', 0.02 * size, mat('matte', skin), h, at=(sx * r * 0.95, 0.0, HEAD + 0.0), scale=(0.5, 0.8, 1.1))
    sphere('nose', 0.019 * size, mat('matte', skin), h, at=(0, -r * 0.98, HEAD - 0.008), scale=(0.8, 1.0, 1.1))
    if hair:
        if hair_style in ('cap', 'long', 'bun'):
            sphere('hair', r * 1.04, mat('matte', hair), h, at=(0, 0.012, HEAD + 0.02), scale=(1.0, 1.0, 0.85), segs=18, rings=12, sub=1)
        if hair_style == 'long':
            sheet('hairBack', 0.15 * size, 0.16, mat('matte', hair), h, at=(0, 0.06, HEAD + 0.03), bend=0.03, flare=0.2, cols=4, rows=4, thick=0.02, ragged=0.02, seed=3)
        if hair_style == 'bun':
            sphere('bun', 0.035, mat('matte', hair), h, at=(0, 0.07, HEAD + 0.07), sub=1)
    if beard:
        lathe('beard', [(0.0, 0.0), (0.05 * size, 0.01), (0.065 * size, 0.05), (0.055 * size, 0.08), (0.0, 0.085)], mat('matte', beard), h,
              at=(0, -r * 0.55, HEAD - 0.11 * size), scale=(1.1, 0.75, 1), segs=12, sub=1)
        box('moustache', (0.07 * size, 0.018, 0.018), mat('matte', beard), h, at=(0, -r * 0.93, HEAD - 0.03 * size), bevel=0.008, sub=1)


# ---- headgear and cloaks -------------------------------------------------------------


def hood(F, color, tall=0.0, mantle=True, trim=None):
    h = F['head']
    lathe('hood', [(0.0, -0.075), (0.098, -0.07), (0.105, -0.02), (0.1, 0.05), (0.07, 0.095), (0.0, 0.11)], mat('matte', color), h,
          at=(0, 0.012, HEAD), scale=(1, 1.08, 1), segs=18, sub=1, angle=math.pi * 1.55, rot=(0, 0, -math.pi * 0.275))
    if tall:
        lathe('hoodTip', [(0.04, 0.0), (0.025, tall * 0.6), (0.0, tall)], mat('matte', color), h, at=(0, 0.06, HEAD + 0.07), rot=(0.9, 0, 0), segs=10, sub=1)
    if mantle:
        lathe('mantle', [(0.07, 0.03), (0.13 * F.bulk, 0.0), (0.18 * F.bulk, -0.05), (0.19 * F.bulk, -0.07)], mat('matte', color), F['chest'],
              at=(0, 0, NECK - 0.0), scale=(1, 0.85, 1), segs=18, sub=1)
        if trim:
            torus('mantleTrim', 0.188 * F.bulk, 0.008, mat('gold', trim), F['chest'], at=(0, 0, NECK - 0.07), scale=(1, 0.85, 1), segs=20, rsegs=4)


def cape(F, color, w=0.3, h=0.42, trim=None, ragged=0.0, seed=1):
    sheet('cape', w * F.bulk, h, mat('matte', color) if not color.startswith('team') else mat(color), F['chest'], at=(0, 0.1 * F.bulk, NECK - 0.02),
          bend=0.05, flare=0.35, cols=8, rows=8, thick=0.01, ragged=ragged, seed=seed)
    if trim:
        torus('capeClasp', 0.11 * F.bulk, 0.012, mat('gold', trim), F['chest'], at=(0, 0.01, NECK - 0.03), scale=(1, 0.8, 1), segs=16, rsegs=4)


def tabard(F, color='team', trim=GOLD, emblem=None, w=0.2, h=0.34):
    m = mat(color) if color.startswith('team') else mat('matte', color)
    sheet('tabard', w * F.bulk, h, m, F['chest'], at=(0, -0.122 * F.bulk, 0.71), bend=0.03, flare=0.3, cols=8, rows=8, thick=0.008)
    sheet('tabardBack', w * F.bulk, h * 0.95, m, F['chest'], at=(0, 0.12 * F.bulk, 0.7), rot=(0, 0, math.pi), bend=0.02, flare=0.3, cols=6, rows=6, thick=0.008)
    if trim:
        box('tabardHem', (w * F.bulk * 1.25, 0.012, 0.014), mat('gold', trim), F['chest'], at=(0, -0.14 * F.bulk, 0.71 - h + 0.01))
    if emblem:
        emblem(F['chest'], (0, -0.14 * F.bulk, 0.565))


def crown_outline(w, h):
    return [(-w / 2, 0), (w / 2, 0), (w / 2, h * 0.55), (w * 0.34, h * 0.35), (w * 0.22, h), (w * 0.1, h * 0.45),
            (0, h * 1.05), (-w * 0.1, h * 0.45), (-w * 0.22, h), (-w * 0.34, h * 0.35), (-w / 2, h * 0.55)]


def crown_emblem(parent, at, w=0.085):
    extrude('crownEmblem', crown_outline(w, w * 0.7), 0.012, mat('gold', GOLD), parent, at=at, bevel=0.003)


def leaf_outline(w, h):
    return [(0, 0), (w * 0.45, h * 0.25), (w * 0.5, h * 0.5), (w * 0.3, h * 0.8), (0, h), (-w * 0.3, h * 0.8), (-w * 0.5, h * 0.5), (-w * 0.45, h * 0.25)]


def leaf(name, parent, at, w, h, color, rot=(0, 0, 0), thick=0.008):
    return extrude(name, leaf_outline(w, h), thick, mat('matte', color), parent, at=at, rot=rot, bevel=0.002)


def leaf_ring(name, parent, centre, radius, n, w, h, colors, tilt=1.0, z_jitter=0.0, phase=0.0):
    """Leaves fanned in a ring, pointing outward and down (mantles, skirts, crowns)."""
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        x = centre[0] + math.cos(a) * radius
        y = centre[1] + math.sin(a) * radius
        z = centre[2] + (z_jitter * ((i * 37) % 7 - 3) / 3)
        # The leaf outline points up (+Z); turn it to point outward and droop by `tilt`.
        leaf(f'{name}{i}', parent, (x, y, z), w, h, colors[i % len(colors)], rot=(0, tilt, a))


# ---- weapons and gear (in the right hand) ----------------------------------------------


def held(F, s='R'):
    return F[f'hand.{s}'], hand_at(F, s)


def sword(F, length=0.38, blade='#e4e9f0', guard=GOLD, grip=LEATHER_D, s='R', tilt=0.5):
    hd, (hx, hy, hz) = held(F, s)
    def along(d):
        return (hx, hy - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    tube('grip', 0.014, 0.014, 0.09, mat('matte', grip), hd, at=along(-0.045), rot=(-(math.pi / 2 - tilt), 0, 0), segs=6)
    sphere('pommel', 0.022, mat('gold', guard), hd, at=along(-0.06))
    box('crossguard', (0.15, 0.022, 0.022), mat('gold', guard), hd, at=along(0.045), rot=(tilt, 0, 0), bevel=0.006)
    pts = [(0.0, 0.0), (0.028, 0.0), (0.024, length * 0.85), (0.0, length), (-0.024, length * 0.85), (-0.028, 0.0)]
    extrude('blade', pts, 0.012, mat('metal', blade), hd, at=along(0.055), rot=(math.pi / 2 + tilt, 0, 0), bevel=0.004)


def staff(F, length=0.95, wood=WOOD_D, s='R'):
    """A staff held upright; returns the top point (for its head)."""
    hd, (hx, hy, hz) = held(F, s)
    tube('staff', 0.017, 0.02, length, mat('matte', wood), hd, at=(hx, hy - 0.01, hz - length * 0.32), segs=8, sub=0)
    return hd, (hx, hy - 0.01, hz + length * 0.68)


def make_bow(F, length=0.62, wood=WOOD, grip=LEATHER_D):
    """A bow in the left hand on its own pivot (kept upright when the arm raises it)."""
    hx, hy, hz = hand_at(F, 'L')
    bp = pivot('bow', F['hand.L'], (hx, hy, hz))
    bp.rotation_euler = (0.47, 0, 0)  # upright while the arm hangs (see Figure.animate)
    F.p['bow'] = bp
    # A recurve: the belly bows forward (-Y), the tips curl back.
    half = length / 2
    path = [(hx, hy + 0.03, hz - half), (hx, hy - 0.035, hz - half * 0.7), (hx, hy - 0.075, hz - half * 0.25), (hx, hy - 0.08, hz),
            (hx, hy - 0.075, hz + half * 0.25), (hx, hy - 0.035, hz + half * 0.7), (hx, hy + 0.03, hz + half)]
    curve_tube('bowLimbs', path, 0.016, mat('matte', wood), bp, taper=[0.6, 0.8, 1.0, 1.25, 1.0, 0.8, 0.6])
    tube('bowstring', 0.003, 0.003, length * 0.98, mat('matte', '#efe6d0'), bp, at=(hx, hy + 0.03, hz - length * 0.49), segs=4, caps=False)
    tube('bowGrip', 0.022, 0.022, 0.08, mat('matte', grip), bp, at=(hx, hy - 0.08, hz - 0.04), segs=8)
    for sgn in (-1, 1):
        sphere(f'bowTip{sgn}', 0.012, mat('gold', GOLD), bp, at=(hx, hy + 0.03, hz + sgn * length * 0.5))


def quiver(F, color=LEATHER, fletch='#e8e0c8', arrows=5):
    ch = F['chest']
    lathe('quiver', [(0.0, 0.0), (0.045, 0.0), (0.05, 0.25), (0.054, 0.27), (0.0, 0.27)], mat('matte', color), ch,
          at=(0.06, 0.15, 0.48), rot=(-0.25, 0.35, 0), segs=10, sub=1)
    for i in range(arrows):
        tube(f'arrow{i}', 0.004, 0.004, 0.12, mat('matte', '#c9a46a'), ch, at=(0.04 + i * 0.012, 0.19 + (i % 2) * 0.01, 0.73), rot=(-0.25, 0.35, 0), segs=4, caps=False)
        box(f'fletch{i}', (0.012, 0.004, 0.035), mat('matte', fletch if i % 2 else '#c8402e'), ch, at=(0.05 + i * 0.012, 0.21 + (i % 2) * 0.01, 0.84), rot=(-0.25, 0.35, 0))


def round_shield(F, face, rim, boss=GOLD, r=0.16, s='L', studs=8, team_face=False):
    fa = F[f'forearm.{s}']
    sx = arm_x(F, s) * 1.05 + (0.04 if s == 'L' else -0.04)
    sz = SHOULDER - WRIST_DROP + 0.07
    yaw = -0.55 if s == 'L' else 0.55
    c, sn = math.cos(yaw), math.sin(yaw)
    def on(dy):
        return (sx - dy * sn, -0.07 + dy * c, sz)
    lathe('shieldFace', [(0.0, 0.0), (r, 0.0), (r * 0.98, 0.02), (0.0, 0.035)], mat(face) if team_face else mat('matte', face), fa,
          at=on(0.0), rot=(math.pi / 2, 0, yaw), segs=20, sub=0)
    torus('shieldRim', r, 0.014, mat('metal', rim), fa, at=on(-0.005), rot=(math.pi / 2, 0, yaw), segs=24, rsegs=5)
    sphere('shieldBoss', 0.04, mat('gold', boss), fa, at=on(-0.03), scale=(1, 0.6, 1), sub=1)
    for i in range(studs):
        a = 2 * math.pi * i / studs
        px = math.cos(a) * r * 0.8
        pz = math.sin(a) * r * 0.8
        sphere(f'stud{i}', 0.01, mat('metal', rim), fa, at=(on(-0.025)[0] + px * c, on(-0.025)[1] + px * sn, sz + pz))
