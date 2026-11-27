"""Ironvale Crown unit models (sheet 02). Run: python3 scripts/models/build.py guard"""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, boolean_cut, finish
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD

STEEL = '#9aa5b4'
STEEL_D = '#6e7886'
MAIL = '#5f6874'
GOLD = '#f0bd4c'
LEATHER = '#8a5630'
LEATHER_D = '#5e3a20'
SKIN = '#eab58a'


def crown_outline(w, h):
    """A five-pointed crown silhouette, base on z = 0."""
    pts = [(-w / 2, 0), (w / 2, 0), (w / 2, h * 0.55), (w * 0.34, h * 0.35), (w * 0.22, h), (w * 0.1, h * 0.45),
           (0, h * 1.05), (-w * 0.1, h * 0.45), (-w * 0.22, h), (-w * 0.34, h * 0.35), (-w / 2, h * 0.55)]
    return pts


def kite_outline(w, h, n=14):
    """A kite shield: rounded top, tapering to a point at the bottom (z from -h/2 to h/2)."""
    pts = []
    for i in range(n + 1):
        a = math.pi * i / n
        pts.append((math.cos(a) * w / 2, h * 0.22 + math.sin(a) * w * 0.32))
    pts.append((-w * 0.47, -h * 0.05))
    pts.append((-w * 0.25, -h * 0.32))
    pts.append((0, -h * 0.5))
    pts.append((w * 0.25, -h * 0.32))
    pts.append((w * 0.47, -h * 0.05))
    return pts


def armoured_legs(F, plate=STEEL, under=MAIL):
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * F.bulk * sx
        th, sh, ft = F[f'thigh.{s}'], F[f'shin.{s}'], F[f'foot.{s}']
        tube(f'cuisse.{s}', 0.062, 0.05, HIP - KNEE - 0.01, mat('metal', under), th, at=(x, 0, KNEE + 0.01), segs=10, sub=1)
        lathe(f'cuissePlate.{s}', [(0.066, 0.0), (0.07, 0.06), (0.064, 0.15), (0.05, 0.19)], mat('metal', plate), th, at=(x, -0.004, KNEE + 0.02), scale=(1, 0.9, 1), segs=12, angle=math.pi * 1.2, sub=1)
        sphere(f'knee.{s}', 0.05, mat('metal', plate), sh, at=(x, -0.02, KNEE), scale=(1, 0.85, 1.05), sub=1)
        sphere(f'kneeStud.{s}', 0.014, mat('gold', GOLD), sh, at=(x, -0.064, KNEE + 0.002))
        lathe(f'greave.{s}', [(0.0, 0.0), (0.05, 0.0), (0.056, 0.05), (0.05, 0.13), (0.045, KNEE - ANKLE - 0.02), (0.0, KNEE - ANKLE - 0.02)], mat('metal', plate), sh, at=(x, 0, ANKLE + 0.01), segs=12, sub=1)
        torus(f'greaveTrim.{s}', 0.049, 0.007, mat('gold', GOLD), sh, at=(x, 0, KNEE - 0.04), segs=14, rsegs=4)
        box(f'sabaton.{s}', (0.085, 0.17, 0.06), mat('metal', plate), ft, at=(x, -0.035, 0.03), bevel=0.018, sub=1, taper=(0.85, 0.7))
        box(f'sole.{s}', (0.09, 0.175, 0.016), mat('matte', LEATHER_D), ft, at=(x, -0.035, 0.008), bevel=0.005)


