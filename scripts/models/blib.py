"""Modelling toolkit for the unit models, run inside Blender's Python (pip install bpy).

Models are built facing -Y with Z up, feet at Z = 0 (glTF export turns that into
+Z forward, Y up, as the game expects). A figure is a tree of pivots (empties):
root > hips > spine > chest > neck > head, chest > shoulder.L/R > upperarm >
forearm > hand, hips > thigh.L/R > shin > foot. Rigid parts hang under a pivot,
so elbows and knees bend; animation rotates the pivots.

Materials are named "<finish>#<hex>" (finish: matte, metal, gold, glow) or
"team" / "team_dark"; the game reads the finish and colour from the name and
merges each pivot's parts per finish.
"""
import math
import bpy
import bmesh
from mathutils import Matrix, Vector, Euler

# ---- scene ------------------------------------------------------------------


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30


_mats = {}
# Share of faces kept after subdivision (units are seen small; 0.4 keeps the shapes round).
DECIMATE = 0.4


def mat(finish, color='#ffffff'):
    """A material by finish and colour ('team' and 'team_dark' take the team colour in game)."""
    if color.startswith('team'):
        finish = color  # any finish asked in the team colour is the team cloth
    name = finish if finish.startswith('team') else f'{finish}#{color.lstrip("#").lower()}'
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    c = '#2f5fd0' if finish == 'team' else '#1f3f90' if finish == 'team_dark' else color
    rgb = hex_rgb(c)
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 0.35 if finish in ('metal', 'gold') else 0.8
    bsdf.inputs['Metallic'].default_value = 0.7 if finish in ('metal', 'gold') else 0.0
    if finish == 'glow':
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = 1.0
    _mats[name] = m
    return m


