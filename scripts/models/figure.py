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

    def animate(self, attack='slash', work=False, cast=False, mounted=False, reload=False, kneel=False):
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
                r('chest', f, dx=-0.025 * k)
                r('head', f, dx=0.03 * k)
                for s in 'RL':
                    r(f'upperarm.{s}', f, dx=-0.03 * k, dy=(0.04 if s == 'L' else -0.04) * k)
                    r(f'forearm.{s}', f, dx=-0.05 * k)
                bob(f, -0.004 * k)
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
                r('thigh.L', f, dx=-0.5 * s)
                r('thigh.R', f, dx=0.5 * s)
                # The knee bends as the leg swings through.
                r('shin.L', f, dx=0.55 * max(0.0, c) ** 1.5 + 0.05)
                r('shin.R', f, dx=0.55 * max(0.0, -c) ** 1.5 + 0.05)
                r('foot.L', f, dx=0.2 * s)
                r('foot.R', f, dx=-0.2 * s)
                r('upperarm.L', f, dx=0.35 * s)
                r('upperarm.R', f, dx=-0.35 * s)
                r('forearm.L', f, dx=-0.15 - 0.15 * max(0, -s))
                r('forearm.R', f, dx=-0.15 - 0.15 * max(0, s))
                r('chest', f, dz=0.08 * s, dx=0.06)
                r('hips', f, dz=-0.06 * s)
                bob(f, 0.018 * abs(c))
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
        clip('attack', moving, 30, {'slash': strike, 'bow': bowshot, 'staff': staff, 'throw': throw, 'musket': musket}[attack])
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
