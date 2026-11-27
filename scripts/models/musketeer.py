"""Crown Musketeer (sheet 16), modelled after the painting: a wide-brimmed hat with a
great white plume, long curled hair and moustache, a steel breastplate over a long
blue coat with gold edging and crowns on its flared skirts, turned-back cuffs, tall
cuffed boots, a powder horn and pouch, and a walnut flintlock held in both hands.

The musket is a prop on its own pivot; for every pose the arms are solved (see
figure.solve_arm) so both hands stay on it: carried at the ready, shouldered to
aim and fire (recoil at 70%), stood on its butt to reload with the ramrod, and
aimed down on one knee (Take Aim)."""
import math
from mathutils import Vector
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, pivot, key, clip, curve_tube, lump
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD, solve_arm, place_prop, _update
from common import cloth_legs, face, hand_at, arm_x, crown_outline, GOLD, LEATHER, LEATHER_D

STEEL = '#a9b3c0'
BRASS = '#d1a24a'
WALNUT = '#7a4524'
WALNUT_D = '#5a3018'
CREAM = '#efe6d2'
BREECHES = '#6b5038'
BOOT = '#5a3a22'
BOOT_L = '#7a5232'
HAIR = '#2e1d12'
GAP = 0.32 * math.pi  # the open front of the coat skirt


