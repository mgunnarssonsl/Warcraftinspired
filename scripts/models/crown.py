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


def guard(kind='guard', F=None, animate=True):
    """The Guard, or a specialist built on it: 'sentinel' (tower shield, crested helm) or
    'bearwarden' (open helm, beard, long cape, war hammer)."""
    F = F or Figure(bulk=1.18)
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
    if kind == 'bearwarden':
        # An open bascinet over a bearded face, and a long team cape.
        from common import face, cape
        face(F, hair='#4a2c18', beard='#4a2c18', brows='#3a2010')
        lathe('helm', [(0.0, 0.02), (0.095, 0.02), (0.1, 0.05), (0.09, 0.09), (0.05, 0.115), (0.0, 0.12)], steel, head, at=(0, 0.005, HEAD), segs=20, sub=1)
        torus('helmBand', 0.098, 0.008, gold, head, at=(0, 0.005, HEAD + 0.035), segs=20, rsegs=4)
        box('nasal', (0.018, 0.012, 0.07), steel, head, at=(0, -0.093, HEAD + 0.01), bevel=0.004)
        sphere('helmSpike', 0.018, gold, head, at=(0, 0.005, HEAD + 0.135), scale=(1, 1, 1.6))
        cape(F, 'team', w=0.32, h=0.5, trim=GOLD)
        for sx in (-1, 1):
            lathe(f'pauldron{sx}', [(0.0, 0.0), (0.07, 0.0), (0.075, 0.03), (0.0, 0.06)], steel, F['upperarm.R' if sx < 0 else 'upperarm.L'], at=(sx * SH_X * F.bulk * 1.05, 0, SHOULDER - 0.02), scale=(1, 1, 0.8), segs=14, sub=1)
            torus(f'pauldronTrim{sx}', 0.072, 0.007, gold, F['upperarm.R' if sx < 0 else 'upperarm.L'], at=(sx * SH_X * F.bulk * 1.05, 0, SHOULDER - 0.02), segs=14, rsegs=4)
    if kind != 'bearwarden':
        great_helm(F, steel, gold, team, team_d, crest=(kind == 'sentinel'))
    shield_style = 'tower' if kind == 'sentinel' else 'kite'
    weapon = 'hammer' if kind == 'bearwarden' else 'sword'
    _guard_gear(F, shield_style, weapon, steel, gold, team)
    if animate:
        F.animate(attack='slash')
    return F


def great_helm(F, steel, gold, team, team_d, crest=False):
    head = F['head']
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
    # Plume: a sweep of team feathers from the crown of the helm (a tall gold-rooted crest for a Sentinel).
    n = 8 if crest else 6
    for i in range(n):
        t = i / (n - 1)
        sz = 1.3 if crest else 1.0
        sphere(f'plume{i}', (0.04 - t * 0.012) * sz, team if i % 2 == 0 else team_d, head,
               at=(0, 0.015 + t * 0.13 * sz, HEAD + 0.14 * sz - t * t * 0.13), scale=(0.65, 1.7, 1), rot=(0.4 + t * 0.6, 0, 0), sub=1)
    if crest:
        extrude('helmCrown', crown_outline(0.09, 0.07), 0.016, gold, head, at=(0, -0.09, HEAD + 0.09), bevel=0.003)


def tower_outline(w, h):
    """A tall shield, straight sides and a round top, flat bottom with cut corners."""
    pts = [(-w / 2 + 0.03, 0.0), (w / 2 - 0.03, 0.0), (w / 2, 0.04)]
    for i in range(9):
        a = math.pi * i / 8
        pts.append((math.cos(a) * w / 2, h - w / 2 + math.sin(a) * w / 2))
    pts.append((-w / 2, 0.04))
    return pts


