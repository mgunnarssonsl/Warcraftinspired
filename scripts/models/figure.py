"""The humanoid figure: pivots, a heroic stylised body plan and shared animations.

Heights (Blender units; the game scales the model): feet 0, knees 0.24, hips 0.45,
shoulders 0.72, head centre 0.86. Faces -Y. Right side is -X.
"""
import math
from blib import pivot, key, clip

HIP = 0.45
KNEE = 0.24
ANKLE = 0.07
SHOULDER = 0.715
SH_X = 0.17
ELBOW_DROP = 0.155
WRIST_DROP = 0.3
NECK = 0.775
HEAD = 0.86


class Figure:
    def __init__(self, bulk=1.0):
        b = bulk
        self.bulk = b
        P = {}
        P['root'] = pivot('root')
        P['hips'] = pivot('hips', P['root'], (0, 0, HIP))
        P['spine'] = pivot('spine', P['hips'], (0, 0, 0.52))
        P['chest'] = pivot('chest', P['spine'], (0, 0, 0.62))
        P['neck'] = pivot('neck', P['chest'], (0, 0, NECK))
        P['head'] = pivot('head', P['neck'], (0, 0, HEAD - 0.04))
        for side, x in (('R', -SH_X * b), ('L', SH_X * b)):
            P[f'upperarm.{side}'] = pivot(f'upperarm.{side}', P['chest'], (x, 0, SHOULDER))
            P[f'forearm.{side}'] = pivot(f'forearm.{side}', P[f'upperarm.{side}'], (x * 1.04, 0, SHOULDER - ELBOW_DROP))
            P[f'hand.{side}'] = pivot(f'hand.{side}', P[f'forearm.{side}'], (x * 1.06, -0.01, SHOULDER - WRIST_DROP))
            hx = 0.075 * b * (1 if side == 'L' else -1)
            P[f'thigh.{side}'] = pivot(f'thigh.{side}', P['hips'], (hx, 0, HIP))
            P[f'shin.{side}'] = pivot(f'shin.{side}', P[f'thigh.{side}'], (hx, -0.01, KNEE))
            P[f'foot.{side}'] = pivot(f'foot.{side}', P[f'shin.{side}'], (hx, 0, ANKLE))
        self.p = P
        # Rest pose: arms hang slightly out and forward, elbows soft.
        for side, s in (('R', -1), ('L', 1)):
            P[f'upperarm.{side}'].rotation_euler = (-0.12, s * 0.12, 0)
            P[f'forearm.{side}'].rotation_euler = (-0.35, 0, 0)

    def __getitem__(self, k):
        return self.p[k]

    # ---- animations ----------------------------------------------------------------

    # Gait styles: stride, knee lift, arm swing, twist, bob, forward lean, side roll, breath.
    STYLES = {
        'normal': (0.5, 0.55, 0.35, 0.08, 0.018, 0.06, 0.0, 1.0),
        'heavy': (0.3, 0.35, 0.16, 0.12, 0.045, 0.2, 0.07, 2.2),   # lumbering giants: short stomps, rocking, hunched
        'stout': (0.38, 0.45, 0.3, 0.06, 0.026, 0.03, 0.09, 1.3),  # a waddle
        'robed': (0.34, 0.35, 0.1, 0.04, 0.01, 0.03, 0.0, 0.8),    # small steps, arms quiet
        'light': (0.56, 0.7, 0.42, 0.1, 0.026, 0.18, 0.0, 1.0),    # quick and crouched
    }

    def animate(self, attack='slash', work=False, cast=False, mounted=False, reload=False, kneel=False, base=True, style='normal'):
        stride, knee, swing, twist, lift, lean, roll, breath = self.STYLES[style]
        P = self.p
        moving = list(P.values())
        rest = {n: tuple(o.rotation_euler) for n, o in P.items()}

        def r(name, frame, dx=0.0, dy=0.0, dz=0.0):
            x, y, z = rest[name]
            key(P[name], frame, rot=(x + dx, y + dy, z + dz))

        def bob(frame, dz):
            key(P['hips'], frame, loc=(P['hips'].location.x, P['hips'].location.y, HIP + dz))

        def idle():
            for f, k in ((1, 0), (31, 1), (61, 0)):
                r('chest', f, dx=-0.025 * k * breath + lean * 0.5)
                r('head', f, dx=0.03 * k * breath - lean * 0.4)
                for s in 'RL':
                    r(f'upperarm.{s}', f, dx=-0.03 * k, dy=(0.04 if s == 'L' else -0.04) * k)
                    r(f'forearm.{s}', f, dx=-0.05 * k)
                bob(f, -0.004 * k)
        if base:
            clip('idle', moving, 61, idle)

        def walk():
            if mounted:
                # In the saddle: the rider sways with the gait, legs astride.
                for i in range(0, 19, 3):
                    f = 1 + i
                    ph = 2 * math.pi * i / 18
                    r('chest', f, dx=0.05 * math.sin(ph))
                    r('upperarm.L', f, dx=0.08 * math.sin(ph))
                    r('head', f, dx=-0.04 * math.sin(ph))
                return
            n = 24
            for i in range(0, n + 1, 3):
                f = 1 + i
                ph = 2 * math.pi * i / n
                s = math.sin(ph)
                c = math.cos(ph)
                r('thigh.L', f, dx=-stride * s - lean * 0.3)
                r('thigh.R', f, dx=stride * s - lean * 0.3)
                # The knee bends as the leg swings through.
                r('shin.L', f, dx=knee * max(0.0, c) ** 1.5 + 0.05 + lean * 0.4)
                r('shin.R', f, dx=knee * max(0.0, -c) ** 1.5 + 0.05 + lean * 0.4)
                r('foot.L', f, dx=0.4 * stride * s)
                r('foot.R', f, dx=-0.4 * stride * s)
                r('upperarm.L', f, dx=swing * s, dz=1.4 * roll * abs(s))
                r('upperarm.R', f, dx=-swing * s, dz=-1.4 * roll * abs(s))
                r('forearm.L', f, dx=-0.15 - 0.15 * max(0, -s))
                r('forearm.R', f, dx=-0.15 - 0.15 * max(0, s))
                r('chest', f, dz=twist * s, dx=lean, dy=-roll * s)
                r('hips', f, dz=-0.75 * twist * s, dy=roll * s)
                r('head', f, dx=-lean * 0.6, dy=roll * 0.7 * s)
                # Heavy feet land hard: the body drops on each footfall.
                bob(f, lift * (abs(c) if style != 'heavy' else abs(c) ** 0.4) - (0.03 if style == 'heavy' else 0.0) - lean * 0.05)
        if base:
            clip('walk', moving, 19 if mounted else 25, walk)

        def strike():
            # Wind up overhead (frames 1-20), the blow lands at frame 21 (70%), recover to 30.
            frames = [(1, 0.0), (8, 0.45), (18, 1.0), (21, -0.35), (24, -0.45), (30, 0.0)]
            for f, k in frames:
                up = max(0.0, k)
                down = max(0.0, -k)
                r('upperarm.R', f, dx=-2.5 * up - 0.9 * down, dy=-0.3 * up)
                r('forearm.R', f, dx=-0.9 * up + 0.2 * down)
                r('hand.R', f, dx=0.4 * up - 0.5 * down)
                r('upperarm.L', f, dx=-0.6 * (up + down), dz=0.3 * (up + down))
                r('forearm.L', f, dx=-0.7 * (up + down))
                r('chest', f, dz=0.25 * up - 0.3 * down, dx=-0.08 * up + 0.15 * down)
                r('spine', f, dx=0.06 * down)
                if not mounted:
                    r('thigh.L', f, dx=-0.25 * down)
                    r('shin.L', f, dx=0.2 * down)
                    bob(f, -0.02 * down)
        def smash():
            # Both fists (or the club) heaved overhead, then slammed down in front at frame 21.
            for f, k in ((1, 0.0), (10, 0.7), (18, 1.0), (21, -1.0), (25, -1.0), (30, 0.0)):
                up = max(0.0, k)
                down = max(0.0, -k)
                for s_, sg in (('R', 1), ('L', -1)):
                    r(f'upperarm.{s_}', f, dx=-2.7 * up - 1.0 * down, dz=sg * 0.25 * up)
                    r(f'forearm.{s_}', f, dx=-0.5 * up - 0.3 * down)
                r('chest', f, dx=-0.25 * up + 0.5 * down + lean * 0.5)
                r('spine', f, dx=-0.1 * up + 0.2 * down)
                r('head', f, dx=0.15 * up - 0.3 * down)
                if not mounted:
                    for s_ in 'RL':
                        r(f'thigh.{s_}', f, dx=-0.35 * down)
                        r(f'shin.{s_}', f, dx=0.55 * down)
                    bob(f, 0.02 * up - 0.06 * down)
        def sling():
            # Whirl the sling overhead twice, step in and loose at frame 21.
            frames = [(1, 0.0, 0.0), (4, 1.0, 0.0), (8, 1.0, 1.57), (12, 1.0, 3.14), (16, 1.0, 4.71), (19, 1.0, 6.28), (21, -0.6, 7.0), (25, -0.6, 7.0), (30, 0.0, 6.28)]
            for f, k, spin in frames:
                up = max(0.0, k)
                down = max(0.0, -k)
                r('upperarm.R', f, dx=-2.5 * up - 1.4 * down, dy=-0.3 * up)
                r('forearm.R', f, dx=-0.3 * up)
                r('upperarm.L', f, dx=-0.9 * (up + down), dz=-0.4 * (up + down))
                r('chest', f, dz=0.35 * up - 0.35 * down, dx=0.12 * down)
                if 'sling' in P:
                    key(P['sling'], f, rot=(rest['sling'][0] + spin, rest['sling'][1], rest['sling'][2]))
                if not mounted:
                    r('thigh.L', f, dx=-0.4 * down)
                    r('shin.L', f, dx=0.3 * down)
        def bowshot():
            # Raise the bow, draw (to frame 21), loose, settle.
            frames = [(1, 0.0, 0.0), (8, 1.0, 0.2), (18, 1.0, 1.0), (21, 1.0, 1.0), (23, 1.0, 0.0), (30, 0.0, 0.0)]
            for f, raise_, draw in frames:
                r('upperarm.L', f, dx=-1.45 * raise_, dz=-0.15 * raise_)
                r('forearm.L', f, dx=0.25 * raise_)
                if 'bow' in P:
                    r('bow', f, dx=1.2 * raise_)
                r('upperarm.R', f, dx=-1.3 * raise_ - 0.1 * draw, dz=0.5 * draw)
                r('forearm.R', f, dx=-1.6 * draw - 0.3 * raise_)
                r('chest', f, dz=-0.35 * raise_)
                r('head', f, dz=0.3 * raise_)
        def staff():
            frames = [(1, 0.0, 0.0), (12, 1.0, 0.0), (19, 1.0, 0.0), (22, 0.3, 1.0), (30, 0.0, 0.0)]
            for f, up, thrust in frames:
                r('upperarm.R', f, dx=-2.2 * up - 0.8 * thrust)
                r('forearm.R', f, dx=-0.4 * up)
                r('upperarm.L', f, dx=-1.2 * up, dz=0.4 * up)
                r('forearm.L', f, dx=-0.9 * up)
                r('chest', f, dx=-0.12 * up + 0.12 * thrust)
                r('head', f, dx=-0.15 * up)
        def throw():
            frames = [(1, 0.0), (6, 0.6), (11, 1.0), (16, 0.6), (19, 1.0), (21, -0.5), (30, 0.0)]
            for f, k in frames:
                up = max(0.0, k)
                down = max(0.0, -k)
                r('upperarm.R', f, dx=-2.6 * up - 1.2 * down, dy=-0.6 * up)
                r('forearm.R', f, dx=-0.6 * up)
                r('chest', f, dz=0.3 * up - 0.3 * down)
        def aim_pose(f, k, kick=0.0):
            # Musket to the shoulder: right arm raised forward, left hand under the barrel.
            r('upperarm.R', f, dx=-1.45 * k + 0.25 * kick, dz=0.25 * k)
            r('forearm.R', f, dx=-0.35 * k)
            r('upperarm.L', f, dx=-1.35 * k + 0.2 * kick, dz=-0.55 * k)
            r('forearm.L', f, dx=-0.25 * k)
            r('chest', f, dz=-0.25 * k, dx=0.12 * kick)
            r('head', f, dz=0.18 * k, dx=0.08 * k)
        def musket():
            # Shoulder (to frame 14), steady aim, fire at frame 21 (70%): the recoil kicks, settle.
            for f, k, kick in ((1, 0.0, 0.0), (10, 1.0, 0.0), (20, 1.0, 0.0), (22, 1.0, 1.0), (25, 1.0, 0.4), (30, 0.6, 0.0)):
                aim_pose(f, k, kick)
        if attack:
            clip('attack', moving, 30, {'slash': strike, 'bow': bowshot, 'staff': staff, 'throw': throw, 'musket': musket, 'smash': smash, 'sling': sling}[attack])
        if reload:
            def reloading():
                # Butt down, ramrod: the right arm pumps up and down twice.
                for f, k in ((1, 0.0), (8, 1.0), (14, 0.2), (20, 1.0), (26, 0.2), (34, 0.0), (40, 0.0)):
                    r('upperarm.L', f, dx=-0.7, dz=-0.35)
                    r('forearm.L', f, dx=-0.9)
                    r('upperarm.R', f, dx=-1.9 * k - 0.4, dz=0.2)
                    r('forearm.R', f, dx=-0.6 * k - 0.4)
                    r('head', f, dx=0.25)
                    r('chest', f, dx=0.08)
            clip('reload', moving, 40, reloading)
        if kneel:
            def kneeling():
                # Down on one knee, musket aimed: the Take Aim pose (held while aiming).
                for f, k in ((1, 0.0), (10, 1.0), (40, 1.0)):
                    bob(f, -0.17 * k)
                    r('thigh.R', f, dx=-1.45 * k)
                    r('shin.R', f, dx=1.45 * k)
                    r('foot.R', f, dx=0.05 * k)
                    r('thigh.L', f, dx=0.35 * k)
                    r('shin.L', f, dx=1.75 * k)
                    r('foot.L', f, dx=-0.5 * k)
                    aim_pose(f, k)
            clip('cast', moving, 40, kneeling)

        if work:
            def labour():
                for f, k in ((1, 0.0), (10, 1.0), (14, -0.3), (20, 0.0)):
                    up = max(0.0, k)
                    down = max(0.0, -k)
                    r('upperarm.R', f, dx=-2.4 * up - 0.7 * down)
                    r('upperarm.L', f, dx=-2.2 * up - 0.7 * down, dz=-0.3 * (up + down))
                    r('forearm.R', f, dx=-0.6 * up)
                    r('forearm.L', f, dx=-0.6 * up)
                    r('chest', f, dx=-0.1 * up + 0.25 * down)
            clip('work', moving, 20, labour)
        if cast:
            def spell():
                for f, k in ((1, 0.0), (10, 1.0), (22, 1.0), (30, 0.0)):
                    for s, sg in (('R', -1), ('L', 1)):
                        r(f'upperarm.{s}', f, dx=-2.0 * k, dy=sg * 0.4 * k)
                        r(f'forearm.{s}', f, dx=-0.3 * k)
                    r('head', f, dx=-0.25 * k)
            clip('cast', moving, 30, spell)


