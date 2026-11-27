"""Four-legged figures (horse, stag, wolf, fox) with optional riders. Faces -Y."""
import math
from blib import mat, sphere, box, lathe, tube, torus, sheet, pivot, key, clip, extrude, curve_tube


class Beast:
    """Pivots: root > barrel > (neck > head), (leg.FL/FR/HL/HR > lower.*), tail, saddle."""

    def __init__(self, length=0.62, leg=0.36, girth=0.15):
        self.L, self.leg, self.g = length, leg, girth
        P = {}
        cy = leg + girth * 0.55
        self.cz = cy
        P['root'] = pivot('root')
        P['barrel'] = pivot('barrel', P['root'], (0, 0, cy))
        P['neck'] = pivot('neck', P['barrel'], (0, -length * 0.42, cy + girth * 0.5))
        P['head'] = pivot('head', P['neck'], (0, -length * 0.55, cy + girth * 1.6))
        P['tail'] = pivot('tail', P['barrel'], (0, length * 0.5, cy + girth * 0.3))
        for k, (x, y) in {'FL': (1, -1), 'FR': (-1, -1), 'HL': (1, 1), 'HR': (-1, 1)}.items():
            px, py = x * girth * 0.55, y * length * 0.36
            P[f'leg.{k}'] = pivot(f'leg.{k}', P['barrel'], (px, py, leg + 0.01))
            P[f'lower.{k}'] = pivot(f'lower.{k}', P[f'leg.{k}'], (px, py + (0.02 if y > 0 else -0.01), leg * 0.5))
        P['saddle'] = pivot('saddle', P['barrel'], (0, 0.02, cy + girth * 0.95))
        self.p = P

    def __getitem__(self, k):
        return self.p[k]

    def legs(self, coat, lower, hoof, feather=None, paws=False):
        L, g = self.leg, self.g
        for k in ('FL', 'FR', 'HL', 'HR'):
            up, lo = self.p[f'leg.{k}'], self.p[f'lower.{k}']
            x = (1 if k in ('FL', 'HL') else -1) * g * 0.55
            y = (-1 if k[0] == 'F' else 1) * self.L * 0.36
            hind = k[0] == 'H'
            tube(f'upperLeg.{k}', g * (0.42 if hind else 0.34), g * 0.22, L * 0.55, mat('matte', coat), up, at=(x, y + (0.02 if hind else 0), L * 0.47), segs=10, sub=1)
            tube(f'lowerLeg.{k}', g * 0.17, g * 0.14, L * 0.47, mat('matte', lower), lo, at=(x, y + (0.02 if hind else -0.01), 0.03), segs=8, sub=1)
            if paws:
                sphere(f'paw.{k}', g * 0.2, mat('matte', hoof), lo, at=(x, y - 0.02, 0.025), scale=(1, 1.4, 0.6), sub=1)
            else:
                lathe(f'hoof.{k}', [(0.0, 0.0), (g * 0.2, 0.0), (g * 0.18, 0.05), (0.0, 0.05)], mat('matte', hoof), lo, at=(x, y - 0.005, 0.0), segs=10)
                if feather:
                    lathe(f'feather.{k}', [(g * 0.15, 0.04), (g * 0.24, 0.06), (g * 0.2, 0.11), (g * 0.14, 0.12)], mat('matte', feather), lo, at=(x, y - 0.005, 0.0), segs=10, sub=1)

    # ---- animation ------------------------------------------------------------------

    def animate(self, gait='trot', attack='rear'):
        P = self.p
        objs = list(P.values())
        rest = {n: tuple(o.rotation_euler) for n, o in P.items()}

        def r(name, f, dx=0.0, dz=0.0):
            x, y, z = rest[name]
            key(P[name], f, rot=(x + dx, y, z + dz))

        def bz(f, dz):
            o = P['barrel']
            key(o, f, loc=(o.location.x, o.location.y, self.cz + dz))

        def idle():
            for f, k in ((1, 0), (31, 1), (61, 0)):
                r('neck', f, dx=0.06 * k)
                r('head', f, dx=-0.08 * k)
                r('tail', f, dz=0.25 * k - 0.12)
                bz(f, -0.004 * k)
        clip('idle', objs, 61, idle)

        def walk():
            n = 18 if gait == 'trot' else 14
            for i in range(0, n + 1, 2):
                f = 1 + i
                ph = 2 * math.pi * i / n
                s, c = math.sin(ph), math.cos(ph)
                # Diagonal pairs together (trot); a bound for the wolf and fox.
                if gait == 'trot':
                    a, b = s, -s
                    r('leg.FL', f, dx=-0.5 * a)
                    r('leg.HR', f, dx=-0.5 * a)
                    r('leg.FR', f, dx=-0.5 * b)
                    r('leg.HL', f, dx=-0.5 * b)
                else:
                    r('leg.FL', f, dx=-0.6 * s)
                    r('leg.FR', f, dx=-0.6 * math.sin(ph + 0.4))
                    r('leg.HL', f, dx=0.6 * s)
                    r('leg.HR', f, dx=0.6 * math.sin(ph + 0.4))
                for k in ('FL', 'FR'):
                    r(f'lower.{k}', f, dx=0.6 * max(0.0, c if k == 'FL' else -c))
                for k in ('HL', 'HR'):
                    r(f'lower.{k}', f, dx=-0.5 * max(0.0, -c if k == 'HL' else c))
                r('barrel', f, dx=0.04 * s)
                r('neck', f, dx=0.08 * c)
                r('tail', f, dz=0.2 * s)
                bz(f, 0.025 * abs(c))
        clip('walk', objs, (18 if gait == 'trot' else 14) + 1, walk)

        def strike():
            if attack == 'rear':
                frames = [(1, 0.0), (12, 1.0), (19, 1.0), (21, -0.3), (30, 0.0)]
                for f, k in frames:
                    up, down = max(0.0, k), max(0.0, -k)
                    r('barrel', f, dx=-0.35 * up + 0.1 * down)
                    r('leg.FL', f, dx=-0.9 * up)
                    r('leg.FR', f, dx=-0.7 * up)
                    r('lower.FL', f, dx=1.0 * up)
                    r('lower.FR', f, dx=0.9 * up)
                    r('neck', f, dx=-0.2 * up + 0.3 * down)
                    bz(f, 0.05 * up)
            else:
                # A lunge and bite.
                frames = [(1, 0.0), (14, 1.0), (21, -1.0), (30, 0.0)]
                for f, k in frames:
                    back, fwd = max(0.0, k), max(0.0, -k)
                    r('barrel', f, dx=0.12 * back - 0.1 * fwd)
                    r('leg.HL', f, dx=0.3 * back - 0.4 * fwd)
                    r('leg.HR', f, dx=0.3 * back - 0.4 * fwd)
                    r('leg.FL', f, dx=-0.6 * fwd)
                    r('leg.FR', f, dx=-0.5 * fwd)
                    r('neck', f, dx=0.25 * back - 0.35 * fwd)
                    r('head', f, dx=-0.2 * fwd)
                    bz(f, -0.02 * back + 0.03 * fwd)
        clip('attack', objs, 30, strike)


