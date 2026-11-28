"""Bow-armed figures with a real draw (Archer, Pathfinder, Huntress).

The bow is a prop on its own pivot (child of the chest). Its string is two halves,
each hinged at a bow tip and aimed at the nocking point, so the string truly pulls
back to the cheek and snaps forward on release; an arrow rides on the string. For
every pose the arms are solved (figure.solve_arm) so the left hand holds the grip
and the right hand holds the string."""
import math
from mathutils import Vector
from blib import mat, sphere, box, lathe, tube, extrude, torus, pivot, key, clip, curve_tube
from figure import HIP, SHOULDER, solve_arm, _update

GOLD = '#f0bd4c'


def make_bow(F, length=0.72, wood='#8a5a2c', grip='#4a2c18', tips=GOLD, string='#efe6d0', fletch='#f2efe6', fletch2='#c8402e', at=(0.0, -0.3, 0.6)):
    """Build the bow prop (pointing up along +Z at rest, belly toward -Y) and its string and arrow."""
    gx, gy, gz = at
    bp = pivot('bow', F['chest'], at)
    half = length / 2
    # A recurve: limbs bow away from the archer, the tips curl back.
    path = [(gx, gy + 0.02, gz - half), (gx, gy - 0.03, gz - half * 0.75), (gx, gy - 0.07, gz - half * 0.3), (gx, gy - 0.075, gz),
            (gx, gy - 0.07, gz + half * 0.3), (gx, gy - 0.03, gz + half * 0.75), (gx, gy + 0.02, gz + half)]
    curve_tube('bowLimbs', path, 0.017, mat('matte', wood), bp, taper=[0.55, 0.8, 1.0, 1.3, 1.0, 0.8, 0.55])
    tube('bowGrip', 0.024, 0.024, 0.09, mat('matte', grip), bp, at=(gx, gy - 0.075, gz - 0.045), segs=8)
    for sgn in (-1, 1):
        sphere(f'bowTip{sgn}', 0.013, mat('gold', tips), bp, at=(gx, gy + 0.02, gz + sgn * half))
        torus(f'bowRing{sgn}', 0.02, 0.005, mat('gold', tips), bp, at=(gx, gy - 0.05, gz + sgn * half * 0.55), segs=10, rsegs=3)
    # String halves, hinged at the tips, meeting at the nock (rest: straight).
    nock_rest = (gx, gy + 0.02, gz)
    halves = {}
    for name, sgn in (('stringTop', 1), ('stringBot', -1)):
        tip = (gx, gy + 0.02, gz + sgn * half)
        sp = pivot(name, bp, tip)
        # Built pointing from the tip toward the nock: straight down (top) or up (bottom).
        tube(name + 'Line', 0.0032, 0.0032, half, mat('matte', string), sp, at=(tip[0], tip[1], tip[2] - half if sgn > 0 else tip[2]), segs=4, caps=False)
        F.p[name] = sp
        halves[name] = (sp, sgn)
    # The arrow, on its own pivot at the nock, pointing forward (-Y).
    ap = pivot('arrow', bp, nock_rest)
    F.p['arrow'] = ap
    ax, ay, az = nock_rest
    tube('arrowShaft', 0.005, 0.005, 0.5, mat('matte', '#c9a46a'), ap, at=(ax, ay - 0.47, az), rot=(-math.pi / 2, 0, 0), segs=5)
    lathe('arrowHead', [(0.012, 0.0), (0.0, 0.05)], mat('metal', '#d8dde4'), ap, at=(ax, ay - 0.47, az), rot=(math.pi / 2, 0, 0), segs=6)
    for i, a in enumerate((0, 2.1, 4.2)):
        box(f'fletch{i}', (0.003, 0.06, 0.02), mat('matte', fletch2 if i == 0 else fletch), ap, at=(ax + math.cos(a) * 0.01, ay - 0.04, az + math.sin(a) * 0.01), rot=(0, a, 0))
    F.p['bow'] = bp
    F.bow = {'origin': Vector(at), 'nock': Vector(nock_rest), 'half': half}
    return bp