def body(F):
    team, team_d, gold = mat('team'), mat('team_dark'), mat('gold', GOLD)
    b = F.bulk
    hips, spine, ch, h = F['hips'], F['spine'], F['chest'], F['head']
    # Breeches and tall boots with a turned-down cuff.
    cloth_legs(F, pants=BREECHES, boots=BOOT)
    for s, sx in (('R', -1), ('L', 1)):
        x = 0.075 * b * sx
        sh = F[f'shin.{s}']
        lathe(f'bootShaft.{s}', [(0.0, 0.0), (0.056, 0.0), (0.054, 0.08), (0.058, 0.15), (0.0, 0.15)], mat('matte', BOOT), sh, at=(x, -0.004, ANKLE + 0.0), segs=14, sub=1)
        lathe(f'bootCuff.{s}', [(0.058, 0.0), (0.074, 0.02), (0.078, 0.065), (0.06, 0.07)], mat('matte', BOOT_L), sh, at=(x, -0.004, ANKLE + 0.13), segs=14, sub=1)
        box(f'bootSole.{s}', (0.085 * b, 0.17, 0.02), mat('matte', '#3a2414'), F[f'foot.{s}'], at=(x, -0.04, 0.01), bevel=0.008)
    # Torso: the coat body, a steel breastplate with brass rivets, a falling collar.
    lathe('coatBody', [(0.0, 0.0), (0.125 * b, 0.0), (0.138 * b, 0.07), (0.15 * b, 0.15), (0.145 * b, 0.2), (0.1, 0.24), (0.0, 0.25)], team, ch, at=(0, 0.01, 0.5), scale=(1, 0.82, 1), segs=20, sub=1)
    lathe('cuirass', [(0.12 * b, 0.0), (0.142 * b, 0.06), (0.152 * b, 0.13), (0.142 * b, 0.19), (0.105, 0.225)], mat('metal', STEEL), ch, at=(0, -0.004, 0.52), scale=(1, 0.84, 1), segs=20, sub=1, angle=math.pi * 0.95, rot=(0, 0, math.pi * 1.025))
    box('cuirassRidge', (0.012, 0.012, 0.2), mat('metal', '#c8d0da'), ch, at=(0, -0.13 * b, 0.62), rot=(-0.12, 0, 0), bevel=0.004)
    for i in range(5):
        a = math.pi * (1.15 + 0.175 * i)
        sphere(f'rivet{i}', 0.008, mat('gold', BRASS), ch, at=(math.cos(a) * 0.147 * b, math.sin(a) * 0.123 * b, 0.565))
    lathe('collar', [(0.05, 0.02), (0.1, 0.0), (0.14, -0.035), (0.142, -0.045)], mat('matte', CREAM), ch, at=(0, 0, NECK - 0.01), scale=(1, 0.88, 1), segs=18, sub=1)
    # Belt, buckle, pouch on the right hip, powder horn on the left.
    torus('belt', 0.133 * b, 0.018, mat('matte', LEATHER_D), spine, at=(0, 0, 0.515), scale=(1, 0.86, 1), segs=22, rsegs=5)
    box('buckle', (0.05, 0.016, 0.042), mat('gold', BRASS), spine, at=(0, -0.118 * b, 0.515), bevel=0.006)
    box('pouch', (0.075, 0.045, 0.07), mat('matte', LEATHER), spine, at=(-0.12 * b, -0.06, 0.47), rot=(0, 0, 0.4), bevel=0.014, sub=1)
    box('pouchFlap', (0.078, 0.048, 0.03), mat('matte', LEATHER_D), spine, at=(-0.12 * b, -0.062, 0.495), rot=(0, 0, 0.4), bevel=0.01, sub=1)
    curve_tube('powderHorn', [(0.13 * b, -0.07, 0.49), (0.155 * b, -0.04, 0.42), (0.14 * b, 0.02, 0.37), (0.11 * b, 0.05, 0.36)], 0.03, mat('matte', '#efe2c2'), spine, taper=[1.0, 0.85, 0.55, 0.25])
    torus('hornCap', 0.03, 0.008, mat('gold', BRASS), spine, at=(0.13 * b, -0.07, 0.49), rot=(0.6, 0.4, 0), segs=12, rsegs=4)
    # Bandolier from the left shoulder to the right hip, with charges.
    for side, y in ((-1, -0.128 * b), (1, 0.12 * b)):
        box(f'bandolier{side}', (0.038, 0.012, 0.44), mat('matte', LEATHER), ch, at=(0.0, y, 0.6), rot=(0, 0.62, 0))
    for i in range(4):
        t = (i - 1.5) * 0.065
        cx, cz = t * 0.58, 0.6 + t * 0.81
        lathe(f'charge{i}', [(0.0, 0.0), (0.013, 0.0), (0.013, 0.04), (0.0, 0.046)], mat('matte', '#3a2a1a'), ch, at=(cx, -0.142 * b, cz - 0.03), segs=8)
        sphere(f'chargeCap{i}', 0.007, mat('gold', BRASS), ch, at=(cx, -0.142 * b, cz + 0.018))
    # The long coat's skirts: flared, open at the front, gold-hemmed, a crown on each panel.
    prof = [(0.235 * b, 0.0), (0.215 * b, 0.1), (0.185 * b, 0.23), (0.15 * b, 0.36)]
    rot_gap = (0, 0, -math.pi / 2 + GAP / 2)
    lathe('skirt', prof, team, hips, at=(0, 0.01, 0.14), scale=(1, 0.86, 1), segs=26, sub=1, angle=2 * math.pi - GAP, rot=rot_gap)
    lathe('skirtLining', [(r - 0.006, z) for r, z in prof], team_d, hips, at=(0, 0.01, 0.14), scale=(1, 0.86, 1), segs=26, sub=1, angle=2 * math.pi - GAP, rot=rot_gap)
    lathe('skirtHem', [(0.252 * b, 0.0), (0.248 * b, 0.03)], gold, hips, at=(0, 0.01, 0.138), scale=(1, 0.86, 1), segs=26, angle=2 * math.pi - GAP, rot=rot_gap)
    for sgn in (-1, 1):
        a = -math.pi / 2 + sgn * GAP / 2
        # The gold front edge, from waist to hem, following the flare.
        p0 = (math.cos(a) * 0.15 * b, 0.01 + math.sin(a) * 0.15 * b * 0.86, 0.5)
        pm = (math.cos(a) * 0.205 * b, 0.01 + math.sin(a) * 0.205 * b * 0.86, 0.3)
        p1 = (math.cos(a) * 0.252 * b, 0.01 + math.sin(a) * 0.252 * b * 0.86, 0.14)
        curve_tube(f'skirtEdge{sgn}', [p0, pm, p1], 0.009, gold, hips)
        # A crown on each front panel, facing out.
        ac = -math.pi / 2 + sgn * (GAP / 2 + 0.38)
        extrude(f'skirtCrown{sgn}', crown_outline(0.06, 0.044), 0.01, gold, hips, at=(math.cos(ac) * 0.245 * b, 0.01 + math.sin(ac) * 0.245 * b * 0.86 - 0.004, 0.18), rot=(0, 0, ac + math.pi / 2), bevel=0.002)
    for sgn in (-1, 1):
        ac = math.pi / 2 + sgn * 0.75
        extrude(f'backCrown{sgn}', crown_outline(0.055, 0.04), 0.01, gold, hips, at=(math.cos(ac) * 0.245 * b, 0.01 + math.sin(ac) * 0.245 * b * 0.86 + 0.004, 0.18), rot=(0, 0, ac + math.pi / 2), bevel=0.002)
    # Coat front edges up the chest, gold.
    for sx in (-1, 1):
        box(f'coatEdge{sx}', (0.014, 0.012, 0.22), gold, ch, at=(sx * 0.105 * b, -0.112 * b, 0.6), rot=(0, sx * 0.1, 0), bevel=0.004)
    # Arms: puffed team shoulders with gold trim, sleeves, wide turned-back cuffs, cream ruffles, gloves.
    for s in 'RL':
        x = arm_x(F, s)
        ua, fa, hd = F[f'upperarm.{s}'], F[f'forearm.{s}'], F[f'hand.{s}']
        sphere(f'shoulderPuff.{s}', 0.068 * b, team, ua, at=(x * 1.02, 0, SHOULDER - 0.01), scale=(1.0, 1.0, 0.9), sub=1)
        torus(f'shoulderTrim.{s}', 0.058 * b, 0.009, gold, ua, at=(x * 1.04, 0, SHOULDER - 0.05), segs=16, rsegs=4)
        tube(f'sleeve.{s}', 0.054 * b, 0.048 * b, ELBOW_DROP, team, ua, at=(x, 0, SHOULDER - ELBOW_DROP), segs=12, sub=1)
        tube(f'foreSleeve.{s}', 0.048 * b, 0.044 * b, WRIST_DROP - ELBOW_DROP - 0.05, team, fa, at=(x * 1.04, -0.005, SHOULDER - WRIST_DROP + 0.05), segs=12, sub=1)
        lathe(f'cuff.{s}', [(0.05 * b, 0.0), (0.07 * b, 0.015), (0.074 * b, 0.075), (0.06 * b, 0.08)], team_d, fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.02), segs=14, sub=1)
        torus(f'cuffTrim.{s}', 0.073 * b, 0.007, gold, fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.095), segs=16, rsegs=4)
        lathe(f'ruffle.{s}', [(0.03, 0.0), (0.056, 0.012), (0.05, 0.03)], mat('matte', CREAM), fa, at=(x * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.0), segs=12, sub=1)
        hx, hy, hz = hand_at(F, s)
        sphere(f'glove.{s}', 0.042 * b, mat('matte', LEATHER), hd, at=(hx, hy, hz), scale=(0.9, 1.05, 1.15), sub=1)
        sphere(f'thumb.{s}', 0.018 * b, mat('matte', LEATHER), hd, at=(hx - 0.022 * (1 if s == 'L' else -1), hy - 0.032, hz + 0.012))
    # Head: long dark curls, a curled moustache and a goatee, under the hat.
    face(F, hair=HAIR, brows='#24160c', size=1.08, hair_style='long')
    for sx in (-1, 1):
        for i in range(3):
            lump(f'curl{sx}{i}', 0.032, mat('matte', HAIR), h, at=(sx * 0.088, 0.02 + i * 0.022, HEAD - 0.06 - i * 0.035), scale=(0.8, 1.0, 1.2), seed=70 + i + (sx > 0) * 5, rough=0.2)
        curve_tube(f'moustache{sx}', [(0, -0.094, HEAD - 0.03), (sx * 0.03, -0.092, HEAD - 0.035), (sx * 0.055, -0.08, HEAD - 0.025), (sx * 0.065, -0.07, HEAD - 0.005)], 0.009, mat('matte', HAIR), h, taper=[1.0, 1.0, 0.7, 0.35])
    lathe('goatee', [(0.0, 0.0), (0.018, 0.012), (0.012, 0.04), (0.0, 0.05)], mat('matte', HAIR), h, at=(0, -0.075, HEAD - 0.14), segs=10, sub=1)
    hat(F)