def horse(B, coat, mane, hoof='#2a2420', belly=None, feather='#efe6d6', armoured=False, barding=None, trim=None):
    g, L, cz = B.g, B.L, B.cz
    bm = B['barrel']
    belly = belly or coat
    # Barrel, chest and rump.
    sphere('barrelBody', g, mat('matte', coat), bm, at=(0, 0, cz), scale=(0.95, L / (2 * g) * 1.05, 1.0), segs=20, rings=14, sub=1)
    sphere('chest', g * 0.95, mat('matte', coat), bm, at=(0, -L * 0.34, cz + 0.01), scale=(0.95, 0.9, 1.05), sub=1)
    sphere('rump', g * 1.0, mat('matte', coat), bm, at=(0, L * 0.34, cz + 0.02), scale=(1.0, 0.95, 1.0), sub=1)
    nk, hd = B['neck'], B['head']
    tube('neckBody', g * 0.55, g * 0.42, g * 1.6, mat('matte', coat), nk, at=(0, -L * 0.42, cz + g * 0.3), rot=(0.6, 0, 0), segs=12, sub=1)
    box('mane', (0.035, g * 0.4, g * 1.55), mat('matte', mane), nk, at=(0, -L * 0.42 - g * 0.32, cz + g * 1.05), rot=(0.6, 0, 0), bevel=0.012, sub=1)
    hz = cz + g * 1.6
    hy = -L * 0.62
    tube('skull', g * 0.36, g * 0.26, g * 1.1, mat('matte', coat), hd, at=(0, hy + g * 0.1, hz + 0.01), rot=(1.9, 0, 0), segs=12, sub=1)
    sphere('muzzle', g * 0.28, mat('matte', belly), hd, at=(0, hy - g * 0.92, hz - g * 0.35), scale=(0.95, 1.1, 0.9), sub=1)
    for sx in (-1, 1):
        lathe(f'ear{sx}', [(g * 0.09, 0.0), (g * 0.06, g * 0.2), (0.0, g * 0.32)], mat('matte', coat), hd, at=(sx * g * 0.15, hy + g * 0.2, hz + g * 0.25), rot=(0.2, sx * 0.2, 0), segs=6)
        sphere(f'eye{sx}', g * 0.06, mat('matte', '#1a120c'), hd, at=(sx * g * 0.3, hy - g * 0.2, hz + 0.0))
    box('forelock', (0.03, g * 0.25, g * 0.4), mat('matte', mane), hd, at=(0, hy - g * 0.05, hz + g * 0.3), rot=(0.4, 0, 0), bevel=0.01, sub=1)
    tube('tailHair', g * 0.16, g * 0.06, L * 0.6, mat('matte', mane), B['tail'], at=(0, L * 0.5, cz + g * 0.3), rot=(-2.6, 0, 0), segs=8, sub=1)
    B.legs(coat, belly, hoof, feather=feather)
    sd = B['saddle']
    sz = cz + g * 0.95
    box('saddle', (g * 1.1, g * 1.25, 0.05), mat('matte', '#5a3620'), sd, at=(0, 0.02, sz - 0.02), bevel=0.02, sub=1)
    box('saddleBack', (g * 1.0, 0.04, 0.06), mat('matte', '#5a3620'), sd, at=(0, 0.02 + g * 0.6, sz + 0.02), bevel=0.015, sub=1)
    if barding:
        m = mat(barding) if barding.startswith('team') else mat('matte', barding)
        lathe('barding', [(g * 1.02, 0.0), (g * 1.06, g * 0.7), (g * 1.0, g * 1.15)], m, bm, at=(0, 0.0, cz - g * 1.05), scale=(0.98, L / (2 * g) * 0.92, 1), segs=20, sub=1)
        if trim:
            torus('bardingTrim', g * 1.07, 0.01, mat('gold', trim), bm, at=(0, 0, cz - g * 1.03), scale=(0.98, L / (2 * g) * 0.92, 1), segs=24, rsegs=4)
    if armoured:
        lathe('peytral', [(g * 0.85, 0.0), (g * 0.95, g * 0.5), (g * 0.7, g * 0.95)], mat('metal', '#a9b3c0'), bm, at=(0, -L * 0.38, cz - g * 0.55), rot=(math.pi / 2 - 0.3, 0, 0), segs=14, angle=math.pi, sub=1)
        box('chanfron', (g * 0.42, g * 1.0, g * 0.18), mat('metal', '#a9b3c0'), hd, at=(0, hy - g * 0.45, hz + g * 0.08), rot=(-0.33, 0, 0), bevel=0.02, sub=1)
        sphere('chanfronSpike', g * 0.06, mat('gold', '#f0bd4c'), hd, at=(0, hy - g * 0.35, hz + g * 0.25))


