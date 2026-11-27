"""Elite units (sheet 16): Musketeer, War Bear and Bear Rider, Sentinel and Bearwarden,
Nature Wolf and Wolf Rider, Bark Sentinel and Wolfkeeper, Shapeshifter (warrior and panther)."""
import math
from blib import mat, sphere, box, lathe, tube, extrude, torus, sheet, lump, curve_tube
from figure import Figure, HIP, KNEE, ANKLE, SHOULDER, SH_X, ELBOW_DROP, WRIST_DROP, NECK, HEAD
from common import cloth_legs, torso, cloth_arms, face, cape, leaf, leaf_ring, held, hand_at, arm_x, crown_emblem, GOLD, LEATHER, LEATHER_D
import beasts as BS
import crown as CR
import wild as WD

STEEL = CR.STEEL
BRASS = '#c99a3a'
BEAR = '#7a4a28'
BEAR_L = '#a87048'
WOLF = '#8c8e94'
WOLF_L = '#d4d0c6'
WOLF_D = '#5c5e66'
MOSS = '#6f9a34'
MOSS_D = '#4c7424'
EMERALD = '#5cff9a'
PANTHER = '#2b2a31'
PANTHER_L = '#3e3c46'
AMBER = WD.AMBER


# ---- Crown ------------------------------------------------------------------------------