def hex_rgb(h):
    h = h.lstrip('#')
    s = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # sRGB -> linear
    return tuple(((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in s)


def pivot(name, parent=None, at=(0, 0, 0)):
    """An empty that parts hang under and animation rotates. `at` is in world space."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    bpy.context.scene.collection.objects.link(e)
    e.rotation_mode = 'XYZ'
    if parent is not None:
        e.parent = parent
        e.location = Vector(at) - world_pos(parent)
    else:
        e.location = at
    return e


def world_pos(o):
    p = Vector((0, 0, 0))
    while o is not None:
        p += o.location
        o = o.parent
    return p


# ---- meshes -------------------------------------------------------------------


def _obj(name, bm, material, parent, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    if parent is not None:
        o.parent = parent
        o.location = -world_pos(parent)
    return o


def _place(bm, at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    m = Matrix.Translation(Vector(at)) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1))
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts)


def finish(o, sub=0, bevel=0.0, bevel_segs=2, weld=False, decimate=True):
    """Add subdivision and bevel modifiers (applied at export)."""
    if weld:
        o.modifiers.new('weld', 'WELD')
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL')
        b.width = bevel
        b.segments = bevel_segs
        b.limit_method = 'ANGLE'
    if sub:
        s = o.modifiers.new('sub', 'SUBSURF')
        s.levels = sub
        s.render_levels = sub
        # Subdivision rounds the shapes; a decimate then keeps the count game-sized.
        if decimate:
            d = o.modifiers.new('decimate', 'DECIMATE')
            d.ratio = DECIMATE
    return o


def sphere(name, r, material, parent, at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), segs=16, rings=10, sub=0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    _place(bm, at, rot, scale)
    return finish(_obj(name, bm, material, parent), sub=sub)


def box(name, size, material, parent, at=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, sub=0, taper=None, bevel_segs=2):
    """A box (size x, y, z); `taper` scales the top face (x, y) to make wedges and trapezoids."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
        if taper and v.co.z > 0:
            v.co.x *= taper[0]
            v.co.y *= taper[1]
    _place(bm, at, rot)
    return finish(_obj(name, bm, material, parent, smooth=sub > 0), sub=sub, bevel=bevel, bevel_segs=bevel_segs)


def lathe(name, profile, material, parent, at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), segs=16, sub=0, angle=2 * math.pi, smooth=True):
    """Turn a profile [(radius, z), ...] about Z. A partial `angle` makes shells (pauldrons, visors)."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    full = abs(angle - 2 * math.pi) < 1e-6
    res = bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=angle, steps=segs, use_duplicate=False)
    if full:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _place(bm, at, rot, scale)
    return finish(_obj(name, bm, material, parent, smooth=smooth), sub=sub)


def tube(name, r0, r1, length, material, parent, at=(0, 0, 0), rot=(0, 0, 0), segs=12, sub=0, caps=True):
    """A tapered cylinder along Z from `at` (base) upward (before `rot`)."""
    prof = [(0.0, 0.0), (r0, 0.0), (r0 * 0.5 + r1 * 0.5, length * 0.5), (r1, length), (0.0, length)] if caps else [(r0, 0.0), (r1, length)]
    return lathe(name, prof, material, parent, at=at, rot=rot, segs=segs, sub=sub)


def extrude(name, outline, depth, material, parent, at=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, sub=0):
    """A flat outline [(x, z), ...] in the XZ plane (facing -Y) given thickness along Y."""
    bm = bmesh.new()
    vs = [bm.verts.new((x, 0, z)) for x, z in outline]
    f = bm.faces.new(vs)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, depth, 0), verts=nv)
    bmesh.ops.translate(bm, vec=(0, -depth / 2, 0), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _place(bm, at, rot)
    return finish(_obj(name, bm, material, parent, smooth=False), sub=sub, bevel=bevel)


def torus(name, R, r, material, parent, at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), segs=24, rsegs=6):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=segs, minor_segments=rsegs)
    o = bpy.context.active_object
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bpy.data.objects.remove(o)
    _place(bm, at, rot, scale)
    return _obj(name, bm, material, parent)


def sheet(name, w, h, material, parent, at=(0, 0, 0), rot=(0, 0, 0), bend=0.0, flare=0.0, cols=6, rows=6, thick=0.01, sub=1, ragged=0.0, seed=1):
    """A hanging cloth (tabard, cape, banner): a curved, flaring strip hanging down from `at`."""
    import random
    rnd = random.Random(seed)
    bm = bmesh.new()
    grid = []
    for j in range(rows + 1):
        t = j / rows
        row = []
        for i in range(cols + 1):
            u = i / cols - 0.5
            x = u * w * (1 + flare * t)
            y = -bend * math.cos(u * math.pi) + bend * 0.5 * t
            z = -t * h
            if j == rows and ragged:
                z -= rnd.random() * ragged
            row.append(bm.verts.new((x, y, z)))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    if thick:
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=thick)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    _place(bm, at, rot)
    return finish(_obj(name, bm, material, parent), sub=sub, decimate=False)


def boolean_cut(target, cutter):
    """Cut `cutter` out of `target` (applied at export); the cutter is hidden from export."""
    m = target.modifiers.new('cut', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.object = cutter
    m.solver = 'EXACT'
    # Booleans should come before subdivision.
    while target.modifiers[0] != m:
        bpy.ops.object.modifier_move_up({'object': target}, modifier=m.name) if False else None
        target.modifiers.move(target.modifiers.find(m.name), 0)
    cutter.hide_render = True
    cutter.hide_set(True)
    cutter['cutter'] = True
    return target


# ---- animation -------------------------------------------------------------------


def key(o, frame, rot=None, loc=None, scale=None):
    if scale is not None:
        o.scale = Vector(scale)
        o.keyframe_insert('scale', frame=frame)
    if rot is not None:
        o.rotation_euler = Euler(rot)
        o.keyframe_insert('rotation_euler', frame=frame)
    if loc is not None:
        o.location = Vector(loc)
        o.keyframe_insert('location', frame=frame)


def clip(name, objects, frames, build):
    """Record one animation: `build(frame_fn)` sets keys; each object's keys go to an NLA track named `name`."""
    base = {o.name: (o.location.copy(), o.rotation_euler.copy(), o.scale.copy()) for o in objects}
    for o in objects:
        o.animation_data_create()
        o.animation_data.action = None
    build()
    for o in objects:
        ad = o.animation_data
        act = ad.action
        if act is None:
            continue
        act.name = f'{name}.{o.name}'
        tr = ad.nla_tracks.new()
        tr.name = name
        st = tr.strips.new(name, 1, act)
        st.action_frame_start = 1
        st.action_frame_end = frames
        ad.action = None
        o.location, o.rotation_euler, o.scale = base[o.name]


# ---- export --------------------------------------------------------------------


def consolidate():
    """Bake modifiers and join all parts sharing a parent and a material into one object."""
    dg = bpy.context.evaluated_depsgraph_get()
    groups = {}
    for o in list(bpy.data.objects):
        if o.type != 'MESH' or o.get('cutter'):
            continue
        key = (o.parent.name if o.parent else '', o.data.materials[0].name if o.data.materials else '')
        groups.setdefault(key, []).append(o)
    for (pname, mname), objs in groups.items():
        if len(objs) < 2:
            continue
        bm = bmesh.new()
        parent = objs[0].parent
        for o in objs:
            me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
            # Into the parent's space.
            me.transform(o.matrix_parent_inverse if False else Matrix.Translation(o.location) @ o.rotation_euler.to_matrix().to_4x4() @ Matrix.Diagonal((*o.scale, 1)))
            bm.from_mesh(me)
            bpy.data.meshes.remove(me)
        for o in objs:
            bpy.data.objects.remove(o)
        me = bpy.data.meshes.new(f'{pname}_{mname}')
        bm.to_mesh(me)
        bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
        me.materials.append(bpy.data.materials[mname])
        o = bpy.data.objects.new(f'{pname}_{mname}', me)
        bpy.context.scene.collection.objects.link(o)
        o.parent = parent


def export(path):
    # Cutters and helper objects stay out of the file.
    consolidate()
    for o in list(bpy.data.objects):
        if o.get('cutter'):
            o.hide_viewport = True
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if not o.get('cutter'):
            o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_animations=True,
        export_animation_mode='NLA_TRACKS',
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_yup=True,
        export_texcoords=False,
        export_normals=True,
        export_materials='EXPORT',
    )