def hat(F):
    h = F['head']
    team_d = mat('team_dark')
    hp = pivot('hat', h, (0, 0.0, HEAD + 0.07))
    hp.rotation_euler = (-0.1, 0.12, 0)
    # A wide, softly drooping brim and a round crown with a gold band.
    lathe('hatBrim', [(0.0, 0.012), (0.1, 0.012), (0.17, 0.004), (0.215, -0.018), (0.222, -0.012), (0.17, 0.014), (0.1, 0.02), (0.0, 0.02)], team_d, hp, at=(0, 0, HEAD + 0.07), segs=28, sub=1)
    lathe('hatCrown', [(0.0, 0.0), (0.098, 0.0), (0.1, 0.05), (0.092, 0.095), (0.06, 0.12), (0.0, 0.125)], team_d, hp, at=(0, 0, HEAD + 0.075), segs=22, sub=1)
    torus('hatBand', 0.1, 0.012, mat('gold', GOLD), hp, at=(0, 0, HEAD + 0.09), segs=22, rsegs=5)
    box('hatBuckle', (0.03, 0.012, 0.03), mat('gold', BRASS), hp, at=(0.06, -0.08, HEAD + 0.09), rot=(0, 0, -0.6), bevel=0.004)
    # The great plume: overlapping flat fronds along a spine that sweeps back over the brim.
    spine = [(0.07, -0.05, HEAD + 0.11), (0.12, 0.0, HEAD + 0.21), (0.11, 0.1, HEAD + 0.25), (0.06, 0.2, HEAD + 0.2), (0.02, 0.26, HEAD + 0.12)]
    curve_tube('plumeSpine', spine, 0.03, mat('matte', '#f6f1e6'), hp, taper=[0.6, 1.0, 0.9, 0.6, 0.25])
    n = 16
    for i in range(n):
        t = i / (n - 1)
        seg = t * (len(spine) - 1)
        k = min(int(seg), len(spine) - 2)
        f = seg - k
        p = [spine[k][j] * (1 - f) + spine[k + 1][j] * f for j in range(3)]
        q = spine[k + 1]
        d = Vector(q) - Vector(spine[k])
        pitch = math.atan2(d.z, -d.y if abs(d.y) > 1e-6 else 1e-6)
        size = 0.05 * (1 - 0.55 * t) + 0.012
        for side in (-1, 1):
            sphere(f'frond{i}{side}', size * 1.15, mat('matte', '#f6f1e6'), hp,
                   at=(p[0] + side * size * 0.45, p[1], p[2] - size * 0.2), scale=(1.0, 0.45, 0.5), rot=(pitch, 0, side * 0.6), sub=1)
    # A team feather alongside.
    for i in range(7):
        t = i / 6
        sphere(f'teamFeather{i}', 0.03 * (1 - 0.5 * t) + 0.01, mat('team'), hp, at=(0.045 + 0.03 * t, -0.02 + 0.14 * t, HEAD + 0.14 + 0.05 * math.sin(t * 3)), scale=(0.8, 0.35, 0.6), rot=(0.6 + t, 0, 0.3), sub=1)
    F.p['hat'] = hp


