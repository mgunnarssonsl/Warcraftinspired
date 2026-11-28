"""Neutral creeps (sheet 04).

Brigand: a burly bearded cutthroat in a knotted red bandana and a ragged red mantle, a
leather vest crossed by belts with big iron buckles, patched baggy trousers, heavy boots,
a chipped cleaver and a battered plank shield with an iron rim.
Poacher: a hard-faced red-braided huntress in a ragged moss-green hooded cloak and leather
armour, a quiver of arrows, a bear trap at the belt, and a recurve bow.
Chief: a big grey-bearded warlord in a horned helm, a thick fur mantle with gold discs, a
ragged red cape, a dark tunic with a great gold buckle, a heavy chipped broadsword and a
huge iron-rimmed plank shield scored by claws.
Brute: a hulking one-eyed bog troll, its spotted hide matted with moss and mushrooms, a
fanged maw, rope bands on its arms, a belt of rope and tusks, a ragged loincloth, and a
mossy log club.
Dire wolf: a hulking dark grey wolf with a spiky mane and a pale underside, snarling."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import cloth_legs, face, hand_at, arm_x, held, LEATHER, LEATHER_D
import crown as CR
import archer as AR
import bowman as BW
import wolf as WF
from bear import fur

IRON = '#6c717a'
BRASS = '#b8913f'


def heater_shield(F, w=0.34, h=0.46, wood='#8a5432', rim=IRON, stripe='#d8c49a', claws=False):
    """A plank shield on the left forearm: iron rim, planks, rivets, a painted stripe."""
    fa = F['forearm.L']
    sx = SH_X * F.bulk * 1.05 + 0.035
    sz = SHOULDER - WRIST_DROP + 0.06
    yaw = -0.55
    def on(dx, dy, dz):
        c, sn = math.cos(yaw), math.sin(yaw)
        return (sx + dx * c - dy * sn, -0.08 + dx * sn + dy * c, sz + dz)
    extrude('shieldRim', CR.kite_outline(w, h), 0.04, mat('metal', rim), fa, at=on(0, 0, 0), rot=(0, 0, yaw), bevel=0.012)
    extrude('shieldFace', CR.kite_outline(w - 0.05, h - 0.06), 0.046, mat('matte', wood), fa, at=on(0, -0.006, 0.004), rot=(0, 0, yaw), bevel=0.008)
    for i in range(3):
        box(f'plank{i}', (0.006, 0.05, h - 0.12), mat('matte', '#5a3a20'), fa, at=on((i - 1) * (w - 0.05) / 3.2, -0.026, 0.01), rot=(0, 0, yaw))
    for i in range(6):
        a = math.pi * (0.1 + 0.8 * i / 5)
        sphere(f'rivet{i}', 0.012, mat('metal', '#9aa0a8'), fa, at=on(math.cos(a) * (w / 2 - 0.02), -0.03, math.sin(a) * (h * 0.2) + h * 0.12))
    if claws:
        for i in range(3):
            box(f'claw{i}', (0.018, 0.05, 0.22), mat('matte', stripe), fa, at=on(-0.05 + i * 0.05, -0.027, 0.0), rot=(0, 0.5, yaw))
    else:
        box('stripe', (0.06, 0.05, h * 0.8), mat('matte', stripe), fa, at=on(0, -0.026, 0.0), rot=(0, -0.6, yaw))


def cleaver(F, length=0.38, width=0.08, rot=2.55):
    """A broad chipped blade with a rough iron guard, on its own pivot."""
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (rot, 0, 0)
    F.p['weapon'] = w
    tube('grip', 0.017, 0.017, 0.12, mat('matte', LEATHER_D), w, at=(hx, hy, hz - 0.06), segs=8)
    sphere('pommel', 0.025, mat('metal', IRON), w, at=(hx, hy, hz - 0.075), sub=1)
    box('guard', (0.15, 0.03, 0.03), mat('metal', IRON), w, at=(hx, hy, hz + 0.06), bevel=0.008)
    W = width / 2
    blade = [(-W, 0.0), (W, 0.0), (W * 1.15, length * 0.45), (W * 0.9, length * 0.5), (W * 1.2, length * 0.62), (W * 1.1, length * 0.85), (0.0, length), (-W * 0.9, length * 0.8), (-W, length * 0.4), (-W * 0.75, length * 0.36)]
    extrude('blade', blade, 0.016, mat('metal', '#c4cad2'), w, at=(hx, hy + 0.007, hz + 0.07), bevel=0.004)


def brigand():
    F = Figure(bulk=1.25)
    b = F.bulk
    red, red_d = mat('matte', '#9a3a2e'), mat('matte', '#6e2a22')
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    cloth_legs(F, pants='#7a5a3a', boots=LEATHER_D)
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * b * sx
        sh, th = F[f'shin.{s}'], F[f'thigh.{s}']
        lathe(f'boot.{s}', [(0.0, 0.0), (0.06, 0.0), (0.058, 0.09), (0.066, 0.14), (0.0, 0.14)], mat('matte', LEATHER_D), sh, at=(x, -0.004, ANKLE - 0.02), segs=14, sub=1)
        lathe(f'bootCuff.{s}', [(0.066, 0.0), (0.078, 0.025), (0.072, 0.05)], mat('matte', LEATHER), sh, at=(x, -0.004, ANKLE + 0.11), segs=14, sub=1)
        box(f'patch.{s}', (0.05, 0.012, 0.05), mat('matte', '#a08058'), th, at=(x + sx * 0.01, -0.085, (HIP + KNEE) / 2), rot=(0, 0, sx * 0.3), bevel=0.003)
    # A dark shirt, a leather vest, crossed belts with iron buckles, a big belt.
    lathe('shirt', [(0.0, 0.0), (0.13 * b, 0.0), (0.145 * b, 0.07), (0.15 * b, 0.15), (0.14 * b, 0.21), (0.08, 0.245), (0.0, 0.25)], mat('matte', '#3e3a4a'), ch, at=(0, 0, 0.5), scale=(1, 0.84, 1), segs=18, sub=1)
    lathe('vest', [(0.138 * b, 0.0), (0.152 * b, 0.07), (0.158 * b, 0.15), (0.14 * b, 0.2)], mat('matte', '#6a4a2c'), ch, at=(0, 0.0, 0.52), scale=(1, 0.86, 1), segs=18, sub=1, angle=math.pi * 1.6, rot=(0, 0, math.pi * 0.7))
    for sgn in (-1, 1):
        box(f'crossBelt{sgn}', (0.03, 0.014, 0.32), mat('matte', LEATHER_D), ch, at=(sgn * 0.01, -0.14 * b, 0.62), rot=(-0.1, sgn * 0.6, 0), bevel=0.004)
    box('chestBuckle', (0.045, 0.016, 0.04), mat('metal', BRASS), ch, at=(0, -0.15 * b, 0.635), bevel=0.006)
    torus('belt', 0.15 * b, 0.026, mat('matte', LEATHER_D), spine, at=(0, 0, 0.49), scale=(1, 0.86, 1.1), segs=20, rsegs=5)
    box('beltBuckle', (0.075, 0.02, 0.06), mat('metal', BRASS), spine, at=(0, -0.135 * b, 0.49), bevel=0.008)
    box('beltBuckleHole', (0.045, 0.022, 0.03), mat('matte', LEATHER_D), spine, at=(0, -0.14 * b, 0.49), bevel=0.004)
    for sx in (-1, 1):
        box(f'pouch{sx}', (0.07, 0.05, 0.075), mat('matte', LEATHER), spine, at=(sx * 0.13 * b, -0.08, 0.44), rot=(0, 0, sx * 0.4), bevel=0.014, sub=1)
    sheet('skirtRag', 0.26 * b, 0.16, red_d, hips, at=(0, -0.12 * b, HIP + 0.02), bend=0.05, flare=0.3, cols=6, rows=3, thick=0.008, ragged=0.08, seed=11)
    # Arms: rolled sleeves, bare forearms, leather bracers and gloves.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        sphere(f'shoulder.{s}', 0.065 * b, mat('matte', '#3e3a4a'), ua, at=(x, 0, SHOULDER - 0.005), sub=1)
        tube(f'sleeve.{s}', 0.058 * b, 0.054 * b, ELBOW_DROP, mat('matte', '#3e3a4a'), ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=12, sub=1)
        tube(f'fore.{s}', 0.052 * b, 0.046 * b, WRIST_DROP - ELBOW_DROP, mat('matte', '#d8a07a'), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP), segs=12, sub=1)
        lathe(f'bracer.{s}', [(0.05 * b, 0.0), (0.056 * b, 0.04), (0.054 * b, 0.1), (0.048 * b, 0.11)], mat('matte', LEATHER), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.005), segs=12, sub=1)
        hx, hy, hz = hand_at(F, s)
        sphere(f'glove.{s}', 0.045 * b, mat('matte', LEATHER_D), hd, at=(hx, hy, hz), scale=(0.9, 1.05, 1.1), sub=1)
    # Head: a scowl, a thick black beard, the knotted bandana with flying tails.
    face(F, skin='#d8a07a', hair='#2a1e16', beard='#2a1e16', brows='#1a120c', size=1.1)
    lathe('bandana', [(0.0, 0.03), (0.1, 0.02), (0.102, 0.06), (0.065, 0.1), (0.0, 0.112)], mat('matte', '#b03a2e'), h, at=(0, 0, HEAD), segs=16, sub=1)
    sphere('bandanaKnot', 0.025, mat('matte', '#b03a2e'), h, at=(0.06, 0.08, HEAD + 0.06), sub=1)
    for i, (a, ln) in enumerate(((0.4, 0.16), (0.9, 0.13))):
        sheet(f'bandanaTail{i}', 0.045, ln, mat('matte', '#b03a2e'), h, at=(0.07, 0.09, HEAD + 0.06), rot=(0, 0, math.pi + a), bend=0.05, cols=2, rows=4, thick=0.005, ragged=0.05, seed=12 + i)
    # A ragged red mantle over the shoulders and down the back.
    lathe('mantle', [(0.075, 0.03), (0.13 * b, 0.0), (0.16 * b, -0.07), (0.165 * b, -0.12)], red, ch, at=(0, 0, NECK), scale=(1, 0.86, 1), segs=20, sub=1)
    sheet('cape', 0.3 * b, 0.42, red, ch, at=(0, 0.11 * b, NECK - 0.05), bend=0.08, flare=0.4, cols=8, rows=8, thick=0.012, ragged=0.1, seed=13)
    heater_shield(F)
    cleaver(F)
    F.animate(attack='slash')
    return F


def poacher():
    F = Figure(bulk=1.0)
    AR.hooded_body(F, tunic='#6a5038', breeches='#4a3a28', vest='#5a3a20', cape_len=0.6, hair='#b5562a', hood='#6a7a3a', ragged=0.12)
    for sx in (-1, 1):
        curve_tube(f'braid{sx}', [(sx * 0.075, -0.04, HEAD - 0.03), (sx * 0.095, -0.06, HEAD - 0.13), (sx * 0.09, -0.08, HEAD - 0.26)], 0.022, mat('matte', '#b5562a'), F['head'], taper=[1.0, 0.9, 0.55])
    # A bear trap hanging at the right hip.
    sp = F['spine']
    tc = (-0.17, -0.06, 0.38)
    torus('trapRing', 0.06, 0.008, mat('metal', IRON), sp, at=tc, rot=(math.pi / 2, 0, 0.4), segs=16, rsegs=4)
    for i in range(8):
        a = 2 * math.pi * i / 8
        lathe(f'trapTooth{i}', [(0.008, 0.0), (0.0, 0.025)], mat('metal', '#a8aeb6'), sp, at=(tc[0] + math.cos(a) * 0.055, tc[1], tc[2] + math.sin(a) * 0.055), rot=(0, -a - math.pi / 2, 0), segs=4)
    curve_tube('trapChain', [(-0.13, -0.08, 0.48), (-0.16, -0.07, 0.44), (tc[0], tc[1], tc[2] + 0.06)], 0.006, mat('metal', IRON), sp)
    AR.quiver(F, color='#5a3a20', arrows=7)
    BW.make_bow(F, length=0.74, wood='#7a5230', tips='#b8913f')
    BW.bow_clips(F, BW.legs_walk(F))
    return F


def chief():
    F = Figure(bulk=1.4)
    b = F.bulk
    red, gold = mat('matte', '#8a2e26'), mat('gold', '#d4a03a')
    furc = '#d8c4a0'
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    cloth_legs(F, pants='#4a3a30', boots=LEATHER_D)
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * b * sx
        sh = F[f'shin.{s}']
        lathe(f'boot.{s}', [(0.0, 0.0), (0.062, 0.0), (0.06, 0.09), (0.068, 0.15), (0.0, 0.15)], mat('matte', LEATHER_D), sh, at=(x, -0.004, ANKLE - 0.02), segs=14, sub=1)
        fur(f'bootFur.{s}', 0.06, sh, (x, -0.004, ANKLE + 0.13), scale=(1.2, 1.2, 0.5), seed=20 + (sx > 0), color=furc, rough=0.2)
        box(f'greave.{s}', (0.07, 0.03, 0.12), mat('metal', IRON), sh, at=(x, -0.06, (KNEE + ANKLE) / 2 + 0.03), bevel=0.012)
    # A dark tunic, a hanging red tabard, the great gold buckle.
    lathe('tunic', [(0.0, 0.0), (0.13 * b, 0.0), (0.145 * b, 0.07), (0.155 * b, 0.15), (0.145 * b, 0.21), (0.08, 0.245), (0.0, 0.25)], mat('matte', '#3a2e2a'), ch, at=(0, 0, 0.5), scale=(1, 0.84, 1), segs=18, sub=1)
    lathe('tunicSkirt', [(0.17 * b, 0.0), (0.15 * b, 0.12), (0.14 * b, 0.2)], mat('matte', '#3a2e2a'), hips, at=(0, 0, 0.27), scale=(1, 0.88, 1), segs=18, sub=1)
    sheet('tabard', 0.17 * b, 0.26, red, hips, at=(0, -0.14 * b, HIP + 0.02), bend=0.03, flare=0.2, cols=5, rows=7, thick=0.008, ragged=0.08, seed=21)
    for sgn in (-1, 1):
        box(f'crossStrap{sgn}', (0.032, 0.014, 0.3), mat('matte', LEATHER_D), ch, at=(sgn * 0.01, -0.14 * b, 0.63), rot=(-0.1, sgn * 0.55, 0), bevel=0.004)
    torus('belt', 0.15 * b, 0.03, mat('matte', LEATHER_D), spine, at=(0, 0, 0.49), scale=(1, 0.86, 1.1), segs=20, rsegs=5)
    box('beltBuckle', (0.1, 0.024, 0.075), gold, spine, at=(0, -0.135 * b, 0.49), bevel=0.01)
    box('beltBuckleHole', (0.06, 0.026, 0.038), mat('matte', LEATHER_D), spine, at=(0, -0.14 * b, 0.49), bevel=0.004)
    box('pouch', (0.075, 0.05, 0.08), mat('matte', LEATHER), spine, at=(-0.14 * b, -0.07, 0.44), rot=(0, 0, 0.4), bevel=0.014, sub=1)
    # Arms: heavy leather sleeves, iron-studded bracers, gloves.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        tube(f'sleeve.{s}', 0.06 * b, 0.055 * b, ELBOW_DROP, mat('matte', '#4a3a30'), ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=12, sub=1)
        lathe(f'bracer.{s}', [(0.052 * b, 0.0), (0.06 * b, 0.03), (0.058 * b, 0.13), (0.05 * b, 0.15)], mat('matte', LEATHER), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.005), segs=12, sub=1)
        for i in range(3):
            sphere(f'stud{s}{i}', 0.009, mat('metal', '#9aa0a8'), fa, at=(x * 1.05, -0.06 * b, SHOULDER - WRIST_DROP + 0.03 + i * 0.04))
        hx, hy, hz = hand_at(F, s)
        sphere(f'glove.{s}', 0.045 * b * 0.9, mat('matte', LEATHER_D), hd, at=(hx, hy, hz), scale=(0.9, 1.05, 1.1), sub=1)
        # Fur on the shoulders, a gold disc on each.
        fur(f'shoulderFur.{s}', 0.11, ua, (x * 1.05, 0, SHOULDER + 0.02), scale=(1.2, 1.1, 0.8), seed=24 + (s == 'L'), color=furc, rough=0.25)
        lathe(f'disc.{s}', [(0.0, 0.0), (0.05, 0.0), (0.045, 0.012), (0.0, 0.02)], gold, ua, at=(x * 1.05, -0.115, SHOULDER + 0.0), rot=(math.pi / 2, 0, 0), segs=16, sub=1)
        torus(f'discRing.{s}', 0.032, 0.007, mat('matte', '#8a5a20'), ua, at=(x * 1.05, -0.125, SHOULDER + 0.0), rot=(math.pi / 2, 0, 0), segs=14, rsegs=3)
    fur('furMantle', 0.15, ch, (0, 0.05, NECK - 0.06), scale=(1.5, 1.0, 0.42), seed=26, color=furc, rough=0.25)
    sheet('cape', 0.36 * b, 0.55, red, ch, at=(0, 0.12 * b, NECK - 0.06), bend=0.08, flare=0.5, cols=10, rows=10, thick=0.012, ragged=0.12, seed=27)
    # Head: grey hair and a braided grey beard, a horned iron helm.
    face(F, skin='#d8a07a', hair='#7a7470', beard='#8a8480', brows='#5a5450', size=1.1)
    lathe('beardBraid', [(0.0, 0.0), (0.03, 0.03), (0.035, 0.1), (0.0, 0.14)], mat('matte', '#8a8480'), h, at=(0, -0.07, HEAD - 0.24), segs=10, sub=1)
    lathe('helm', [(0.0, -0.02), (0.104, -0.02), (0.108, 0.035), (0.08, 0.09), (0.0, 0.115)], mat('metal', '#8a9098'), h, at=(0, 0, HEAD + 0.02), segs=18, sub=1)
    torus('helmBand', 0.105, 0.012, mat('metal', '#6a7078'), h, at=(0, 0, HEAD + 0.01), segs=18, rsegs=4)
    box('noseGuard', (0.022, 0.018, 0.09), mat('metal', '#8a9098'), h, at=(0, -0.1, HEAD - 0.01), bevel=0.004)
    for sx in (-1, 1):
        curve_tube(f'horn{sx}', [(sx * 0.095, 0.0, HEAD + 0.06), (sx * 0.19, -0.01, HEAD + 0.09), (sx * 0.24, -0.04, HEAD + 0.2), (sx * 0.21, -0.06, HEAD + 0.28)], 0.032, mat('matte', '#e2d0a6'), h, taper=[1.0, 0.85, 0.5, 0.15])
    heater_shield(F, w=0.44, h=0.6, wood='#7a4a2a', stripe='#e0d0b0', claws=True)
    cleaver(F, length=0.5, width=0.1)
    F.animate(attack='slash')
    return F


def brute():
    F = Figure(bulk=2.0)
    b = F.bulk
    hide, hide_d, spot = mat('matte', '#9a9a6a'), mat('matte', '#7a7a50'), mat('matte', '#7a5a3a')
    moss, moss_d = mat('matte', '#6f9a34'), mat('matte', '#4c7424')
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    # Thick short legs and big clawed feet.
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.085 * b * sx
        lump(f'thigh.{s}', 0.1, hide, F[f'thigh.{s}'], at=(x, 0, (HIP + KNEE) / 2 + 0.02), scale=(1.0, 1.0, 1.5), seed=1 + (sx > 0), rough=0.06)
        lump(f'calf.{s}', 0.085, hide, F[f'shin.{s}'], at=(x, 0, (KNEE + ANKLE) / 2), scale=(1.0, 1.0, 1.5), seed=3 + (sx > 0), rough=0.06)
        lump(f'foot.{s}', 0.085, hide_d, F[f'foot.{s}'], at=(x, -0.04, 0.04), scale=(1.1, 1.5, 0.55), seed=5 + (sx > 0), rough=0.06)
        for i in range(3):
            lathe(f'toeClaw.{s}{i}', [(0.016, 0.0), (0.0, 0.035)], mat('matte', '#e8dcc0'), F[f'foot.{s}'], at=(x + (i - 1) * 0.04, -0.15, 0.03), rot=(math.pi / 2, 0, 0), segs=5)
        torus(f'legRope.{s}', 0.085, 0.012, mat('matte', '#8a6a3a'), F[f'shin.{s}'], at=(x, 0, ANKLE + 0.08), segs=12, rsegs=3)
    # A huge round belly with spots, a hunched mossy back.
    lump('belly', 0.25, hide, spine, at=(0, -0.05, 0.54), scale=(1.1, 1.0, 1.0), seed=7, rough=0.05)
    lump('chest', 0.25, hide, ch, at=(0, 0.02, 0.7), scale=(1.25, 0.95, 0.9), seed=8, rough=0.06)
    lump('hump', 0.22, hide_d, ch, at=(0, 0.1, SHOULDER), scale=(1.3, 1.0, 0.8), seed=9, rough=0.06)
    for i in range(9):
        a = i * 2.4
        z = 0.45 + (i % 4) * 0.08
        sphere(f'spot{i}', 0.03 + 0.01 * (i % 3), spot, spine, at=(math.cos(a) * 0.2, -0.17 - 0.03 * math.sin(a) ** 2, z), scale=(1, 0.3, 0.8))
    for i in range(7):
        a = math.pi * (0.2 + 0.6 * i / 6)
        lump(f'backMoss{i}', 0.1, moss if i % 2 else moss_d, ch, at=(math.cos(a) * 0.22, 0.12 + math.sin(a) * 0.05, SHOULDER + 0.06 + 0.04 * math.sin(a)), scale=(1.3, 1.1, 0.5), seed=20 + i, rough=0.3)
    # Rope belt with tusks, a ragged loincloth.
    torus('belt', 0.215, 0.022, mat('matte', '#a07a42'), spine, at=(0, -0.04, 0.4), scale=(1.12, 1.05, 1), segs=20, rsegs=4)
    for i in range(5):
        a = -math.pi / 2 + (i - 2) * 0.35
        lathe(f'beltTusk{i}', [(0.016, 0.0), (0.01, 0.05), (0.0, 0.09)], mat('matte', '#efe4c8'), spine, at=(math.cos(a) * 0.24, math.sin(a) * 0.226 - 0.04, 0.39), rot=(math.pi - 0.2, 0, 0), segs=6)
    sheet('loincloth', 0.24, 0.22, mat('matte', '#6a4a2c'), hips, at=(0, -0.2, HIP + 0.0), bend=0.04, flare=0.3, cols=5, rows=4, thick=0.01, ragged=0.1, seed=31)
    # Huge arms with rope bands, giant hands.
    for s in 'RL':
        sx = -1 if s == 'R' else 1
        x = arm_x(F, s) * 1.1
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        lump(f'shoulder.{s}', 0.12, hide, ua, at=(x, 0, SHOULDER - 0.01), seed=40 + (sx > 0), rough=0.06)
        lump(f'arm.{s}', 0.09, hide, ua, at=(x, 0, SHOULDER - ELBOW_DROP / 2), scale=(1.0, 1.0, 1.6), seed=42 + (sx > 0), rough=0.05)
        lump(f'fore.{s}', 0.095, hide, fa, at=(x * 1.04, 0, SHOULDER - (ELBOW_DROP + WRIST_DROP) / 2), scale=(1.0, 1.0, 1.5), seed=44 + (sx > 0), rough=0.05)
        for k in range(3):
            torus(f'armRope.{s}{k}', 0.09, 0.011, mat('matte', '#8a6a3a'), fa, at=(x * 1.04, 0, SHOULDER - ELBOW_DROP - 0.03 - k * 0.025), segs=12, rsegs=3)
        lump(f'armMoss.{s}', 0.07, moss, ua, at=(x, 0.03, SHOULDER + 0.07), scale=(1.4, 1.2, 0.4), seed=46 + (sx > 0), rough=0.3)
        hx, hy, hz = hand_at(F, s)
        hx *= 1.1
        lump(f'hand.{s}', 0.085, hide_d, hd, at=(hx, hy, hz - 0.02), scale=(1.0, 1.15, 1.1), seed=48 + (sx > 0), rough=0.06)
    # The head, low and forward: one big yellow eye, a fanged maw, moss hair and mushrooms.
    hz0 = HEAD - 0.03
    lump('head', 0.13, hide, h, at=(0, -0.04, hz0), scale=(1.1, 1.0, 1.0), seed=50, rough=0.05)
    sphere('eye', 0.045, mat('glow', '#ffd84a'), h, at=(0, -0.15, hz0 + 0.04), scale=(1.0, 0.6, 1.0))
    sphere('pupil', 0.016, mat('matte', '#1a140e'), h, at=(0, -0.175, hz0 + 0.04), scale=(0.6, 0.5, 1.4))
    box('brow', (0.12, 0.04, 0.03), hide_d, h, at=(0, -0.14, hz0 + 0.09), rot=(0.3, 0, 0), bevel=0.012, sub=1)
    lump('jaw', 0.09, hide, h, at=(0, -0.1, hz0 - 0.08), scale=(1.3, 1.0, 0.6), seed=51, rough=0.04)
    box('maw', (0.15, 0.03, 0.055), mat('matte', '#4a1a14'), h, at=(0, -0.17, hz0 - 0.05), bevel=0.012)
    for sx in (-1, 1):
        lathe(f'fang{sx}', [(0.014, 0.0), (0.0, 0.045)], mat('matte', '#efe6d0'), h, at=(sx * 0.045, -0.175, hz0 - 0.08), segs=6)
        lathe(f'topFang{sx}', [(0.01, 0.0), (0.0, 0.03)], mat('matte', '#efe6d0'), h, at=(sx * 0.03, -0.18, hz0 - 0.025), rot=(math.pi, 0, 0), segs=6)
    for i in range(6):
        a = math.pi * (0.1 + 0.8 * i / 5)
        curve_tube(f'mossHair{i}', [(math.cos(a) * 0.1, 0.02 + math.sin(a) * 0.04, hz0 + 0.11), (math.cos(a) * 0.14, -0.02 + math.sin(a) * 0.02, hz0 + 0.02), (math.cos(a) * 0.15, -0.05, hz0 - 0.08 - (i % 2) * 0.04)], 0.022, moss if i % 2 else moss_d, h, taper=[1.2, 1.0, 0.4])
    lump('mossCap', 0.11, moss, h, at=(0, 0.0, hz0 + 0.1), scale=(1.3, 1.2, 0.6), seed=52, rough=0.3)
    for i, (x, y, r) in enumerate(((-0.06, 0.02, 0.035), (0.04, 0.05, 0.03), (0.09, -0.02, 0.025), (-0.25, 0.1, 0.03), (0.22, 0.12, 0.028))):
        par = h if i < 3 else ch
        z = hz0 + 0.17 if i < 3 else SHOULDER + 0.13
        tube(f'mushStem{i}', r * 0.35, r * 0.35, r * 0.9, mat('matte', '#efe4c8'), par, at=(x, y, z - r * 0.7), segs=6)
        lathe(f'mushCap{i}', [(0.0, 0.0), (r, 0.0), (r * 0.8, r * 0.4), (0.0, r * 0.6)], mat('matte', '#d8642e'), par, at=(x, y, z), segs=10, sub=1)
    # A mossy log club.
    hd = F['hand.R']
    hx, hy, hz = hand_at(F, 'R')
    hx *= 1.1
    w = pivot('weapon', hd, (hx, hy, hz))
    w.rotation_euler = (0.5, 0, 0)
    F.p['weapon'] = w
    curve_tube('club', [(hx, hy, hz - 0.12), (hx, hy, hz + 0.2), (hx + 0.01, hy, hz + 0.55)], 0.05, mat('matte', '#6a4628'), w, taper=[0.7, 1.0, 1.5])
    lathe('clubEnd', [(0.0, 0.0), (0.072, 0.0), (0.0, 0.006)], mat('matte', '#c8a46a'), w, at=(hx + 0.01, hy, hz + 0.55), segs=12)
    for i in range(3):
        lump(f'clubMoss{i}', 0.045, moss if i % 2 else moss_d, w, at=(hx + 0.03 * (i - 1), hy - 0.03, hz + 0.3 + i * 0.08), scale=(1.2, 1.0, 0.6), seed=60 + i, rough=0.3)
    F.animate(attack='smash', style='heavy')
    return F


def dire_wolf():
    B = WF.nature_wolf(forest=False, coat='#7a7684', coat_d='#4e4b58', coat_l='#ddd2bc')
    g, L, cz = 0.17, 0.96, B.cz
    bm, nk = B['barrel'], B['neck']
    # A spiky dark mane from the ruff along the spine.
    for i in range(9):
        t = i / 8
        par = nk if i < 3 else bm
        fur(f'mane{i}', g * (0.5 - 0.25 * t), par, (0, -L * 0.45 + t * L * 0.75, cz + g * (1.1 - 0.4 * t)), scale=(0.8, 1.2, 1.1), seed=70 + i, color='#4e4b58', rough=0.3)
    B.animate(gait='bound', attack='bite')
    return B