def musketeer():
    """Blue long coat with gold trim, steel breastplate, a wide feathered hat and a flintlock."""
    F = Figure(bulk=1.06)
    team, team_d, gold = mat('team'), mat('team_dark'), mat('gold', GOLD)
    cloth_legs(F, pants='#5a4632', boots=LEATHER_D, boot_top=LEATHER)
    for s, sx in (('R', -1), ('L', 1)):
        # Tall riding boots up to the knee.
        lathe(f'bootShaft.{s}', [(0.0, 0.0), (0.054, 0.0), (0.056, 0.1), (0.064, 0.18), (0.0, 0.18)], mat('matte', LEATHER_D), F[f'shin.{s}'], at=(0.075 * F.bulk * sx, 0, ANKLE + 0.02), segs=12, sub=1)
    torso(F, '#efe2c2', belt=LEATHER_D, buckle=GOLD)
    ch = F['chest']
    # The coat: team front panels to the knee with gold edging, a back skirt, crowns on the hem.
    for sx in (-1, 1):
        sheet(f'coatFront{sx}', 0.12, 0.5, team, ch, at=(sx * 0.07, -0.118, 0.74), rot=(0, 0, sx * 0.1), bend=0.02, flare=0.35, cols=5, rows=8, thick=0.01)
        box(f'coatEdge{sx}', (0.014, 0.014, 0.48), gold, ch, at=(sx * 0.018, -0.135, 0.51), rot=(-0.06, 0, sx * 0.04))
        crown_emblem(ch, (sx * 0.08, -0.145, 0.31), 0.045)
    sheet('coatBack', 0.28, 0.5, team, ch, at=(0, 0.12, 0.74), rot=(0, 0, math.pi), bend=0.03, flare=0.4, cols=7, rows=8, thick=0.01)
    lathe('cuirass', [(0.0, 0.0), (0.125, 0.0), (0.145, 0.05), (0.152, 0.12), (0.14, 0.18), (0.1, 0.215), (0.0, 0.225)], mat('metal', STEEL), ch, at=(0, -0.006, 0.53), scale=(0.92, 0.8, 1), segs=20, sub=1)
    torus('collar', 0.08, 0.02, mat('matte', '#efe2c2'), ch, at=(0, 0, NECK - 0.01), scale=(1, 0.9, 1), segs=16, rsegs=6)
    # Bandolier with powder charges, a pouch and a powder horn.
    box('bandolier', (0.04, 0.012, 0.42), mat('matte', LEATHER), ch, at=(0.0, -0.13, 0.62), rot=(0, 0, -0.6))
    for i in range(4):
        lathe(f'charge{i}', [(0.0, 0.0), (0.012, 0.0), (0.012, 0.04), (0.0, 0.045)], mat('matte', '#3a2a1a'), ch, at=(-0.09 + i * 0.05, -0.142, 0.71 - i * 0.07), segs=6)
    box('pouch', (0.08, 0.04, 0.06), mat('matte', LEATHER), F['spine'], at=(0.1, -0.08, 0.48), bevel=0.012, sub=1)
    curve_tube('powderHorn', [(-0.11, -0.05, 0.5), (-0.14, -0.02, 0.44), (-0.12, 0.02, 0.4)], 0.028, mat('matte', '#efe2c6'), F['spine'], taper=[1.0, 0.7, 0.3])
    torus('hornBand', 0.026, 0.006, mat('gold', BRASS), F['spine'], at=(-0.11, -0.05, 0.5), rot=(0.4, 0.3, 0), segs=10, rsegs=3)
    # Sleeves: cream shirt, team cuffs.
    cloth_arms(F, '#e8dbbd', glove=LEATHER_D)
    for s in 'RL':
        torus(f'cuff.{s}', 0.048, 0.016, team, F[f'forearm.{s}'], at=(arm_x(F, s) * 1.05, -0.005, SHOULDER - WRIST_DROP + 0.04), segs=12, rsegs=4)
    face(F, hair='#3a2414', beard=None, brows='#2a1a10')
    h = F['head']
    # Moustache and goatee.
    box('moustache', (0.085, 0.016, 0.016), mat('matte', '#2a1a10'), h, at=(0, -0.083, HEAD - 0.028), rot=(0, 0, 0), bevel=0.007, sub=1)
    lathe('goatee', [(0.0, 0.0), (0.016, 0.01), (0.0, 0.05)], mat('matte', '#2a1a10'), h, at=(0, -0.07, HEAD - 0.1), rot=(math.pi, 0, 0), segs=8)
    # The hat: a wide brim, a round crown, a gold band, a big white plume and a team feather.
    lathe('hatBrim', [(0.0, 0.0), (0.2, 0.0), (0.21, 0.012), (0.0, 0.018)], team_d, h, at=(0, 0.0, HEAD + 0.065), rot=(-0.12, 0.18, 0), segs=24, sub=1)
    lathe('hatCrown', [(0.0, 0.0), (0.095, 0.0), (0.09, 0.07), (0.06, 0.1), (0.0, 0.105)], team_d, h, at=(0, 0.0, HEAD + 0.07), segs=18, sub=1)
    torus('hatBand', 0.094, 0.01, mat('gold', GOLD), h, at=(0, 0.0, HEAD + 0.085), segs=18, rsegs=4)
    for i in range(7):
        t = i / 6
        sphere(f'plume{i}', 0.04 - t * 0.016, mat('matte', '#f6f2ea'), h, at=(0.07 + t * 0.06, 0.02 + t * 0.14, HEAD + 0.15 - t * t * 0.05), scale=(0.55, 1.8, 0.9), rot=(0.5 + t * 0.5, 0, -0.4), sub=1)
    for i in range(4):
        t = i / 3
        sphere(f'feather{i}', 0.026 - t * 0.008, team, h, at=(0.05 + t * 0.03, 0.04 + t * 0.1, HEAD + 0.13 - t * 0.02), scale=(0.5, 1.8, 0.8), rot=(0.7 + t * 0.4, 0, -0.6), sub=1)
    # The flintlock: a walnut stock, a steel barrel with brass bands, a lock and a ramrod.
    hd, (hx, hy, hz) = held(F, 'R')
    tilt = -0.15  # carried muzzle forward, a little down
    def along(d):
        return (hx, hy - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    rot = (math.pi / 2 - tilt, 0, 0)
    box('stock', (0.045, 0.32, 0.06), mat('matte', '#7a4a24'), hd, at=along(0.04), rot=(-tilt, 0, 0), bevel=0.012, sub=1, taper=(1.0, 0.75))
    box('butt', (0.05, 0.12, 0.1), mat('matte', '#7a4a24'), hd, at=along(-0.13), rot=(-tilt + 0.15, 0, 0), bevel=0.015, sub=1)
    tube('barrel', 0.016, 0.014, 0.62, mat('metal', '#5a5f68'), hd, at=along(0.12), rot=rot, segs=10)
    for i in range(3):
        tube(f'barrelBand{i}', 0.02, 0.02, 0.02, mat('gold', BRASS), hd, at=along(0.2 + i * 0.16), rot=rot, segs=10, caps=False)
    box('lock', (0.05, 0.06, 0.04), mat('metal', '#8a919c'), hd, at=along(0.08), rot=(-tilt, 0, 0), bevel=0.006)
    box('lockPlate', (0.055, 0.08, 0.01), mat('gold', BRASS), hd, at=(hx - 0.026, along(0.08)[1], along(0.08)[2]), bevel=0.003)
    tube('ramrod', 0.005, 0.005, 0.5, mat('matte', '#c8a070'), hd, at=along(0.12), rot=rot, segs=4)
    F.animate(attack='musket', reload=True, kneel=True)
    return F


def war_bear(armoured=True):
    """An armored brown bear: steel shoulder plates with brass rims, a team caparison, a chanfron."""
    B = BS.Beast(length=0.86, leg=0.3, girth=0.25)
    BS.bear(B, BEAR, BEAR_L)
    g, L, cz = B.g, B.L, B.cz
    bm, hd = B['barrel'], B['head']
    steel, brass, team = mat('metal', STEEL), mat('gold', BRASS), mat('team')
    if armoured:
        # Shoulder plates on the hump, brass-rimmed and riveted.
        for sx in (-1, 1):
            lathe(f'pauldron{sx}', [(0.0, 0.0), (g * 0.42, 0.0), (g * 0.44, g * 0.12), (g * 0.26, g * 0.24), (0.0, g * 0.27)], steel, bm, at=(sx * g * 0.62, -L * 0.24, cz + g * 0.55), rot=(0, sx * 1.0, 0), scale=(1, 1.25, 1), segs=18, sub=1)
            torus(f'pauldronRim{sx}', g * 0.43, 0.012, brass, bm, at=(sx * g * 0.62, -L * 0.24, cz + g * 0.55), rot=(0, sx * 1.0, 0), scale=(1, 1.25, 1), segs=20, rsegs=4)
        # A fitted team barding over the barrel, gold-hemmed, a crown on each flank.
        lathe('barding', [(g * 1.13, 0.0), (g * 1.17, g * 0.55), (g * 1.1, g * 1.0), (g * 0.8, g * 1.35), (0.0, g * 1.45)], team, bm, at=(0, L * 0.1, cz - g * 0.5), scale=(1, L / (2 * g) * 0.62, 1), segs=22, sub=1)
        torus('bardingHem', g * 1.14, 0.016, mat('gold', GOLD), bm, at=(0, L * 0.1, cz - g * 0.48), scale=(1, L / (2 * g) * 0.62, 1), segs=26, rsegs=4)
        for sx in (-1, 1):
            extrude(f'flankCrown{sx}', CR.crown_outline(0.1, 0.07), 0.012, mat('gold', GOLD), bm, at=(sx * g * 1.19, L * 0.1, cz - g * 0.1), rot=(0, 0, sx * math.pi / 2), bevel=0.003)
        # A chanfron plate down the face, a steel collar.
        box('chanfron', (g * 0.42, g * 0.5, g * 0.12), steel, hd, at=(0, -L * 0.62 - g * 0.1, B.cz + g * 1.05), rot=(-0.5, 0, 0), bevel=0.02, sub=1)
        sphere('chanfronStud', g * 0.07, brass, hd, at=(0, -L * 0.62 - g * 0.25, B.cz + g * 1.1))
        torus('collar', g * 0.6, 0.02, steel, B['neck'], at=(0, -L * 0.4, cz + g * 0.12), rot=(1.2, 0, 0), segs=18, rsegs=5)
        for i in range(6):
            a = 2 * math.pi * i / 6
            sphere(f'collarStud{i}', 0.012, brass, B['neck'], at=(math.cos(a) * g * 0.62, -L * 0.4 + math.sin(a) * g * 0.2, cz + g * 0.12 + math.sin(a) * g * 0.55))
    return B


def warbear():
    import bear
    B = bear.war_bear()
    bear.animate_bear(B)
    return B


def sentinel():
    return CR.guard('sentinel')


def bearwarden():
    return CR.guard('bearwarden')


def bearrider():
    import bear
    B = bear.war_bear()
    F = CR.guard('bearwarden', F=Figure(bulk=1.12), animate=False)
    BS.seat_rider(B, F)
    for s_, sx in (('R', -1), ('L', 1)):
        # A broad back: legs well apart, knees bent around the saddle.
        F[f'thigh.{s_}'].rotation_euler = (-1.25, sx * 0.62, 0)
        F[f'shin.{s_}'].rotation_euler = (1.35, 0, 0)
    bear.animate_bear(B)
    F.animate(attack='slash', mounted=True)
    return F


# ---- Thornwild ------------------------------------------------------------------------


def nature_wolf(saddle=False):
    """A big grey woodland wolf: a mossy mane and back, leaves, emerald markings, amber eyes."""
    B = BS.Beast(length=0.78, leg=0.36, girth=0.17)
    BS.canine(B, coat=WOLF, belly=WOLF_L, ruff=WOLF_D)
    g, L, cz = B.g, B.L, B.cz
    bm = B['barrel']
    # Moss over the shoulders and along the spine.
    for i in range(5):
        t = i / 4
        lump(f'moss{i}', g * (0.42 - t * 0.12), mat('matte', MOSS if i % 2 == 0 else MOSS_D), bm, at=(0, -L * 0.32 + t * L * 0.62, cz + g * 0.82 - t * 0.02), scale=(1.3, 1.2, 0.45), seed=30 + i, rough=0.25)
    leaf_ring('maneLeaves', B['neck'], (0, -L * 0.44, cz + g * 0.55), g * 0.55, 8, 0.05, 0.1, WD.LEAVES, tilt=2.1)
    # Emerald streaks along the flanks and forelegs.
    for sx in (-1, 1):
        curve_tube(f'mark{sx}', [(sx * g * 0.86, -L * 0.25, cz + g * 0.2), (sx * g * 0.95, -L * 0.05, cz - g * 0.05), (sx * g * 0.88, L * 0.2, cz + g * 0.25)], 0.012, mat('glow', EMERALD), bm, taper=[0.4, 1.0, 0.4])
        curve_tube(f'mark2{sx}', [(sx * g * 0.8, L * 0.15, cz + g * 0.45), (sx * g * 0.85, L * 0.3, cz + g * 0.1)], 0.01, mat('glow', EMERALD), bm, taper=[0.4, 1.0])
    torus('collar', g * 0.62, 0.018, mat('team'), B['neck'], at=(0, -L * 0.42, cz + g * 0.4), rot=(1.2, 0, 0), segs=16, rsegs=4)
    if saddle:
        lathe('saddleCloth', [(g * 1.0, 0.0), (g * 1.05, g * 0.5)], mat('team'), bm, at=(0, 0.02, cz + g * 0.45), scale=(1, 1.4, 1), segs=16, sub=1)
        box('saddle', (g * 0.95, g * 1.1, 0.04), mat('matte', LEATHER_D), B['saddle'], at=(0, 0.02, cz + g * 0.93), bevel=0.015, sub=1)
    return B


def naturewolf():
    import wolf
    return wolf.naturewolf()


def wolf_pelt_hood(F):
    h = F['head']
    lathe('peltHood', [(0.0, -0.075), (0.1, -0.07), (0.108, -0.02), (0.102, 0.05), (0.07, 0.1), (0.0, 0.115)], mat('matte', WOLF), h,
          at=(0, 0.014, HEAD), scale=(1, 1.08, 1), segs=18, sub=1, angle=math.pi * 1.55, rot=(0, 0, -math.pi * 0.275))
    # The wolf's muzzle over the brow and its ears.
    lathe('peltSnout', [(0.05, 0.0), (0.035, 0.05), (0.0, 0.08)], mat('matte', WOLF), h, at=(0, -0.06, HEAD + 0.1), rot=(math.pi / 2 + 0.3, 0, 0), segs=10, sub=1)
    sphere('peltNose', 0.012, mat('matte', '#1a1412'), h, at=(0, -0.13, HEAD + 0.075))
    for sx in (-1, 1):
        lathe(f'peltEar{sx}', [(0.03, 0.0), (0.015, 0.04), (0.0, 0.07)], mat('matte', WOLF_D), h, at=(sx * 0.06, 0.0, HEAD + 0.1), rot=(-0.1, sx * 0.3, 0), segs=6)
    sheet('peltBack', 0.22 * F.bulk, 0.34, mat('matte', WOLF), F['chest'], at=(0, 0.1 * F.bulk, NECK - 0.0), bend=0.05, flare=0.4, cols=6, rows=6, thick=0.012, ragged=0.04, seed=5)


def wolfkeeper(F=None, animate=True):
    import sylvan
    return sylvan.build('wolfkeeper', F, animate)


def wolfrider():
    import wolf
    B = wolf.nature_wolf(saddle=True)
    import sylvan
    F = wolfkeeper(Figure(bulk=1.05), animate=False)
    BS.seat_rider(B, F)
    B.animate(gait='bound', attack='bite')
    F.animate(attack=None, mounted=True)
    sylvan.spear_thrust(F, mounted=True)
    return F


def barksentinel():
    import woodguard
    return woodguard.build('barksentinel')


def shifter_warrior():
    """A bark-armored spear warrior in a great leaf cloak, amber eyes, vine markings (sheet 16)."""
    F = Figure(bulk=1.12)
    cloth_legs(F, pants=WD.BARK_D, boots=WD.BARK_D, wraps=WD.BARK)
    torso(F, WD.BARK_D, belt=WD.BARK_D, buckle=AMBER)
    WD.bark_plates(F, seed=12)
    WD.sash(F, 0.05)
    cloth_arms(F, WD.BARK, skin='#d8a67a', glove=WD.BARK_D, bracer=WD.BARK_D)
    for s in 'RL':
        # Glowing green vine markings on the forearms.
        x = arm_x(F, s) * 1.05
        curve_tube(f'vine.{s}', [(x, -0.04, SHOULDER - ELBOW_DROP - 0.01), (x + (0.03 if s == 'L' else -0.03), -0.045, SHOULDER - 0.22), (x, -0.04, SHOULDER - WRIST_DROP + 0.04)], 0.006, mat('glow', '#7dff5a'), F[f'forearm.{s}'], taper=[0.5, 1.0, 0.5])
    face(F, skin='#d8a67a', hair='#2a1a14', brows='#1e1410', eyes=AMBER, hair_style='long')
    h = F['head']
    for sx in (-1, 1):
        sphere(f'eyeGlow{sx}', 0.007, mat('glow', AMBER), h, at=(sx * 0.032, -0.083, HEAD + 0.012))
    leaf_ring('circlet', h, (0, 0.0, HEAD + 0.06), 0.09, 7, 0.035, 0.07, WD.LEAVES, tilt=1.4)
    # The great leaf cloak: a mantle and a ragged leafy cape to the calves.
    WD.leaf_mantle(F, 1.25)
    cape(F, WD.LEAF_D, w=0.34, h=0.55, ragged=0.06, seed=21)
    for i in range(7):
        t = i / 6
        leaf(f'capeLeaf{i}', F['chest'], (-0.12 + t * 0.24, 0.16, 0.42 + (i % 2) * 0.06), 0.06, 0.12, WD.LEAVES[i % 3], rot=(-0.3, 0, -0.3 + t * 0.6))
    # The spear: a long haft wound with vine, a barbed leaf blade.
    hd, (hx, hy, hz) = held(F, 'R')
    tilt = 1.2  # held nearly upright
    def along(d):
        return (hx, hy - math.cos(tilt) * d, hz + math.sin(tilt) * d)
    tube('spear', 0.015, 0.018, 1.15, mat('matte', WD.BARK_D), hd, at=along(-0.4), rot=(-(math.pi / 2 - tilt), 0, 0), segs=8)
    extrude('spearHead', [(-0.04, 0.0), (0.04, 0.0), (0.03, 0.05), (0.05, 0.07), (0.015, 0.12), (0.0, 0.22), (-0.015, 0.12), (-0.05, 0.07), (-0.03, 0.05)], 0.014, mat('metal', '#cfd8c6'), hd, at=along(0.74), rot=(math.pi / 2 + tilt, 0, 0), bevel=0.004)
    for i in range(3):
        leaf(f'spearLeaf{i}', hd, along(0.7), 0.04, 0.08, WD.LEAVES[i], rot=(0.4, 0, i * 2.1))
    F.animate(attack='staff', cast=True)
    return F


def shifter():
    import sylvan
    return sylvan.build('shifter')


def panther():
    import panther as PN
    return PN.panther()