def curve_tube(name, points, radius, material, parent, taper=None, segs=8):
    """A smooth tube along a path of points (bows, tails, antlers, roots); `taper` scales the radius along it."""
    cu = bpy.data.curves.new(name + 'Curve', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = max(1, segs // 4)
    cu.resolution_u = 6
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(points) - 1)
    for i, p in enumerate(points):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
        if taper:
            bp.radius = taper[min(i, len(taper) - 1)]
    tmp = bpy.data.objects.new(name + 'Tmp', cu)
    bpy.context.scene.collection.objects.link(tmp)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg))
    bpy.data.objects.remove(tmp)
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    for p in me.polygons:
        p.use_smooth = True
    o.data.materials.clear()
    o.data.materials.append(material)
    if parent is not None:
        o.parent = parent
        o.location = -world_pos(parent)
    return o


def lump(name, r, material, parent, at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1), seed=1, rough=0.2, segs=14, rings=10, sub=1, freq=(2, 5), waves_n=5):
    """An organic lump (bark plates, moss, foliage, boulders): a sphere pushed about by smooth noise."""
    import random
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=r)
    # A few random waves make smooth bumps.
    waves = [(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized(), rnd.uniform(*freq), rnd.uniform(0, 6.28)) for _ in range(waves_n)]
    for v in bm.verts:
        n = v.co.normalized()
        k = 1 + rough * sum(math.sin(n.dot(d) * f + ph) for d, f, ph in waves) / len(waves)
        v.co = n * r * k
    _place(bm, at, rot, scale)
    return finish(_obj(name, bm, material, parent), sub=sub)