def stag(B, coat, belly, antler='#8a6640', ruff='#efe2c6'):
    horse(B, coat, mane=coat, belly=belly, hoof='#3a2a1c', feather=None)
    hd = B['head']
    g, L, cz = B.g, B.L, B.cz
    hz = cz + g * 1.6
    hy = -L * 0.62
    sphere('ruff', g * 0.6, mat('matte', ruff), B['neck'], at=(0, -L * 0.45, cz + g * 0.6), scale=(1.1, 0.9, 1.1), sub=1)
    for sx in (-1, 1):
        # Branching antlers: the stag's silhouette.
        base = (sx * g * 0.2, hy + g * 0.15, hz + g * 0.35)
        tube(f'antler{sx}', 0.014, 0.01, g * 1.3, mat('matte', antler), hd, at=base, rot=(-0.3, sx * 0.55, 0), segs=6)
        for i, (h, ang, ln) in enumerate(((0.45, 0.9, 0.55), (0.75, 0.2, 0.6), (1.0, 1.0, 0.5), (1.15, -0.3, 0.45))):
            px = base[0] + sx * math.sin(0.55) * g * 1.3 * h
            pz = base[2] + math.cos(0.55) * g * 1.3 * h * 0.95
            tube(f'tine{sx}{i}', 0.009, 0.005, g * ln, mat('matte', antler), hd, at=(px, base[1] - 0.02 * h, pz), rot=(-0.6 + ang * 0.3, sx * ang, 0), segs=5)