def _guard_gear(F, shield_style, weapon, steel, gold, team):
    # Shield on the left forearm: gold rim, team face, crown, boss.
    fa = F['forearm.L']
    sx = SH_X * F.bulk * 1.05 + 0.03
    sz = SHOULDER - WRIST_DROP + 0.07
    yaw = -0.55  # turned to face forward-left
    def on(dx, dy, dz):
        # A point on the shield (dx across, dy out from its face, dz up) in world space.
        c, sn = math.cos(yaw), math.sin(yaw)
        return (sx + dx * c - dy * sn, -0.075 + dx * sn + dy * c, sz + dz)
    if shield_style == 'tower':
        # A tall tower shield, banded in steel, that covers the Sentinel from shin to chin.
        base = on(0, 0, -0.2)
        extrude('shieldRim', tower_outline(0.34, 0.66), 0.035, gold, fa, at=base, rot=(0, 0, yaw), bevel=0.01)
        extrude('shieldFace', tower_outline(0.3, 0.61), 0.04, team, fa, at=on(0, -0.006, -0.18), rot=(0, 0, yaw), bevel=0.006)
        for i, dz in enumerate((-0.08, 0.18)):
            extrude(f'shieldBand{i}', [(-0.15, 0.0), (0.15, 0.0), (0.15, 0.025), (-0.15, 0.025)], 0.02, steel, fa, at=on(0, -0.03, dz), rot=(0, 0, yaw), bevel=0.003)
        extrude('shieldCrown', crown_outline(0.14, 0.1), 0.02, gold, fa, at=on(0, -0.035, 0.03), rot=(0, 0, yaw), bevel=0.004)
        sphere('shieldGem', 0.015, mat('glow', '#6aa8ff'), fa, at=on(0, -0.045, 0.06))
    else:
        extrude('shieldRim', kite_outline(0.34, 0.48), 0.035, gold, fa, at=on(0, 0, 0), rot=(0, 0, yaw), bevel=0.01)
        extrude('shieldFace', kite_outline(0.3, 0.43), 0.04, team, fa, at=on(0, -0.006, 0.004), rot=(0, 0, yaw), bevel=0.006)
        extrude('shieldCrown', crown_outline(0.11, 0.08), 0.02, gold, fa, at=on(0, -0.03, 0.03), rot=(0, 0, yaw), bevel=0.004)
        sphere('shieldGem', 0.012, mat('glow', '#6aa8ff'), fa, at=on(0, -0.04, 0.05))
        extrude('shieldChevron', [(-0.1, 0.0), (0.0, -0.09), (0.1, 0.0), (0.1, 0.025), (0.0, -0.065), (-0.1, 0.025)], 0.02, gold, fa, at=on(0, -0.03, -0.04), rot=(0, 0, yaw), bevel=0.003)
    # Arming sword (or a war hammer) in the right fist, pointing forward and up.
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
    if weapon == 'hammer':
        tube('haft', 0.016, 0.016, 0.5, mat('matte', LEATHER_D), hd, at=along(-0.08), rot=(-(math.pi / 2 - tilt), 0, 0), segs=8)
        for i in range(3):
            tube(f'haftBand{i}', 0.018, 0.018, 0.025, gold, hd, at=along(0.08 + i * 0.12), rot=(-(math.pi / 2 - tilt), 0, 0), segs=8, caps=False)
        top = along(0.42)
        box('hammerHead', (0.075, 0.075, 0.2), steel, hd, at=top, rot=(tilt + math.pi / 2, 0, math.pi / 2), bevel=0.012, sub=1)
        for sx in (-1, 1):
            box(f'hammerFace{sx}', (0.09, 0.09, 0.02), mat('gold', '#c99a3a'), hd, at=(top[0] + sx * 0.1, top[1], top[2]), rot=(0, math.pi / 2, 0), bevel=0.006)
        lathe('hammerSpike', [(0.025, 0.0), (0.0, 0.09)], steel, hd, at=along(0.47), rot=(math.pi / 2 + tilt, 0, 0) if False else (-(math.pi / 2 - tilt), 0, 0), segs=6)
        return
    blade = [(0.0, 0.0), (0.028, 0.0), (0.024, 0.32), (0.0, 0.38), (-0.024, 0.32), (-0.028, 0.0)]
    b = extrude('blade', [(x, z) for x, z in blade], 0.012, mat('metal', '#e4e9f0'), hd, at=along(0.055), rot=(-(math.pi / 2 - tilt) - math.pi / 2 + math.pi, 0, 0), bevel=0.004)


# ---- the rest of the Crown --------------------------------------------------------------
from common import (cloth_legs, torso, cloth_arms, face, hood, cape, tabard, crown_emblem, sword as c_sword, staff, make_bow, quiver,
                    hand_at, arm_x, held, WOOD, WOOD_D)
from blib import pivot, key, clip
import beasts as BS

CREAM = '#efe2c2'