# ---- posing helpers: hands that hold things ---------------------------------------------

def _update():
    import bpy
    bpy.context.view_layer.update()


def palm(F, s):
    """Where the palm of hand `s` is now (world space, current pose)."""
    from mathutils import Vector
    from blib import world_pos
    hd = F[f'hand.{s}']
    sx = -1 if s == 'R' else 1
    rest = Vector((SH_X * F.bulk * 1.06 * sx, -0.015, SHOULDER - WRIST_DROP - 0.035))
    return hd.matrix_world @ (rest - world_pos(hd))


def solve_arm(F, s, target, start=None, iters=6):
    """Rotate shoulder and elbow so the palm of hand `s` reaches `target` (world).
    Returns {pivot: euler} for the arm. A small coordinate descent: good enough
    for props held in both hands."""
    from mathutils import Vector, Euler
    target = Vector(target)
    ua, fa = F[f'upperarm.{s}'], F[f'forearm.{s}']
    x = list(start) if start else [ua.rotation_euler.x, ua.rotation_euler.y, ua.rotation_euler.z, fa.rotation_euler.x]

    def err(v):
        ua.rotation_euler = Euler((v[0], v[1], v[2]))
        fa.rotation_euler = Euler((min(0.0, max(-2.6, v[3])), 0, 0))
        _update()
        return (palm(F, s) - target).length

    best = err(x)
    for step in (0.4, 0.2, 0.1, 0.05, 0.025, 0.012)[:iters]:
        improved = True
        while improved:
            improved = False
            for i in range(4):
                for d in (step, -step):
                    y = list(x)
                    y[i] += d
                    e = err(y)
                    if e < best - 1e-6:
                        best, x, improved = e, y, True
    err(x)
    x[3] = min(0.0, max(-2.6, x[3]))
    return {f'upperarm.{s}': (x[0], x[1], x[2]), f'forearm.{s}': (x[3], 0.0, 0.0)}, best


def place_prop(prop, parent, grip, direction, up=(0, 0, 1)):
    """Set a prop pivot (built pointing -Y from its grip, at rest) so its grip is at
    `grip` and it points along `direction` (world), given the parent's current pose."""
    from mathutils import Vector, Matrix
    d = Vector(direction).normalized()
    pm = parent.matrix_world
    local_d = (pm.to_3x3().inverted() @ d).normalized()
    q = local_d.to_track_quat('-Y', 'Z')
    prop.rotation_euler = q.to_euler()
    prop.location = pm.inverted() @ Vector(grip)
    _update()
    return tuple(prop.location), tuple(prop.rotation_euler)