def _string_to(F, nock_world):
    """Aim both string halves at a world point; returns {pivot: (rot, scale)}."""
    out = {}
    bp = F.p['bow']
    for name in ('stringTop', 'stringBot'):
        sp = F.p[name]
        sgn = 1 if name == 'stringTop' else -1
        sp.rotation_euler = (0, 0, 0)
        sp.scale = (1, 1, 1)
        _update()
        tip = sp.matrix_world.translation
        d = Vector(nock_world) - tip
        local = (bp.matrix_world.to_3x3().inverted() @ d)
        # The half was built along -Z (top) or +Z (bottom) from its tip.
        base = Vector((0, 0, -1 if sgn > 0 else 1))
        q = base.rotation_difference(local.normalized())
        out[name] = (tuple(q.to_euler()), (1.0, 1.0, max(0.2, local.length / F.bow['half'])))
    return out


def bow_pose(F, base, rots=None, grip=None, up=(0.0, 0.0, 1.0), draw=None, hips_z=0.0, right_rest=False, facing=(0.0, -1.0, 0.0), right=None):
    """Apply a pose and solve the hands. grip/up place the bow (world); draw is the
    world point the string is pulled to (None = at rest, the right hand on the string
    unless right_rest)."""
    P = F.p
    for n, o in P.items():
        o.location, o.rotation_euler, o.scale = base[n]
    P['hips'].location.z = HIP + hips_z
    for n, r in (rots or {}).items():
        P[n].rotation_euler = r
    _update()
    bp = P['bow']
    chest = P['chest'].matrix_world
    # World basis: Z up the bow, -Y toward the target (the belly and the arrow's point).
    from mathutils import Matrix
    z = Vector(up).normalized()
    fwd = Vector(facing)
    y = -(fwd - z * fwd.dot(z)).normalized()
    x = y.cross(z)
    world = Matrix((x, y, z)).transposed()
    bp.rotation_euler = (chest.to_3x3().inverted() @ world).to_euler()
    bp.location = chest.inverted() @ Vector(grip)
    _update()
    # String: pulled to `draw`, or straight (the nock in its rest place).
    nock = Vector(draw) if draw is not None else bp.matrix_world @ (F.bow['nock'] - F.bow['origin'])
    for name, (r, sc) in _string_to(F, nock).items():
        P[name].rotation_euler = r
        P[name].scale = sc
    # The arrow sits on the string at the nock.
    P['arrow'].location = bp.matrix_world.inverted() @ nock
    _update()
    out = {n: (tuple(o.location), tuple(o.rotation_euler), tuple(o.scale)) for n, o in P.items()}
    left = bp.matrix_world @ Vector((0.0, -0.075, 0.0))
    sol, _ = solve_arm(F, 'L', left, start=(-1.2, 0.0, -0.2, -0.3))
    for n, r in sol.items():
        out[n] = (out[n][0], r, out[n][2])
    if not right_rest:
        sol, err = solve_arm(F, 'R', Vector(right) if right is not None else nock, start=(-1.2, 0.0, 0.4, -1.6))
        for n, r in sol.items():
            out[n] = (out[n][0], r, out[n][2])
    return out


def key_pose(F, frame, pose):
    for n, (loc, rot, sc) in pose.items():
        key(F.p[n], frame, rot=rot, loc=loc, scale=sc)


def blend(a, b, t):
    lerp = lambda x, y: tuple(p * (1 - t) + q * t for p, q in zip(x, y))
    return {n: (lerp(a[n][0], b[n][0]), lerp(a[n][1], b[n][1]), lerp(a[n][2], b[n][2])) for n in a}