def musket(F, grip):
    """The flintlock on its own pivot, built pointing -Y from the grip (the wrist of the stock)."""
    gx, gy, gz = grip
    g = pivot('gun', F['chest'], grip)
    walnut, brass, steel = mat('matte', WALNUT), mat('gold', BRASS), mat('metal', '#5b616b')
    def at(dy, dz=0.0, dx=0.0):
        return (gx + dx, gy - dy, gz + dz)
    # Butt stock: a curved, flaring butt behind the grip, a brass butt plate.
    curve_tube('buttStock', [at(-0.02, 0.0), at(-0.1, -0.02), at(-0.18, -0.045), at(-0.24, -0.06)], 0.022, walnut, g, taper=[0.8, 1.0, 1.35, 1.6])
    box('buttPlate', (0.032, 0.02, 0.085), brass, g, at=at(-0.25, -0.065), rot=(0.25, 0, 0), bevel=0.006)
    extrude('stockInlay', [(-0.025, 0.0), (0.025, 0.0), (0.02, 0.012), (-0.02, 0.012)], 0.004, brass, g, at=(gx + 0.022, gy + 0.15, gz - 0.035), rot=(0, 0, math.pi / 2), bevel=0.001)
    # Fore-stock under the barrel.
    box('foreStock', (0.034, 0.42, 0.032), walnut, g, at=at(0.22, -0.012), bevel=0.01, sub=1, taper=(0.85, 0.95))
    # Lock, frizzen, cock, trigger guard.
    box('lockPlate', (0.012, 0.08, 0.034), mat('metal', '#9aa2ad'), g, at=at(0.03, 0.0, -0.021), bevel=0.004)
    box('cock', (0.01, 0.02, 0.04), steel, g, at=at(0.0, 0.03, -0.024), rot=(-0.4, 0, 0), bevel=0.003)
    torus('triggerGuard', 0.024, 0.005, brass, g, at=at(0.0, -0.035), rot=(0, math.pi / 2, 0), segs=12, rsegs=4)
    # The barrel, brass bands, muzzle and front sight.
    tube('barrel', 0.0145, 0.013, 0.6, steel, g, at=at(0.02, 0.012), rot=(math.pi / 2, 0, 0), segs=12)
    for i, d in enumerate((0.16, 0.3, 0.42)):
        tube(f'band{i}', 0.019, 0.019, 0.022, brass, g, at=at(d, 0.0), rot=(math.pi / 2, 0, 0), segs=12, caps=False)
    tube('muzzle', 0.017, 0.017, 0.02, steel, g, at=at(0.6, 0.012), rot=(math.pi / 2, 0, 0), segs=12)
    box('sight', (0.006, 0.01, 0.012), brass, g, at=at(0.58, 0.03), bevel=0.002)
    tube('ramrod', 0.004, 0.004, 0.5, mat('matte', '#b89060'), g, at=at(0.08, -0.03), rot=(math.pi / 2, 0, 0), segs=5)
    F.p['gun'] = g
    return g