def armoured_arm(F, s, plate=STEEL, under=MAIL, glove=STEEL_D):
    sx = -1 if s == 'R' else 1
    x = SH_X * F.bulk * sx
    ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
    tube(f'arm.{s}', 0.048, 0.043, ELBOW_DROP, mat('metal', under), ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=10, sub=1)
    # Layered pauldron: three shells, gold rim on the top one.
    tilt = (0, -sx * 0.45, 0)
    for i, (rr, dz, dx) in enumerate(((0.095, 0.03, 0.0), (0.09, -0.005, 0.022), (0.08, -0.04, 0.04))):
        lathe(f'pauldron{i}.{s}', [(0.0, 0.08), (rr * 0.6, 0.075), (rr * 0.88, 0.05), (rr, 0.015), (rr * 1.04, -0.012), (rr * 0.98, -0.02)], mat('metal', plate), ua,
              at=(x + sx * (0.025 + dx), 0, SHOULDER + dz), rot=tilt, scale=(1.05, 1.1, 1.0), segs=16, sub=1)
        torus(f'pauldronRim{i}.{s}', rr * 1.03, 0.0065, mat('gold', GOLD), ua, at=(x + sx * (0.025 + dx) + sx * 0.012 * math.sin(0.45), 0, SHOULDER + dz - 0.012), rot=tilt, scale=(1.05, 1.1, 1), segs=20, rsegs=4)
    sphere(f'pauldronStud.{s}', 0.014, mat('gold', GOLD), ua, at=(x + sx * 0.06, 0, SHOULDER + 0.095))
    sphere(f'elbow.{s}', 0.045, mat('metal', plate), fa, at=(x * 1.04, 0.01, SHOULDER - ELBOW_DROP), scale=(1, 1.1, 0.9), sub=1)
    lathe(f'vambrace.{s}', [(0.0, 0.0), (0.05, 0.0), (0.046, 0.06), (0.042, 0.12), (0.0, 0.12)], mat('metal', plate), fa,
          at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.025), segs=12, sub=1)
    torus(f'vambraceTrim.{s}', 0.044, 0.006, mat('gold', GOLD), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.12), segs=14, rsegs=4)
    # Gauntlet: a flared cuff and a big fist.
    lathe(f'cuff.{s}', [(0.04, 0.0), (0.058, 0.035), (0.06, 0.04)], mat('metal', plate), hd, at=(x * 1.06, -0.01, SHOULDER - WRIST_DROP - 0.005), segs=12, angle=2 * math.pi, sub=0)
    sphere(f'fist.{s}', 0.045, mat('metal', glove), hd, at=(x * 1.06, -0.015, SHOULDER - WRIST_DROP - 0.035), scale=(0.9, 1.05, 1.1), sub=1)


