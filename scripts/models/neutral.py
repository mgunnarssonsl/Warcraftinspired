"""Neutral camp enemies (sheet 04): brigands, poachers, their chief, the brute and wolves."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, lump, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import (cloth_legs, torso, cloth_arms, face, hood, cape, round_shield, sword, make_bow, quiver, hand_at, arm_x, held,
                    LEATHER, LEATHER_D, WOOD, WOOD_D)
import beasts as BS


def brigand():
    F = Figure(bulk=1.18)
    cloth_legs(F, pants='#6a5038', boots=LEATHER_D, boot_top=LEATHER, wraps='#8a7a5a')
    torso(F, '#9a4a3c', belt=LEATHER_D, buckle='#9a8a6a')
    sheet('vest', 0.21, 0.26, mat('matte', '#6e5a40'), F['chest'], at=(0, -0.118, 0.7), bend=0.03, flare=0.3, cols=6, rows=6, thick=0.008, ragged=0.03, seed=3)
    cloth_arms(F, '#9a4a3c', glove=LEATHER_D, bracer=LEATHER, rolled=True)
    face(F, hair='#3a2a1c', beard='#3a2a1c', brows='#2a1a0c')
    h = F['head']
    lathe('bandana', [(0.0, 0.03), (0.092, 0.02), (0.094, 0.06), (0.06, 0.1), (0.0, 0.108)], mat('matte', '#b8392e'), h, at=(0, 0, HEAD), segs=16, sub=1)
    sheet('bandanaTail', 0.05, 0.1, mat('matte', '#b8392e'), h, at=(0, 0.09, HEAD + 0.05), rot=(0, 0, math.pi), cols=2, rows=3, thick=0.004, sub=0)
    box('eyepatch', (0.03, 0.01, 0.026), mat('matte', '#1a140e'), h, at=(-0.032, -0.083, HEAD + 0.012), bevel=0.004)
    cape(F, '#8a3a2e', w=0.28, h=0.32, ragged=0.06, seed=4)
    round_shield(F, '#8a5a32', '#7a7f88', boss='#9a9488', r=0.15)
    sword(F, 0.34, blade='#a9aeb4', guard='#8a8478')
    F.animate(attack='slash')
    return F


def poacher():
    F = Figure(bulk=1.0)
    cloth_legs(F, pants='#5a4a30', boots=LEATHER_D, wraps='#7a6a4a')
    torso(F, '#7a6440', belt=LEATHER_D, buckle='#9a8a6a')
    cloth_arms(F, '#7a6440', glove=LEATHER_D, bracer=LEATHER)
    face(F, hair='#4a3420', beard='#4a3420', brows='#3a2410')
    hood(F, '#7a8a44', tall=0.05)
    cape(F, '#6a7a3a', w=0.28, h=0.4, ragged=0.06, seed=5)
    quiver(F, color='#5a3a20', fletch='#9a9a7a')
    make_bow(F, 0.62, wood='#8a6a40')
    F.animate(attack='bow')
    return F


def chief():
    F = Figure(bulk=1.38)
    cloth_legs(F, pants='#6a5038', boots=LEATHER_D, boot_top='#d8ccb0')
    torso(F, '#7a5038', belt=LEATHER_D, buckle='#c9a046')
    lathe('chestplate', [(0.0, 0.0), (0.13, 0.0), (0.155, 0.06), (0.16, 0.13), (0.12, 0.2), (0.0, 0.21)], mat('metal', '#8a8f98'), F['chest'], at=(0, 0, 0.54), scale=(1, 0.82, 1), segs=18, sub=1)
    sheet('tabard', 0.2, 0.32, mat('matte', '#a8463a'), F['chest'], at=(0, -0.13, 0.66), bend=0.03, flare=0.3, cols=6, rows=6, thick=0.008, ragged=0.04, seed=6)
    cloth_arms(F, '#7a5038', glove=LEATHER_D, bracer='#8a8f98')
    for s in 'RL':
        lump(f'fur.{s}', 0.095, mat('matte', '#d8ccb0'), F[f'upperarm.{s}'], at=(arm_x(F, s) * 1.08, 0, SHOULDER + 0.02), scale=(1.15, 1.0, 0.8), seed=90 + (s == 'L'), rough=0.2)
    lump('furCollar', 0.15, mat('matte', '#d8ccb0'), F['chest'], at=(0, 0.02, NECK - 0.03), scale=(1.3, 1.0, 0.5), seed=93, rough=0.2)
    face(F, beard='#5a4a3a', brows='#3a2a1c')
    h = F['head']
    lathe('helm', [(0.0, -0.02), (0.096, -0.02), (0.1, 0.03), (0.07, 0.085), (0.0, 0.105)], mat('metal', '#8f949c'), h, at=(0, 0, HEAD + 0.02), segs=16, sub=1)
    box('noseGuard', (0.02, 0.016, 0.09), mat('metal', '#8f949c'), h, at=(0, -0.092, HEAD - 0.01), bevel=0.004)
    for sx in (-1, 1):
        curve_tube(f'horn{sx}', [(sx * 0.09, 0.0, HEAD + 0.06), (sx * 0.17, -0.01, HEAD + 0.1), (sx * 0.21, -0.03, HEAD + 0.19)], 0.026, mat('matte', '#e8dcc0'), h, taper=[1.0, 0.7, 0.2])
    cape(F, '#7a2e26', w=0.36, h=0.46, ragged=0.07, seed=7)
    round_shield(F, '#7a5232', '#8a8f98', boss='#c9a046', r=0.19)
    sword(F, 0.48, blade='#b3b8be', guard='#8a8478')
    F.animate(attack='slash')
    return F


def brute():
    F = Figure(bulk=1.8)
    hide = '#97a75a'
    hide_d = '#7a8a46'
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * F.bulk * sx
        tube(f'leg.{s}', 0.085, 0.07, HIP - KNEE + 0.02, mat('matte', hide), F[f'thigh.{s}'], at=(x, 0, KNEE - 0.01), segs=10, sub=1)
        tube(f'shin.{s}', 0.07, 0.075, KNEE - ANKLE + 0.02, mat('matte', hide), F[f'shin.{s}'], at=(x, 0, ANKLE - 0.03), segs=10, sub=1)
        lump(f'foot.{s}', 0.07, mat('matte', hide_d), F[f'foot.{s}'], at=(x, -0.03, 0.04), scale=(1, 1.5, 0.6), seed=100 + sx)
    lathe('loincloth', [(0.15, 0.0), (0.14, 0.08), (0.13, 0.14)], mat('matte', '#6a4a2c'), F['hips'], at=(0, 0, HIP - 0.12), segs=14, sub=1)
    lump('belly', 0.22, mat('matte', '#a8b866'), F['spine'], at=(0, -0.03, 0.58), scale=(1.05, 0.95, 1.0), seed=101, rough=0.06)
    lump('torso', 0.23, mat('matte', hide), F['chest'], at=(0, 0.02, 0.68), scale=(1.2, 0.9, 0.95), seed=102, rough=0.08)
    lump('moss', 0.14, mat('matte', '#5d8a30'), F['chest'], at=(-0.18, 0.04, SHOULDER + 0.06), seed=103, rough=0.25)
    lump('moss2', 0.12, mat('matte', '#4f7a2a'), F['chest'], at=(0.15, 0.06, SHOULDER + 0.08), seed=104, rough=0.25)
    h = F['head']
    lump('head', 0.1, mat('matte', hide), h, at=(0, -0.03, HEAD - 0.04), scale=(1.1, 1.0, 0.95), seed=105, rough=0.08)
    sphere('eye', 0.03, mat('glow', '#ffd84a'), h, at=(0, -0.12, HEAD - 0.02))
    sphere('pupil', 0.012, mat('matte', '#1a140e'), h, at=(0, -0.145, HEAD - 0.02))
    box('brow', (0.1, 0.03, 0.025), mat('matte', hide_d), h, at=(0, -0.11, HEAD + 0.02), bevel=0.01, sub=1)
    for sx in (-1, 1):
        lathe(f'tusk{sx}', [(0.012, 0.0), (0.008, 0.03), (0.0, 0.05)], mat('matte', '#efe6d0'), h, at=(sx * 0.04, -0.12, HEAD - 0.09), rot=(0.3, 0, 0), segs=6)
        lathe(f'mushroom{sx}', [(0.03, 0.0), (0.025, 0.015), (0.0, 0.025)], mat('matte', '#d26a3a'), h, at=(sx * 0.04, -0.02, HEAD + 0.06), segs=8)
    for s in 'RL':
        x = arm_x(F, s)
        lump(f'shoulder.{s}', 0.1, mat('matte', hide), F[f'upperarm.{s}'], at=(x, 0, SHOULDER), seed=106 + (s == 'L'))
        tube(f'arm.{s}', 0.075, 0.065, ELBOW_DROP, mat('matte', hide), F[f'upperarm.{s}'], at=(x, 0, SHOULDER - ELBOW_DROP), segs=10, sub=1)
        tube(f'fore.{s}', 0.068, 0.06, WRIST_DROP - ELBOW_DROP, mat('matte', hide), F[f'forearm.{s}'], at=(x * 1.05, 0, SHOULDER - WRIST_DROP), segs=10, sub=1)
        torus(f'cuff.{s}', 0.065, 0.015, mat('matte', LEATHER_D), F[f'forearm.{s}'], at=(x * 1.05, 0, SHOULDER - WRIST_DROP + 0.03), segs=12, rsegs=4)
        hx, hy, hz = hand_at(F, s)
        lump(f'fist.{s}', 0.07, mat('matte', hide_d), F[f'hand.{s}'], at=(hx, hy, hz - 0.02), seed=108 + (s == 'L'))
    hd, (hx, hy, hz) = held(F, 'R')
    tilt = 0.6
    def along(d):
        return (hx, hy - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    curve_tube('club', [along(-0.08), along(0.2), along(0.45)], 0.045, mat('matte', '#6a4628'), hd, taper=[0.7, 1.0, 1.6])
    lump('clubMoss', 0.06, mat('matte', '#5d8a30'), hd, at=along(0.42), seed=110, rough=0.3)
    F.animate(attack='slash')
    return F


def wolf():
    B = BS.Beast(length=0.6, leg=0.27, girth=0.13)
    BS.canine(B, coat='#8a8a92', belly='#cfcbc2', ruff='#6f6f78')
    B.animate(gait='bound', attack='bite')
    return B