# ---- poses --------------------------------------------------------------------------

def pose(F, base, **kw):
    """Apply a pose: pivot rotations (absolute), hips height, then the gun and both hands.
    kw: hips_z, rots {pivot: euler}, grip (world), aim (direction), left_at (distance along
    the barrel for the left hand), right (world point for the right hand, else the grip).
    Returns the full set of absolute rotations and the gun's transform."""
    P = F.p
    for n, o in P.items():
        o.rotation_euler = base[n][1]
        o.location = base[n][0]
    P['hips'].location.z = HIP + kw.get('hips_z', 0.0)
    for n, r in kw.get('rots', {}).items():
        P[n].rotation_euler = r
    _update()
    loc, rot = place_prop(P['gun'], P['chest'], kw['grip'], kw['aim'])
    d = Vector(kw['aim']).normalized()
    right = kw.get('right', kw['grip'])
    left = Vector(kw['grip']) + d * kw.get('left_at', 0.3) + Vector((0, 0, -0.025))
    out = {n: tuple(o.rotation_euler) for n, o in P.items()}
    for s, tgt, start in (('R', right, (-0.4, 0.0, 0.0, -1.0)), ('L', left, (-0.9, 0.0, -0.3, -0.9))):
        sol, _ = solve_arm(F, s, tgt, start=start)
        out.update(sol)
    _update()
    return {'rot': out, 'gun_loc': loc, 'hips_z': kw.get('hips_z', 0.0)}


def keypose(F, frame, p):
    P = F.p
    for n, r in p['rot'].items():
        key(P[n], frame, rot=r)
    key(P['gun'], frame, loc=p['gun_loc'])
    key(P['hips'], frame, loc=(P['hips'].location.x, P['hips'].location.y, HIP + p['hips_z']))


def blend(a, b, t):
    """A pose part-way from a to b (rotations and positions interpolated)."""
    rot = {n: tuple(x * (1 - t) + y * t for x, y in zip(a['rot'][n], b['rot'][n])) for n in a['rot']}
    return {'rot': rot, 'gun_loc': tuple(x * (1 - t) + y * t for x, y in zip(a['gun_loc'], b['gun_loc'])), 'hips_z': a['hips_z'] * (1 - t) + b['hips_z'] * t}