def canine(B, coat, belly, ruff=None, fox=False):
    g, L, cz = B.g, B.L, B.cz
    bm = B['barrel']
    sphere('barrelBody', g, mat('matte', coat), bm, at=(0, 0, cz), scale=(0.9, L / (2 * g), 0.95), segs=18, rings=12, sub=1)
    sphere('chest', g * 1.05, mat('matte', ruff or coat), bm, at=(0, -L * 0.32, cz + 0.02), scale=(1, 0.95, 1.05), sub=1)
    sphere('belly', g * 0.7, mat('matte', belly), bm, at=(0, -L * 0.1, cz - g * 0.4), scale=(0.9, 1.5, 0.6), sub=1)
    nk, hd = B['neck'], B['head']
    hz = cz + g * 0.75
    hy = -L * 0.62
    sphere('skull', g * 0.62, mat('matte', coat), hd, at=(0, hy, hz), scale=(1, 1.05, 0.95), sub=1)
    lathe('snout', [(g * 0.3, 0.0), (g * 0.2, g * 0.45), (0.01, g * 0.7)], mat('matte', belly), hd, at=(0, hy - g * 0.35, hz - g * 0.15), rot=(math.pi / 2, 0, 0), segs=10, sub=1)
    sphere('nose', g * 0.08, mat('matte', '#1a1412'), hd, at=(0, hy - g * 1.05, hz - g * 0.15))
    for sx in (-1, 1):
        lathe(f'ear{sx}', [(g * 0.18, 0.0), (g * 0.1, g * 0.35), (0.0, g * 0.6 if fox else g * 0.45)], mat('matte', coat), hd, at=(sx * g * 0.33, hy + g * 0.1, hz + g * 0.4), rot=(-0.1, sx * 0.25, 0), segs=6)
        sphere(f'eye{sx}', g * 0.07, mat('glow' if not fox else 'matte', '#ffd24a' if not fox else '#1a1412'), hd, at=(sx * g * 0.26, hy - g * 0.45, hz + g * 0.12))
    if fox:
        tube('tail', g * 0.42, g * 0.2, L * 0.75, mat('matte', coat), B['tail'], at=(0, L * 0.48, cz + g * 0.1), rot=(-2.2, 0, 0), segs=10, sub=1)
        sphere('tailTip', g * 0.25, mat('matte', '#f4ece0'), B['tail'], at=(0, L * 0.48 + L * 0.62, cz - g * 0.35), sub=1)
    else:
        tube('tail', g * 0.25, g * 0.1, L * 0.55, mat('matte', coat), B['tail'], at=(0, L * 0.48, cz + g * 0.1), rot=(-2.4, 0, 0), segs=8, sub=1)
    if ruff:
        sphere('ruff', g * 0.75, mat('matte', ruff), nk, at=(0, -L * 0.45, cz + g * 0.35), scale=(1.1, 0.8, 1.0), sub=1)
    B.legs(coat, belly, '#2a2420', paws=True)