def bow_clips(F, walk_legs, extra_carry_rots=None, draw_rots=None):
    """Idle, walk (bow carried low in the left hand) and attack (raise, draw to the cheek
    by frame 18, loose at 21 = 70%, follow through). Returns the carry and draw poses."""
    P = F.p
    base = {n: (o.location.copy(), o.rotation_euler.copy(), o.scale.copy()) for n, o in P.items()}
    # Carry: bow held low at the left side, upright, a little forward.
    carry = bow_pose(F, base, rots=extra_carry_rots, grip=(0.2 * F.bulk, -0.1, 0.42), up=(0.05, -0.25, 1.0), right_rest=True)
    # No arrow on the string until it is nocked to shoot.
    carry['arrow'] = (carry['arrow'][0], carry['arrow'][1], (0.001, 0.001, 0.001))
    # Draw: turned side-on, bow arm straight toward the target, string to the cheek.
    rots = {'chest': (0.0, 0.0, -0.75), 'head': (0.08, 0.0, 0.7), **(draw_rots or {})}
    P['chest'].rotation_euler = rots['chest']
    _update()
    shoulder = P['upperarm.L'].matrix_world.translation
    head = P['head'].matrix_world.translation
    grip = shoulder + Vector((0.02, -0.3, -0.02))
    cheek = Vector((head.x - 0.05, head.y - 0.06, head.z - 0.07))
    draw = bow_pose(F, base, rots=rots, grip=tuple(grip), up=(0.0, -0.05, 1.0), draw=tuple(cheek))
    rest_nock = grip + Vector((0.0, 0.02, 0.0))
    nocked = bow_pose(F, base, rots=rots, grip=tuple(grip), up=(0.0, -0.05, 1.0), draw=tuple(cheek + (rest_nock - cheek) * 0.45))
    # Loose: the string snaps straight, the drawing hand flies back past the ear.
    loose = bow_pose(F, base, rots={**rots, 'chest': (0.05, 0.0, -0.8)}, grip=tuple(grip + Vector((0, -0.01, 0.01))), up=(0.0, -0.08, 1.0),
                     right=tuple(cheek + Vector((0.03, 0.08, 0.02))))
    loose['arrow'] = (loose['arrow'][0], loose['arrow'][1], (0.001, 0.001, 0.001))
    # Leave the model in the carry pose (its rest for every clip).
    for n, (loc, rot, sc) in carry.items():
        P[n].location, P[n].rotation_euler, P[n].scale = loc, rot, sc
    _update()
    objs = list(P.values())

    def idle():
        for f, k in ((1, 0.0), (31, 1.0), (61, 0.0)):
            p = dict(carry)
            loc, rot, sc = p['chest']
            p['chest'] = (loc, (rot[0] - 0.025 * k, rot[1], rot[2]), sc)
            loc, rot, sc = p['head']
            p['head'] = (loc, (rot[0] + 0.03 * k, rot[1], rot[2] + 0.05 * k), sc)
            key_pose(F, f, p)
    clip('idle', objs, 61, idle)

    def walk():
        n = 24
        for i in range(0, n + 1, 3):
            f = 1 + i
            ph = 2 * math.pi * i / n
            p = dict(carry)
            loc, rot, sc = p['chest']
            p['chest'] = (loc, (rot[0] + 0.05, rot[1], rot[2] + 0.07 * math.sin(ph)), sc)
            loc, rot, sc = p['upperarm.R']
            p['upperarm.R'] = (loc, (rot[0] - 0.35 * math.sin(ph), rot[1], rot[2]), sc)
            loc, rot, sc = p['hips']
            p['hips'] = ((loc[0], loc[1], HIP + 0.018 * abs(math.cos(ph))), rot, sc)
            key_pose(F, f, p)
            walk_legs(f, ph)
    clip('walk', objs, 25, walk)

    def shoot():
        for f, p in ((1, carry), (7, blend(carry, nocked, 0.7)), (11, nocked), (18, draw), (20, draw), (21, loose), (26, loose), (30, blend(loose, nocked, 0.5))):
            key_pose(F, f, p)
    clip('attack', objs, 30, shoot)
    return carry, draw


def legs_walk(F):
    def fn(f, ph):
        s, c = math.sin(ph), math.cos(ph)
        for n, r in {
            'thigh.L': (-0.5 * s, 0, 0), 'thigh.R': (0.5 * s, 0, 0),
            'shin.L': (0.55 * max(0.0, c) ** 1.5 + 0.05, 0, 0), 'shin.R': (0.55 * max(0.0, -c) ** 1.5 + 0.05, 0, 0),
            'foot.L': (0.2 * s, 0, 0), 'foot.R': (-0.2 * s, 0, 0),
        }.items():
            key(F.p[n], f, rot=r)
    return fn