def musketeer():
    F = Figure(bulk=1.1)
    body(F)
    b = F.bulk
    # Build the gun at a neutral grip in front of the right hip; poses place it.
    musket(F, (-0.08, -0.16, 0.5))
    P = F.p
    base = {n: (o.location.copy(), o.rotation_euler.copy()) for n, o in P.items()}
    # Carry: at the ready across the body, muzzle forward, up and to the left.
    carry = pose(F, base, grip=(-0.09, -0.15, 0.46), aim=(0.6, -0.72, 0.28), left_at=0.32)
    # Shouldered: stock in the right shoulder, cheek on the stock, barrel level.
    aim_rots = {'chest': (0.05, 0, -0.22), 'head': (0.12, 0, 0.12), 'neck': (0.05, 0, 0.0)}
    aim = pose(F, base, rots=aim_rots, grip=(-0.04, -0.2, SHOULDER - 0.07), aim=(0.06, -1, 0.0), left_at=0.3)
    kick = pose(F, base, rots={**aim_rots, 'chest': (0.14, 0, -0.26), 'head': (0.0, 0, 0.12)}, grip=(-0.04, -0.17, SHOULDER - 0.05), aim=(0.06, -1, 0.22), left_at=0.3)
    # Reloading: butt on the ground beside the left foot, the right hand rams at the muzzle.
    rl_rots = {'chest': (0.18, 0, 0.15), 'head': (0.3, 0, 0.1)}
    reload_up = pose(F, base, rots=rl_rots, grip=(0.07, -0.16, 0.22), aim=(0.0, -0.12, 1.0), left_at=0.22, right=(0.07, -0.2, 0.86))
    reload_dn = pose(F, base, rots=rl_rots, grip=(0.07, -0.16, 0.22), aim=(0.0, -0.12, 1.0), left_at=0.22, right=(0.07, -0.19, 0.72))
    # Kneeling aim (Take Aim): down on the left knee, right foot forward.
    kneel_legs = {'thigh.R': (-1.45, 0, 0), 'shin.R': (1.4, 0, 0), 'foot.R': (0.05, 0, 0), 'thigh.L': (0.3, 0, 0), 'shin.L': (1.75, 0, 0), 'foot.L': (-0.55, 0, 0)}
    kneel = pose(F, base, hips_z=-0.17, rots={**aim_rots, **kneel_legs, 'chest': (0.18, 0, -0.22)}, grip=(-0.04, -0.22, SHOULDER - 0.07 - 0.19), aim=(0.06, -1, 0.0), left_at=0.3)
    # Rest pose for the model is the carry.
    for n, r in carry['rot'].items():
        P[n].rotation_euler = r
    P['gun'].location = carry['gun_loc']
    _update()
    objs = list(P.values())

    def legs_walk(f, ph):
        s, c = math.sin(ph), math.cos(ph)
        rots = {
            'thigh.L': (-0.5 * s, 0, 0), 'thigh.R': (0.5 * s, 0, 0),
            'shin.L': (0.55 * max(0.0, c) ** 1.5 + 0.05, 0, 0), 'shin.R': (0.55 * max(0.0, -c) ** 1.5 + 0.05, 0, 0),
            'foot.L': (0.2 * s, 0, 0), 'foot.R': (-0.2 * s, 0, 0),
        }
        for n, r in rots.items():
            key(P[n], f, rot=r)

    def idle():
        for f, k in ((1, 0.0), (31, 1.0), (61, 0.0)):
            p = dict(carry)
            rot = dict(carry['rot'])
            x, y, z = rot['chest']
            rot['chest'] = (x - 0.025 * k, y, z)
            hx, hy, hz = rot['head']
            rot['head'] = (hx + 0.04 * k, hy, hz + 0.06 * k)
            keypose(F, f, {**p, 'rot': rot, 'hips_z': -0.004 * k})
    clip('idle', objs, 61, idle)

    def walk():
        n = 24
        for i in range(0, n + 1, 3):
            f = 1 + i
            ph = 2 * math.pi * i / n
            rot = dict(carry['rot'])
            x, y, z = rot['chest']
            rot['chest'] = (x + 0.05, y, z + 0.06 * math.sin(ph))
            keypose(F, f, {**carry, 'rot': rot, 'hips_z': 0.018 * abs(math.cos(ph))})
            legs_walk(f, ph)
    clip('walk', objs, 25, walk)

    def fire():
        # Shoulder the musket (to frame 12), hold the aim, fire at frame 21 (70%): the kick, then settle.
        for f, p in ((1, carry), (6, blend(carry, aim, 0.6)), (12, aim), (20, aim), (22, kick), (25, blend(kick, aim, 0.6)), (30, aim)):
            keypose(F, f, p)
    clip('attack', objs, 30, fire)

    def reloading():
        # Ground the butt, ram twice, bring it back up to the ready.
        for f, p in ((1, aim), (7, reload_up), (12, reload_dn), (17, reload_up), (22, reload_dn), (27, reload_up), (34, blend(reload_up, carry, 0.5)), (40, carry)):
            keypose(F, f, p)
    clip('reload', objs, 40, reloading)

    def take_aim():
        for f, p in ((1, carry), (6, blend(carry, kneel, 0.5)), (11, kneel), (40, kneel)):
            keypose(F, f, p)
    clip('cast', objs, 40, take_aim)
    return F