def seat_rider(B, F):
    """Put a humanoid figure in the saddle: its root under the saddle, legs astride."""
    sd = B['saddle']
    F['root'].parent = sd
    from figure import HIP
    F['root'].location = (0, 0.02, -HIP + 0.04)
    for s, sx in (('R', -1), ('L', 1)):
        F[f'thigh.{s}'].rotation_euler = (-1.35, sx * 0.35, 0)
        F[f'shin.{s}'].rotation_euler = (1.5, 0, 0)


def bear(B, coat, muzzle, claw='#3a2e24', eye='#1a120c'):
    """A heavy brown bear: a shoulder hump, a big round head, short legs and paws."""
    g, L, cz = B.g, B.L, B.cz
    bm = B['barrel']
    sphere('barrelBody', g, mat('matte', coat), bm, at=(0, 0.02, cz), scale=(1.0, L / (2 * g) * 1.02, 0.95), segs=20, rings=14, sub=1)
    sphere('hump', g * 0.95, mat('matte', coat), bm, at=(0, -L * 0.22, cz + g * 0.3), scale=(1.05, 1.1, 0.95), sub=1)
    sphere('rump', g * 0.95, mat('matte', coat), bm, at=(0, L * 0.3, cz + 0.0), scale=(1.0, 1.0, 0.95), sub=1)
    sphere('belly', g * 0.8, mat('matte', muzzle), bm, at=(0, -L * 0.05, cz - g * 0.45), scale=(0.9, 1.6, 0.55), sub=1)
    nk, hd = B['neck'], B['head']
    tube('neckBody', g * 0.62, g * 0.55, g * 0.9, mat('matte', coat), nk, at=(0, -L * 0.42, cz + g * 0.05), rot=(1.2, 0, 0), segs=12, sub=1)
    hz = cz + g * 0.75
    hy = -L * 0.62
    sphere('skull', g * 0.6, mat('matte', coat), hd, at=(0, hy, hz), scale=(1.05, 1.0, 0.92), sub=1)
    lathe('snout', [(g * 0.32, 0.0), (g * 0.26, g * 0.3), (g * 0.12, g * 0.45)], mat('matte', muzzle), hd, at=(0, hy - g * 0.35, hz - g * 0.16), rot=(math.pi / 2, 0, 0), segs=12, sub=1)
    sphere('nose', g * 0.1, mat('matte', '#1a1412'), hd, at=(0, hy - g * 0.82, hz - g * 0.12), scale=(1.2, 0.8, 0.8))
    box('jaw', (g * 0.36, g * 0.4, g * 0.1), mat('matte', '#5a2a22'), hd, at=(0, hy - g * 0.5, hz - g * 0.33), bevel=0.02, sub=1)
    for sx in (-1, 1):
        sphere(f'ear{sx}', g * 0.16, mat('matte', coat), hd, at=(sx * g * 0.38, hy + g * 0.15, hz + g * 0.42), scale=(1, 0.6, 1), sub=1)
        sphere(f'earIn{sx}', g * 0.09, mat('matte', muzzle), hd, at=(sx * g * 0.38, hy + g * 0.08, hz + g * 0.42), scale=(1, 0.5, 1))
        sphere(f'eye{sx}', g * 0.06, mat('matte', eye), hd, at=(sx * g * 0.26, hy - g * 0.42, hz + g * 0.15))
        for i in range(2):
            lathe(f'fang{sx}{i}', [(g * 0.035, 0.0), (0.0, g * 0.12)], mat('matte', '#f2ead8'), hd, at=(sx * g * (0.08 + i * 0.06), hy - g * 0.62, hz - g * 0.24), rot=(math.pi, 0, 0), segs=5)
    sphere('tail', g * 0.18, mat('matte', coat), B['tail'], at=(0, L * 0.52, cz + g * 0.15), sub=1)
    B.legs(coat, coat, claw, paws=True)
    for k in ('FL', 'FR', 'HL', 'HR'):
        x = (1 if k in ('FL', 'HL') else -1) * g * 0.55
        y = (-1 if k[0] == 'F' else 1) * L * 0.36
        for i in range(3):
            lathe(f'claw.{k}{i}', [(g * 0.025, 0.0), (0.0, g * 0.1)], mat('matte', '#efe6d0'), B[f'lower.{k}'], at=(x + (i - 1) * g * 0.08, y - g * 0.22, 0.02), rot=(math.pi / 2 + 0.3, 0, 0), segs=4)


