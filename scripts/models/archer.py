"""Crown Archer (sheet 02): a deep team hood with gold trim over a long flowing cape with a
crowned gold hem, a cream tunic belted under a leather vest crossed by straps, leather
bracers and gloves, pouches, grey-green breeches and tall cuffed boots with knee guards,
a full quiver on the back, and a recurve bow drawn to the cheek (see bowman.py)."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import cloth_legs, face, hand_at, arm_x, crown_outline, GOLD, LEATHER, LEATHER_D
import bowman as BW

CREAM = '#ece0c4'
BREECHES = '#5d6650'
VEST = '#7a4a26'


def hooded_body(F, tunic=CREAM, breeches=BREECHES, vest=VEST, cape_len=0.62, hair='#5a3a22', skin='#eab58a', crown_hem=True):
    team, team_d, gold = mat('team'), mat('team_dark'), mat('gold', GOLD)
    b = F.bulk
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    # Breeches, tall boots with a folded cuff and a knee guard.
    cloth_legs(F, pants=breeches, boots=LEATHER_D)
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * b * sx
        sh = F[f'shin.{s}']
        lathe(f'bootShaft.{s}', [(0.0, 0.0), (0.054, 0.0), (0.052, 0.08), (0.056, 0.15), (0.0, 0.15)], mat('matte', LEATHER_D), sh, at=(x, -0.004, ANKLE), segs=14, sub=1)
        lathe(f'bootCuff.{s}', [(0.056, 0.0), (0.07, 0.02), (0.072, 0.055), (0.058, 0.06)], mat('matte', LEATHER), sh, at=(x, -0.004, ANKLE + 0.12), segs=14, sub=1)
        box(f'kneeGuard.{s}', (0.07, 0.03, 0.08), mat('matte', LEATHER), sh, at=(x, -0.05, KNEE + 0.01), rot=(0.25, 0, 0), bevel=0.014, sub=1)
        torus(f'kneeStrap.{s}', 0.05, 0.007, mat('matte', LEATHER_D), sh, at=(x, -0.005, KNEE + 0.01), segs=12, rsegs=3)
    # Tunic: a cream body and a skirt to mid-thigh, split at the sides.
    lathe('tunic', [(0.0, 0.0), (0.12 * b, 0.0), (0.13 * b, 0.07), (0.142 * b, 0.15), (0.135 * b, 0.21), (0.08, 0.245), (0.0, 0.25)], mat('matte', tunic), ch, at=(0, 0.005, 0.5), scale=(1, 0.82, 1), segs=18, sub=1)
    for sgn, a0 in ((-1, -math.pi * 0.95), (1, math.pi * 0.05)):
        lathe(f'tunicSkirt{sgn}', [(0.16 * b, 0.0), (0.14 * b, 0.12), (0.128 * b, 0.2)], mat('matte', tunic), hips, at=(0, 0.005, 0.27), scale=(1, 0.86, 1), segs=14, angle=math.pi * 0.9, rot=(0, 0, a0), sub=1)
    # Leather vest over the chest, crossed straps, a buckle.
    lathe('vest', [(0.124 * b, 0.0), (0.137 * b, 0.07), (0.148 * b, 0.15), (0.13 * b, 0.2)], mat('matte', vest), ch, at=(0, 0.0, 0.52), scale=(1, 0.84, 1), segs=18, sub=1, angle=math.pi * 0.86, rot=(0, 0, math.pi * 1.07))
    for sgn in (-1, 1):
        box(f'strap{sgn}', (0.022, 0.012, 0.26), mat('matte', LEATHER_D), ch, at=(sgn * 0.01, -0.132 * b, 0.63), rot=(-0.1, sgn * 0.55, 0), bevel=0.003)
    sphere('strapRing', 0.016, gold, ch, at=(0, -0.138 * b, 0.635), scale=(1, 0.5, 1))
    torus('belt', 0.128 * b, 0.017, mat('matte', LEATHER_D), spine, at=(0, 0, 0.5), scale=(1, 0.86, 1), segs=20, rsegs=5)
    box('buckle', (0.04, 0.014, 0.036), gold, spine, at=(0, -0.112 * b, 0.5), bevel=0.005)
    for sx in (-1, 1):
        box(f'pouch{sx}', (0.06, 0.04, 0.065), mat('matte', LEATHER), spine, at=(sx * 0.1 * b, -0.075, 0.46), rot=(0, 0, sx * 0.4), bevel=0.012, sub=1)
    # Arms: cream sleeves, leather bracers with gold studs, gloves.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        sphere(f'shoulder.{s}', 0.056 * b, mat('matte', tunic), ua, at=(x, 0, SHOULDER - 0.005), sub=1)
        tube(f'sleeve.{s}', 0.05 * b, 0.045 * b, ELBOW_DROP, mat('matte', tunic), ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=12, sub=1)
        tube(f'foreSleeve.{s}', 0.045 * b, 0.04 * b, 0.06, mat('matte', tunic), fa, at=(x * 1.04, -0.005, SHOULDER - ELBOW_DROP - 0.06), segs=12, sub=1)
        lathe(f'bracer.{s}', [(0.042 * b, 0.0), (0.05 * b, 0.02), (0.052 * b, 0.09), (0.046 * b, 0.11)], mat('matte', LEATHER), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.005), segs=12, sub=1)
        for i in range(2):
            sphere(f'bracerStud{s}{i}', 0.008, gold, fa, at=(x * 1.05, -0.05, SHOULDER - WRIST_DROP + 0.04 + i * 0.04))
        hx, hy, hz = hand_at(F, s)
        sphere(f'glove.{s}', 0.039 * b, mat('matte', LEATHER_D), hd, at=(hx, hy, hz), scale=(0.9, 1.05, 1.15), sub=1)
    # Head and hood: a young face, the hood deep around it, a mantle over the shoulders.
    face(F, skin=skin, hair=hair, brows='#4a2a18', size=1.04)
    lathe('hood', [(0.0, -0.085), (0.11, -0.08), (0.118, -0.02), (0.113, 0.05), (0.08, 0.105), (0.0, 0.125)], team, h,
          at=(0, 0.014, HEAD), scale=(1.05, 1.1, 1.05), segs=22, sub=1, angle=math.pi * 1.5, rot=(0, 0, -math.pi * 0.25))
    lathe('hoodPoint', [(0.05, 0.0), (0.03, 0.06), (0.0, 0.1)], team, h, at=(0, 0.08, HEAD + 0.07), rot=(1.0, 0, 0), segs=12, sub=1)
    lathe('mantle', [(0.07, 0.03), (0.135 * b, 0.0), (0.185 * b, -0.055), (0.195 * b, -0.08)], team, ch, at=(0, 0, NECK), scale=(1, 0.88, 1), segs=22, sub=1)
    torus('mantleTrim', 0.193 * b, 0.008, gold, ch, at=(0, 0, NECK - 0.078), scale=(1, 0.88, 1), segs=24, rsegs=4)
    sphere('clasp', 0.018, gold, ch, at=(0, -0.12, NECK - 0.03), scale=(1, 0.6, 1), sub=1)
    # The long cape, sweeping out behind, gold hem with crowns.
    sheet('cape', 0.32 * b, cape_len, team, ch, at=(0, 0.11 * b, NECK - 0.04), bend=0.08, flare=0.45, cols=10, rows=12, thick=0.012)
    sheet('capeLining', 0.3 * b, cape_len - 0.02, team_d, ch, at=(0, 0.105 * b, NECK - 0.045), bend=0.08, flare=0.45, cols=10, rows=12, thick=0.006)


def quiver(F, color=LEATHER, arrows=7):
    ch = F['chest']
    lathe('quiver', [(0.0, 0.0), (0.048, 0.0), (0.054, 0.28), (0.06, 0.3), (0.0, 0.3)], mat('matte', color), ch, at=(-0.07, 0.15, 0.46), rot=(-0.3, -0.45, 0), segs=14, sub=1)
    torus('quiverRim', 0.058, 0.008, mat('gold', GOLD), ch, at=(-0.115, 0.2, 0.74), rot=(-0.3, -0.45, 0), segs=14, rsegs=4)
    box('quiverStrap', (0.025, 0.012, 0.44), mat('matte', LEATHER_D), ch, at=(0.0, -0.128 * F.bulk, 0.61), rot=(0, -0.55, 0))
    for i in range(arrows):
        a = i * 0.9
        x, y = -0.12 + math.cos(a) * 0.025, 0.2 + math.sin(a) * 0.02
        tube(f'qArrow{i}', 0.004, 0.004, 0.12, mat('matte', '#c9a46a'), ch, at=(x, y, 0.74), rot=(-0.3, -0.45, 0), segs=4, caps=False)
        box(f'qFletch{i}', (0.014, 0.004, 0.045), mat('matte', '#f2efe6' if i % 3 else '#c8402e'), ch, at=(x - 0.05, y + 0.04, 0.86), rot=(-0.3, -0.45, 0))


def archer():
    F = Figure(bulk=1.06)
    hooded_body(F)
    quiver(F)
    BW.make_bow(F, length=0.74)
    BW.bow_clips(F, BW.legs_walk(F))
    return F