def guard():
    F = Figure(bulk=1.18)
    team, team_d = mat('team'), mat('team_dark')
    steel, gold = mat('metal', STEEL), mat('gold', GOLD)
    armoured_legs(F)
    hips, chest, head = F['hips'], F['spine'], F['head']
    ch = F['chest']
    # Mail skirt and belt.
    lathe('skirt', [(0.15, 0.0), (0.13, 0.07), (0.12, 0.13)], mat('metal', MAIL), hips, at=(0, 0, HIP - 0.1), segs=18, sub=1)
    torus('belt', 0.13, 0.016, mat('matte', LEATHER), F['spine'], at=(0, 0, 0.515), scale=(1, 0.88, 1), segs=20, rsegs=5)
    box('buckle', (0.05, 0.015, 0.04), gold, F['spine'], at=(0, -0.118, 0.515), bevel=0.006)
    # Breastplate, gorget, back plate.
    lathe('breastplate', [(0.0, 0.0), (0.128, 0.0), (0.15, 0.05), (0.16, 0.12), (0.15, 0.18), (0.11, 0.225), (0.0, 0.235)], steel, ch, at=(0, 0, 0.53), scale=(1, 0.82, 1), segs=20, sub=1)
    torus('gorget', 0.075, 0.022, steel, ch, at=(0, 0, NECK - 0.01), scale=(1, 0.9, 1), segs=16, rsegs=6)
    torus('gorgetTrim', 0.078, 0.007, gold, ch, at=(0, 0, NECK + 0.006), scale=(1, 0.9, 1), segs=16, rsegs=4)
    # Tabard front and back in the team colour, gold trim, a crown on the front.
    sheet('tabard', 0.22, 0.38, team, ch, at=(0, -0.132, 0.71), bend=0.03, flare=0.3, cols=8, rows=8, thick=0.008, ragged=0.0)
    sheet('tabardBack', 0.23, 0.36, team, ch, at=(0, 0.13, 0.7), rot=(0, 0, math.pi), bend=0.02, flare=0.25, cols=6, rows=6, thick=0.008)
    for xx in (-1, 1):
        box(f'tabardTrim{xx}', (0.012, 0.012, 0.34), gold, ch, at=(xx * 0.1, -0.14, 0.53), rot=(-0.05, 0, xx * 0.06))
    box('tabardHem', (0.235, 0.012, 0.014), gold, ch, at=(0, -0.152, 0.355))
    extrude('crownEmblem', crown_outline(0.085, 0.06), 0.012, gold, ch, at=(0, -0.152, 0.565), bevel=0.003)
    sphere('emblemGem', 0.009, mat('glow', '#6aa8ff'), ch, at=(0, -0.16, 0.583))
    # Arms.
    armoured_arm(F, 'R')
    armoured_arm(F, 'L')
    # Great helm: rounded top, flat face, visor slit, gold cross, team plume.
    helm = lathe('helm', [(0.0, -0.105), (0.09, -0.105), (0.098, -0.06), (0.1, 0.0), (0.098, 0.05), (0.085, 0.085), (0.05, 0.108), (0.0, 0.115)], steel, head,
                 at=(0, 0, HEAD), scale=(1, 1.02, 1), segs=20, sub=1)
    slit = box('visorCut', (0.16, 0.06, 0.016), steel, head, at=(0, -0.1, HEAD + 0.012))
    slit['cutter'] = True
    boolean_cut(helm, slit)
    box('visorDark', (0.15, 0.02, 0.014), mat('matte', '#16120e'), head, at=(0, -0.08, HEAD + 0.012))
    box('helmCross', (0.022, 0.02, 0.15), gold, head, at=(0, -0.1, HEAD - 0.01), bevel=0.005)
    torus('helmBand', 0.1, 0.007, gold, head, at=(0, 0, HEAD + 0.045), scale=(1, 1.02, 1), segs=20, rsegs=4)
    for i in range(3):
        sphere(f'breath{i}', 0.006, mat('matte', '#16120e'), head, at=(0.035 + i * 0.016, -0.1, HEAD - 0.045))
        sphere(f'breathL{i}', 0.006, mat('matte', '#16120e'), head, at=(-0.035 - i * 0.016, -0.1, HEAD - 0.045))
    # Plume: a sweep of team feathers from the crown of the helm.
    for i in range(6):
        t = i / 5
        sphere(f'plume{i}', 0.04 - t * 0.012, team if i % 2 == 0 else team_d, head,
               at=(0, 0.015 + t * 0.13, HEAD + 0.14 - t * t * 0.13), scale=(0.65, 1.7, 1), rot=(0.4 + t * 0.6, 0, 0), sub=1)
    # Kite shield on the left forearm: gold rim, team face, crown, boss.
    fa = F['forearm.L']
    sx = SH_X * F.bulk * 1.05 + 0.03
    sz = SHOULDER - WRIST_DROP + 0.07
    yaw = -0.55  # turned to face forward-left
    def on(dx, dy, dz):
        # A point on the shield (dx across, dy out from its face, dz up) in world space.
        c, sn = math.cos(yaw), math.sin(yaw)
        return (sx + dx * c - dy * sn, -0.075 + dx * sn + dy * c, sz + dz)
    extrude('shieldRim', kite_outline(0.34, 0.48), 0.035, gold, fa, at=on(0, 0, 0), rot=(0, 0, yaw), bevel=0.01)
    extrude('shieldFace', kite_outline(0.3, 0.43), 0.04, team, fa, at=on(0, -0.006, 0.004), rot=(0, 0, yaw), bevel=0.006)
    extrude('shieldCrown', crown_outline(0.11, 0.08), 0.02, gold, fa, at=on(0, -0.03, 0.03), rot=(0, 0, yaw), bevel=0.004)
    sphere('shieldGem', 0.012, mat('glow', '#6aa8ff'), fa, at=on(0, -0.04, 0.05))
    extrude('shieldChevron', [(-0.1, 0.0), (0.0, -0.09), (0.1, 0.0), (0.1, 0.025), (0.0, -0.065), (-0.1, 0.025)], 0.02, gold, fa, at=on(0, -0.03, -0.04), rot=(0, 0, yaw), bevel=0.003)
    # Arming sword in the right fist, pointing forward and up.
    hd = F['hand.R']
    hx = -SH_X * F.bulk * 1.06
    hz = SHOULDER - WRIST_DROP - 0.035
    tilt = 0.5
    def along(d):
        return (hx, -0.015 - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    rot = (math.pi / 2 + tilt, 0, 0)
    tube('grip', 0.014, 0.014, 0.09, mat('matte', LEATHER_D), hd, at=along(-0.045), rot=(-(math.pi / 2 - tilt), 0, 0), segs=6)
    sphere('pommel', 0.022, gold, hd, at=along(-0.06), sub=0)
    box('crossguard', (0.15, 0.022, 0.022), gold, hd, at=along(0.045), rot=(tilt, 0, 0), bevel=0.006)
    blade = [(0.0, 0.0), (0.028, 0.0), (0.024, 0.32), (0.0, 0.38), (-0.024, 0.32), (-0.028, 0.0)]
    b = extrude('blade', [(x, z) for x, z in blade], 0.012, mat('metal', '#e4e9f0'), hd, at=along(0.055), rot=(-(math.pi / 2 - tilt) - math.pi / 2 + math.pi, 0, 0), bevel=0.004)
    F.animate(attack='slash')
    return F