def feline(B, coat, belly, eye='#ffb02a', ear_in='#3a2a2a'):
    """A big cat: long low body, small round head, round ears and a long curling tail."""
    g, L, cz = B.g, B.L, B.cz
    bm = B['barrel']
    sphere('barrelBody', g, mat('matte', coat), bm, at=(0, 0, cz), scale=(0.85, L / (2 * g) * 1.05, 0.9), segs=20, rings=14, sub=1)
    sphere('chest', g * 0.98, mat('matte', coat), bm, at=(0, -L * 0.3, cz + 0.02), scale=(0.95, 0.9, 1.05), sub=1)
    sphere('haunch', g * 0.95, mat('matte', coat), bm, at=(0, L * 0.3, cz + 0.02), scale=(0.95, 0.95, 1.0), sub=1)
    sphere('belly', g * 0.6, mat('matte', belly), bm, at=(0, 0.0, cz - g * 0.45), scale=(0.9, 1.9, 0.5), sub=1)
    nk, hd = B['neck'], B['head']
    tube('neckBody', g * 0.5, g * 0.42, g * 1.0, mat('matte', coat), nk, at=(0, -L * 0.42, cz + g * 0.1), rot=(1.1, 0, 0), segs=12, sub=1)
    hz = cz + g * 0.7
    hy = -L * 0.6
    sphere('skull', g * 0.55, mat('matte', coat), hd, at=(0, hy, hz), scale=(1.05, 1.0, 0.9), sub=1)
    sphere('muzzle', g * 0.3, mat('matte', coat), hd, at=(0, hy - g * 0.42, hz - g * 0.15), scale=(1.1, 0.9, 0.75), sub=1)
    sphere('nose', g * 0.07, mat('matte', '#1a1214'), hd, at=(0, hy - g * 0.66, hz - g * 0.08), scale=(1.2, 0.7, 0.7))
    for sx in (-1, 1):
        lathe(f'ear{sx}', [(g * 0.16, 0.0), (g * 0.1, g * 0.15), (0.0, g * 0.24)], mat('matte', coat), hd, at=(sx * g * 0.3, hy + g * 0.08, hz + g * 0.38), rot=(-0.2, sx * 0.35, 0), segs=8)
        sphere(f'earIn{sx}', g * 0.07, mat('matte', ear_in), hd, at=(sx * g * 0.3, hy + 0.0, hz + g * 0.44), scale=(1, 0.4, 1))
        sphere(f'eye{sx}', g * 0.075, mat('glow', eye), hd, at=(sx * g * 0.22, hy - g * 0.43, hz + g * 0.1), scale=(1.2, 0.6, 0.8))
        box(f'whisker{sx}', (g * 0.5, 0.004, 0.004), mat('matte', '#d8d0c0'), hd, at=(sx * g * 0.3, hy - g * 0.6, hz - g * 0.15), rot=(0, sx * 0.15, sx * 0.2))
    # The long tail curls up at the tip.
    t0 = (0, L * 0.5, cz + g * 0.2)
    curve_tube('tail', [t0, (0, L * 0.75, cz - g * 0.2), (0, L * 1.0, cz - g * 0.1), (0, L * 1.12, cz + g * 0.35)], g * 0.16, mat('matte', coat), B['tail'], taper=[1.0, 0.85, 0.7, 0.5])
    B.legs(coat, coat, '#1a1214', paws=True)