def laborer():
    F = Figure(bulk=1.22)
    cloth_legs(F, pants='team', boots=LEATHER_D) if False else cloth_legs(F, pants='#3a5aa8', boots=LEATHER_D, boot_top=LEATHER)
    # Team overalls: the trousers and a bib over a cream shirt.
    for s in 'RL':
        for o in ('thigh', 'calf'):
            pass
    torso(F, CREAM, belt=LEATHER, buckle=GOLD, belly=0.03)
    sheet('apron', 0.2, 0.3, mat('team'), F['chest'], at=(0, -0.122, 0.66), bend=0.03, flare=0.25, cols=6, rows=6, thick=0.01)
    for sx in (-1, 1):
        box(f'strap{sx}', (0.025, 0.012, 0.18), mat('team_dark'), F['chest'], at=(sx * 0.07, -0.1, 0.68), rot=(0.25, 0, -sx * 0.1))
        sphere(f'strapButton{sx}', 0.01, mat('gold', GOLD), F['chest'], at=(sx * 0.07, -0.14, 0.64))
    cloth_arms(F, CREAM, rolled=True)
    face(F, hair='#6a4022', beard='#6a4022', brows='#5a3418')
    # Straw hat: wide brim, a band.
    h = F['head']
    lathe('hatBrim', [(0.0, 0.0), (0.2, 0.0), (0.21, 0.012), (0.0, 0.014)], mat('matte', '#e0b85a'), h, at=(0, 0, HEAD + 0.06), segs=20, sub=1)
    lathe('hatCrown', [(0.1, 0.0), (0.095, 0.05), (0.07, 0.085), (0.0, 0.09)], mat('matte', '#e7c468'), h, at=(0, 0, HEAD + 0.06), segs=16, sub=1)
    torus('hatBand', 0.099, 0.01, mat('matte', '#8a4a2a'), h, at=(0, 0, HEAD + 0.075), segs=16, rsegs=4)
    # Pouch, and the tool in the right hand with a head for each job.
    box('pouch', (0.06, 0.04, 0.07), mat('matte', LEATHER), F['spine'], at=(0.11, -0.08, 0.49), bevel=0.012, sub=1)
    hd, (hx, hy, hz) = held(F, 'R')
    tilt = 0.4
    def along(d):
        return (hx, hy - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    tube('handle', 0.015, 0.015, 0.42, mat('matte', WOOD), hd, at=along(-0.08), rot=(math.pi / 2 + tilt - math.pi, 0, 0) if False else (-(math.pi / 2 - tilt), 0, 0), segs=8)
    tip = along(0.32)
    pk = pivot('pick', hd, tip)
    lathe('pickHead', [(0.0, -0.16), (0.02, -0.12), (0.03, 0.0), (0.02, 0.12), (0.0, 0.16)], mat('metal', '#9aa3ae'), pk, at=tip, rot=(0, math.pi / 2, 0), segs=6, sub=1)
    ax = pivot('axe', hd, tip)
    extrude('axeHead', [(0, -0.03), (0.11, -0.07), (0.13, 0.0), (0.11, 0.07), (0, 0.03)], 0.02, mat('metal', '#b8c0ca'), ax, at=(tip[0] - 0.01, tip[1], tip[2]), rot=(0, 0, math.pi / 2), bevel=0.005)
    hm = pivot('hammer', hd, tip)
    box('hammerHead', (0.08, 0.16, 0.08), mat('metal', '#767c86'), hm, at=tip, rot=(-tilt, 0, 0), bevel=0.015, sub=1)
    # What it carries on its back: a sack of gold, or logs.
    sk = pivot('sack', F['chest'], (0, 0.16, 0.6))
    sphere('sackBody', 0.1, mat('matte', '#a8844c'), sk, at=(0, 0.17, 0.6), scale=(1, 0.85, 1.1), sub=1)
    torus('sackTie', 0.035, 0.01, mat('matte', LEATHER_D), sk, at=(0, 0.17, 0.71), segs=10, rsegs=3)
    for i in range(4):
        sphere(f'nugget{i}', 0.028, mat('gold', '#ffd34a'), sk, at=(-0.04 + i * 0.027, 0.15 + (i % 2) * 0.03, 0.73 + (i % 2) * 0.01), sub=0)
    for i in range(3):
        lg = pivot(f'log{i}', F['chest'], (0, 0.18, 0.55 + i * 0.08))
        tube(f'logBody{i}', 0.042, 0.042, 0.36, mat('matte', '#8a5a32' if i % 2 else '#a26e3c'), lg, at=(-0.18, 0.18, 0.55 + i * 0.075), rot=(0, math.pi / 2, 0), segs=10)
    F.animate(attack='slash', work=True)
    return F


def archer():
    F = Figure(bulk=1.05)
    cloth_legs(F, pants='#4a3a2a', boots=LEATHER_D, boot_top=LEATHER)
    torso(F, '#7a5434', belt=LEATHER_D, buckle=GOLD)
    sheet('jerkin', 0.2, 0.28, mat('matte', CREAM), F['chest'], at=(0, -0.118, 0.7), bend=0.03, flare=0.3, cols=6, rows=6, thick=0.008)
    crown_emblem(F['chest'], (0, -0.132, 0.58), 0.06)
    cloth_arms(F, CREAM, glove=LEATHER_D, bracer=LEATHER)
    face(F, hair='#5a3a22', brows='#4a2a18')
    hood(F, 'team', tall=0.06, trim=GOLD)
    cape(F, 'team', w=0.26, h=0.36, trim=GOLD)
    quiver(F)
    make_bow(F, 0.68)
    F.animate(attack='bow')
    return F


def cleric():
    F = Figure(bulk=1.05)
    cloth_legs(F, pants=CREAM, boots=LEATHER)
    torso(F, CREAM, belt=GOLD, buckle=GOLD, robe=CREAM)
    sheet('stole', 0.1, 0.42, mat('team'), F['chest'], at=(0, -0.12, 0.74), bend=0.01, flare=0.1, cols=3, rows=6, thick=0.008)
    crown_emblem(F['chest'], (0, -0.134, 0.48), 0.05)
    cloth_arms(F, CREAM, glove=None)
    face(F, hair='#c89a5a', brows='#a87a3a', hair_style='cap')
    hood(F, '#f4ecd6', tall=0.0, trim=GOLD)
    hd, top = staff(F, 0.9, wood='#d8a640')
    sphere('staffKnob', 0.03, mat('gold', GOLD), hd, at=top)
    torus('sunRing', 0.06, 0.01, mat('gold', GOLD), hd, at=(top[0], top[1], top[2] + 0.07), rot=(math.pi / 2, 0, 0), segs=16, rsegs=4)
    for i in range(8):
        a = 2 * math.pi * i / 8
        box(f'ray{i}', (0.012, 0.01, 0.045), mat('gold', GOLD), hd, at=(top[0] + math.cos(a) * 0.085, top[1], top[2] + 0.07 + math.sin(a) * 0.085), rot=(0, -a + math.pi / 2, 0))
    sphere('staffLight', 0.035, mat('glow', '#c8ff8a'), hd, at=(top[0], top[1], top[2] + 0.07), sub=1)
    F.animate(attack='staff', cast=True)
    return F


def marshal():
    F = Figure(bulk=1.32)
    armoured_legs(F)
    hips, ch = F['hips'], F['chest']
    lathe('skirt', [(0.17, 0.0), (0.145, 0.07), (0.13, 0.13)], mat('metal', MAIL), hips, at=(0, 0, HIP - 0.1), segs=18, sub=1)
    torus('belt', 0.14, 0.018, mat('matte', LEATHER), F['spine'], at=(0, 0, 0.515), scale=(1, 0.88, 1), segs=20, rsegs=5)
    box('buckle', (0.06, 0.016, 0.05), mat('gold', GOLD), F['spine'], at=(0, -0.125, 0.515), bevel=0.008)
    lathe('breastplate', [(0.0, 0.0), (0.14, 0.0), (0.165, 0.05), (0.175, 0.12), (0.165, 0.18), (0.12, 0.225), (0.0, 0.235)], mat('metal', STEEL), ch, at=(0, 0, 0.53), scale=(1, 0.82, 1), segs=20, sub=1)
    for i, z in enumerate((0.6, 0.66)):
        torus(f'chestTrim{i}', 0.165, 0.006, mat('gold', GOLD), ch, at=(0, 0, z), scale=(1, 0.82, 1), segs=22, rsegs=4)
    tabard(F, emblem=lambda p, at: crown_emblem(p, at, 0.1), w=0.2, h=0.36)
    sphere('chestGem', 0.014, mat('glow', '#6aa8ff'), ch, at=(0, -0.152, 0.6))
    armoured_arm(F, 'R')
    armoured_arm(F, 'L')
    # A long team cape with a gold border.
    cape(F, 'team', w=0.38, h=0.55, trim=GOLD)
    face(F, hair='#7a4a22', beard='#7a4a22', brows='#6a3a1a', size=1.05)
    h = F['head']
    extrude('crownBand', crown_outline(0.0, 0.0), 0.01, mat('gold', GOLD), h) if False else None
    lathe('crown', [(0.085, 0.0), (0.088, 0.03), (0.09, 0.035)], mat('gold', GOLD), h, at=(0, 0.005, HEAD + 0.055), segs=20, sub=0)
    for i in range(6):
        a = 2 * math.pi * i / 6
        lathe(f'crownPoint{i}', [(0.016, 0.0), (0.01, 0.03), (0.0, 0.05)], mat('gold', GOLD), h, at=(math.cos(a) * 0.087, 0.005 + math.sin(a) * 0.087, HEAD + 0.09), segs=6)
        sphere(f'crownGem{i}', 0.008, mat('glow', '#6aa8ff' if i % 2 else '#ff5a5a'), h, at=(math.cos(a) * 0.09, 0.005 + math.sin(a) * 0.09, HEAD + 0.073))
    # Kite shield and the great warhammer.
    fa = F['forearm.L']
    sx = SH_X * F.bulk * 1.05 + 0.03
    sz = SHOULDER - WRIST_DROP + 0.07
    yaw = -0.55
    def on(dx, dy, dz):
        c, sn = math.cos(yaw), math.sin(yaw)
        return (sx + dx * c - dy * sn, -0.075 + dx * sn + dy * c, sz + dz)
    extrude('shieldRim', kite_outline(0.34, 0.48), 0.035, mat('gold', GOLD), fa, at=on(0, 0, 0), rot=(0, 0, yaw), bevel=0.01)
    extrude('shieldFace', kite_outline(0.3, 0.43), 0.04, mat('team'), fa, at=on(0, -0.006, 0.004), rot=(0, 0, yaw), bevel=0.006)
    extrude('shieldCrown', crown_outline(0.12, 0.085), 0.02, mat('gold', GOLD), fa, at=on(0, -0.03, 0.03), rot=(0, 0, yaw), bevel=0.004)
    hd, (hx, hy, hz) = held(F, 'R')
    tilt = 0.75
    def along(d):
        return (hx, hy - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    tube('haft', 0.02, 0.022, 0.58, mat('matte', WOOD_D), hd, at=along(-0.12), rot=(-(math.pi / 2 - tilt), 0, 0), segs=8)
    for i in range(3):
        torus(f'haftBand{i}', 0.023, 0.006, mat('gold', GOLD), hd, at=along(-0.05 + i * 0.16), rot=(tilt + math.pi / 2, 0, 0), segs=10, rsegs=3)
    head_at = along(0.46)
    box('hammerHead', (0.13, 0.24, 0.13), mat('metal', STEEL), hd, at=head_at, rot=(-tilt, 0, 0), bevel=0.025, sub=1)
    box('hammerBand', (0.14, 0.04, 0.14), mat('gold', GOLD), hd, at=head_at, rot=(-tilt, 0, 0), bevel=0.01)
    for sgn in (-1, 1):
        sphere(f'hammerFace{sgn}', 0.05, mat('metal', '#dfe4ea'), hd, at=(head_at[0], head_at[1] + sgn * 0.12 * math.cos(tilt), head_at[2] - sgn * 0.12 * math.sin(tilt)), scale=(1, 0.4, 1))
    F.animate(attack='slash', cast=True)
    return F


def pathfinder():
    F = Figure(bulk=1.18)
    green = '#6a8a3a'
    cloth_legs(F, pants='#4a3a24', boots=LEATHER_D, boot_top=LEATHER, wraps=LEATHER)
    torso(F, '#7a5434', belt=LEATHER_D, buckle=GOLD)
    sheet('tunic', 0.22, 0.32, mat('matte', green), F['chest'], at=(0, -0.12, 0.7), bend=0.03, flare=0.35, cols=6, rows=6, thick=0.008, ragged=0.02, seed=4)
    box('sash', (0.05, 0.012, 0.3), mat('team'), F['chest'], at=(0.02, -0.13, 0.6), rot=(0, 0.0, 0.55))
    cloth_arms(F, '#7a5434', glove=LEATHER_D, bracer=LEATHER)
    face(F, hair='#6a4a2a', beard='#6a4a2a', brows='#5a3a1a')
    hood(F, green, tall=0.12, trim=None)
    cape(F, green, w=0.34, h=0.58, ragged=0.05, seed=9)
    quiver(F, arrows=6)
    make_bow(F, 0.9, wood='#b07a40')
    # A team pennant on the back.
    fl = pivot('flag', F['chest'], (-0.09, 0.15, 0.7))
    tube('flagPole', 0.008, 0.008, 0.45, mat('matte', WOOD_D), fl, at=(-0.09, 0.15, 0.6), segs=5)
    sheet('flagCloth', 0.16, 0.13, mat('team'), fl, at=(-0.09, 0.15, 1.05), rot=(0, 0, math.pi / 2), bend=0.01, cols=3, rows=3, thick=0.004, sub=0)
    F.animate(attack='bow', cast=True)
    return F


def sage():
    F = Figure(bulk=1.12)
    purple = '#6a3a94'
    cloth_legs(F, pants=purple, boots=LEATHER)
    torso(F, purple, belt=GOLD, buckle=GOLD, robe=purple)
    sheet('robeFront', 0.12, 0.44, mat('team'), F['chest'], at=(0, -0.12, 0.72), bend=0.01, flare=0.4, cols=3, rows=6, thick=0.008)
    for i in range(4):
        sphere(f'robeStar{i}', 0.012, mat('gold', GOLD), F['chest'], at=(0, -0.13, 0.66 - i * 0.07))
    cloth_arms(F, purple)
    for s in 'RL':
        lathe(f'sleeveCuff.{s}', [(0.045, 0.0), (0.07, 0.04), (0.075, 0.06)], mat('matte', purple), F[f'forearm.{s}'], at=(arm_x(F, s) * 1.05, -0.005, SHOULDER - WRIST_DROP - 0.01), segs=12, sub=1)
    face(F, hair='#f2efe8', brows='#f2efe8', size=1.0)
    lathe('longBeard', [(0.0, 0.0), (0.04, 0.02), (0.075, 0.12), (0.07, 0.2), (0.0, 0.24)], mat('matte', '#f2efe8'), F['head'], at=(0, -0.055, HEAD - 0.31), scale=(1.05, 0.7, 1), segs=12, sub=1)
    h = F['head']
    lathe('hatBrim', [(0.0, 0.0), (0.24, 0.0), (0.25, 0.01), (0.0, 0.015)], mat('matte', purple), h, at=(0, 0, HEAD + 0.06), segs=22, sub=1)
    lathe('hatCone', [(0.11, 0.0), (0.09, 0.12), (0.05, 0.27), (0.0, 0.4)], mat('matte', purple), h, at=(0, 0.02, HEAD + 0.06), rot=(-0.18, 0, 0), segs=16, sub=1)
    torus('hatBand', 0.108, 0.012, mat('gold', GOLD), h, at=(0, 0, HEAD + 0.08), segs=18, rsegs=4)
    sphere('hatStar', 0.016, mat('glow', '#ffd36a'), h, at=(0, -0.105, HEAD + 0.09))
    hd, top = staff(F, 1.0, wood=WOOD_D)
    lathe('staffClaw', [(0.02, 0.0), (0.05, 0.05), (0.045, 0.1), (0.03, 0.12)], mat('gold', GOLD), hd, at=top, segs=8, sub=1)
    sphere('staffFlame', 0.045, mat('glow', '#ff9a2e'), hd, at=(top[0], top[1], top[2] + 0.13), scale=(1, 1, 1.5), sub=1)
    sphere('staffFlameCore', 0.025, mat('glow', '#fff0a0'), hd, at=(top[0], top[1] - 0.01, top[2] + 0.12), sub=1)
    F.animate(attack='staff', cast=True)
    return F


def lancer():
    B = BS.Beast(length=0.86, leg=0.44, girth=0.19)
    BS.horse(B, coat='#8a5a34', mane='#3a2818', belly='#74482a', armoured=True, barding='team', trim=GOLD)
    F = Figure(bulk=1.08)
    armoured_legs(F)
    ch = F['chest']
    lathe('breastplate', [(0.0, 0.0), (0.128, 0.0), (0.15, 0.05), (0.16, 0.12), (0.15, 0.18), (0.11, 0.225), (0.0, 0.235)], mat('metal', STEEL), ch, at=(0, 0, 0.53), scale=(1, 0.82, 1), segs=20, sub=1)
    tabard(F, emblem=lambda p, at: crown_emblem(p, at, 0.07), w=0.2, h=0.3)
    armoured_arm(F, 'R')
    armoured_arm(F, 'L')
    h = F['head']
    lathe('helm', [(0.0, -0.105), (0.09, -0.105), (0.098, -0.06), (0.1, 0.0), (0.098, 0.05), (0.085, 0.085), (0.05, 0.108), (0.0, 0.115)], mat('metal', STEEL), h, at=(0, 0, HEAD), segs=20, sub=1)
    box('visorDark', (0.15, 0.02, 0.014), mat('matte', '#16120e'), h, at=(0, -0.094, HEAD + 0.012))
    box('helmCross', (0.022, 0.02, 0.15), mat('gold', GOLD), h, at=(0, -0.1, HEAD - 0.01), bevel=0.005)
    for i in range(5):
        t = i / 4
        sphere(f'plume{i}', 0.035 - t * 0.01, mat('team') if i % 2 == 0 else mat('team_dark'), h, at=(0, 0.015 + t * 0.12, HEAD + 0.14 - t * t * 0.12), scale=(0.65, 1.7, 1), rot=(0.4 + t * 0.6, 0, 0), sub=1)
    fa = F['forearm.L']
    sx = SH_X * F.bulk * 1.05 + 0.03
    extrude('shieldRim', kite_outline(0.26, 0.36), 0.03, mat('gold', GOLD), fa, at=(sx, -0.07, SHOULDER - WRIST_DROP + 0.06), rot=(0, 0, -0.55), bevel=0.008)
    extrude('shieldFace', kite_outline(0.22, 0.32), 0.035, mat('team'), fa, at=(sx - 0.003, -0.075, SHOULDER - WRIST_DROP + 0.064), rot=(0, 0, -0.55), bevel=0.005)
    # The lance: couched forward and a little down, striped in the team colour, a pennant near the tip.
    hd, (hx, hy, hz) = held(F, 'R')
    dip = 0.12
    def along(d):
        return (hx, hy - math.cos(dip) * d, hz - math.sin(dip) * d)
    rot = (math.pi / 2 + dip, 0, 0)
    tube('lance', 0.03, 0.022, 1.3, mat('matte', '#e9dcc0'), hd, at=along(-0.3), rot=rot, segs=8)
    for i in range(4):
        tube(f'lanceBand{i}', 0.031, 0.029, 0.08, mat('team'), hd, at=along(0.05 + i * 0.2), rot=rot, segs=8, caps=False)
    lathe('vamplate', [(0.0, 0.0), (0.075, 0.04), (0.03, 0.12)], mat('metal', STEEL), hd, at=along(-0.02), rot=rot, segs=12)
    lathe('lanceTip', [(0.024, 0.0), (0.026, 0.03), (0.0, 0.2)], mat('metal', '#e1e6ee'), hd, at=along(0.99), rot=rot, segs=8)
    p0 = along(0.8)
    sheet('pennant', 0.2, 0.08, mat('team'), hd, at=(p0[0], p0[1], p0[2] + 0.085), rot=(0, 0, math.pi / 2), cols=4, rows=2, thick=0.004, sub=0)
    BS.seat_rider(B, F)
    B.animate(gait='trot', attack='rear')
    F.animate(attack='slash', mounted=True)
    return F


def outrider():
    B = BS.Beast(length=0.8, leg=0.43, girth=0.17)
    BS.horse(B, coat='#b07440', mane='#4a3020', belly='#d49c66', barding='#5d3a1f', trim=None)
    F = Figure(bulk=1.0)
    cloth_legs(F, pants='#4a3a2a', boots=LEATHER_D, boot_top=LEATHER)
    torso(F, '#7a5434', belt=LEATHER_D, buckle=GOLD)
    sheet('vest', 0.2, 0.26, mat('matte', '#e2d2ac'), F['chest'], at=(0, -0.118, 0.7), bend=0.03, flare=0.3, cols=6, rows=6, thick=0.008)
    cloth_arms(F, '#d8c9a4', glove=LEATHER_D)
    face(F, hair='#5a3a22', brows='#4a2a18')
    hood(F, 'team', tall=0.05)
    cape(F, 'team', w=0.24, h=0.3)
    hd, (hx, hy, hz) = held(F, 'R')
    tube('spear', 0.013, 0.015, 1.0, mat('matte', WOOD), hd, at=(hx, hy, hz - 0.25), segs=6)
    lathe('spearTip', [(0.025, 0.0), (0.02, 0.04), (0.0, 0.12)], mat('metal', STEEL), hd, at=(hx, hy, hz + 0.75), segs=6)
    sheet('spearPennant', 0.22, 0.08, mat('team'), hd, at=(hx, hy + 0.0, hz + 0.68), rot=(0, 0, math.pi / 2), cols=4, rows=2, thick=0.004, sub=0)
    BS.seat_rider(B, F)
    B.animate(gait='trot', attack='rear')
    F.animate(attack='slash', mounted=True)
    return F


def mangonel():
    P = {}
    P['root'] = pivot('root')
    P['frame'] = pivot('frame', P['root'], (0, 0, 0.2))
    P['wheel.F'] = pivot('wheel.F', P['frame'], (0, -0.34, 0.17))
    P['wheel.B'] = pivot('wheel.B', P['frame'], (0, 0.34, 0.17))
    P['arm'] = pivot('arm', P['frame'], (0, 0.12, 0.6))
    fr = P['frame']
    wood, woodD, iron = mat('matte', WOOD), mat('matte', WOOD_D), mat('metal', '#6c717a')
    for x in (-1, 1):
        box(f'rail{x}', (0.09, 1.0, 0.09), wood, fr, at=(x * 0.27, 0, 0.25), bevel=0.015, sub=1)
        box(f'upright{x}', (0.08, 0.08, 0.58), woodD, fr, at=(x * 0.2, 0.06, 0.52), rot=(0.25, 0, 0), bevel=0.012, sub=1)
        for z in (-0.42, 0.42):
            box(f'bracket{x}{z}', (0.1, 0.06, 0.1), iron, fr, at=(x * 0.27, z, 0.25), bevel=0.01)
    for y in (0.38, -0.38):
        box(f'cross{y}', (0.62, 0.1, 0.08), wood, fr, at=(0, y, 0.25), bevel=0.015, sub=1)
    box('topBeam', (0.5, 0.1, 0.08), woodD, fr, at=(0, 0.12, 0.8), bevel=0.015, sub=1)
    tube('winch', 0.07, 0.07, 0.48, mat('matte', '#c8a46a'), fr, at=(-0.24, 0.3, 0.4), rot=(0, math.pi / 2, 0), segs=12)
    for i in range(5):
        torus(f'rope{i}', 0.072, 0.008, mat('matte', '#a8844c'), fr, at=(-0.1 + i * 0.05, 0.3, 0.4), rot=(0, math.pi / 2, 0), segs=12, rsegs=3)
    from crown import kite_outline as ko
    extrude('frontShield', ko(0.22, 0.28), 0.04, mat('team'), fr, at=(0, -0.47, 0.42), bevel=0.006)
    crown_emblem(fr, (0, -0.495, 0.42), 0.08)
    for i, (x, y) in enumerate(((0.15, -0.28), (0.07, -0.3), (0.11, -0.22))):
        sphere(f'ammo{i}', 0.07, mat('matte', '#8a8478'), fr, at=(x, y, 0.36), sub=1)
    for wn in ('wheel.F', 'wheel.B'):
        w = P[wn]
        wy = -0.34 if wn == 'wheel.F' else 0.34
        for x in (-1, 1):
            lathe(f'{wn}{x}', [(0.0, -0.03), (0.17, -0.03), (0.18, 0.0), (0.17, 0.03), (0.0, 0.03)], wood, w, at=(x * 0.4, wy, 0.37), rot=(0, math.pi / 2, 0), segs=16)
            torus(f'{wn}tyre{x}', 0.175, 0.012, iron, w, at=(x * 0.4, wy, 0.37), rot=(0, math.pi / 2, 0), segs=20, rsegs=4)
            for k in range(4):
                box(f'{wn}spoke{x}{k}', (0.03, 0.02, 0.32), woodD, w, at=(x * 0.425, wy, 0.37), rot=(k * math.pi / 4, 0, 0))
        tube(f'{wn}axle', 0.03, 0.03, 0.86, woodD, w, at=(-0.43, wy, 0.37), rot=(0, math.pi / 2, 0), segs=8)
    am = P['arm']
    box('throwArm', (0.07, 0.95, 0.07), wood, am, at=(0, 0.12 + 0.32, 0.8), bevel=0.015, sub=1)
    lathe('bucket', [(0.02, 0.0), (0.12, 0.03), (0.13, 0.09)], woodD, am, at=(0, 0.12 + 0.78, 0.82), segs=12, sub=1)
    sphere('boulder', 0.1, mat('matte', '#8a8478'), am, at=(0, 0.12 + 0.78, 0.9), sub=1)
    objs = list(P.values())
    rest = {n: tuple(o.rotation_euler) for n, o in P.items()}
    am.rotation_euler = (0.25, 0, 0)
    rest['arm'] = (0.25, 0, 0)
    def r(n, f, dx=0.0):
        x, y, z = rest[n]
        key(P[n], f, rot=(x + dx, y, z))
    def idle():
        # The arm creaks a little against its ropes.
        for f, k in ((1, 0.0), (31, 1.0), (61, 0.0)):
            r('arm', f, dx=0.04 * k)
    clip('idle', objs, 61, idle)
    def walk():
        for i, f in enumerate((1, 7, 13, 19, 25)):
            for wn in ('wheel.F', 'wheel.B'):
                r(wn, f, dx=-i * math.pi / 2)
            r('frame', f, dx=0.015 * math.sin(i * math.pi / 2))
    clip('walk', objs, 25, walk)
    def strike():
        for f, k in ((1, 0.0), (18, 0.25), (21, -2.0), (24, -2.1), (30, 0.0)):
            r('arm', f, dx=k if k <= 0 else k)
            r('frame', f, dx=0.04 * (1 if k < -1 else 0))
    clip('attack', objs, 30, strike)
    return P
