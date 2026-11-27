#!/usr/bin/env python3
"""Interface art from the style A design sheets ("warcraft-style-a 2/").

Cuts portraits and icons out of the sheets and writes small WebP files to
public/art/: unit portraits (u/), building portraits (b/), ability icons
(a/), item icons (i/), research icons (r/) and resource icons (res/).

Spell and item icons on the sheets are already framed squares and are used as
they are. Units, buildings and upgrades sit on parchment: they are cut out
(the parchment flood-filled away from the crop's edges), then set on a dark
backdrop inside a thin gold frame, so every icon in the game shares a look.

Needs Python 3 with Pillow, numpy and scipy:  python3 scripts/art_icons.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'warcraft-style-a 2')
OUT = os.path.join(ROOT, 'public', 'art')


def sheet(name):
    return Image.open(os.path.join(SRC, name)).convert('RGB')


def cut(img, box, tol=34):
    """Crop and remove the parchment connected to the crop's edges."""
    im = img.crop(box)
    a = np.asarray(im).astype(np.int32)
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    sat = a.max(-1) - a.min(-1)
    bgish = (d < tol) | ((a.mean(-1) > 185) & (sat < 40))
    lab, _ = ndimage.label(bgish)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    mask = np.isin(lab, list(edge))
    tight = (d < 16) & (sat < 30)
    lab3, n3 = ndimage.label(tight)
    if n3:
        sizes = ndimage.sum(tight, lab3, range(1, n3 + 1))
        mask |= np.isin(lab3, [i + 1 for i, s in enumerate(sizes) if s > 80])
    alpha = ndimage.binary_opening(~mask, iterations=1)
    lab2, n = ndimage.label(alpha)
    if n:
        sizes = ndimage.sum(alpha, lab2, range(1, n + 1))
        alpha = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s > 0.02 * sizes.max()])
    A = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    out = im.convert('RGBA')
    out.putalpha(A)
    bb = out.getbbox()
    return out.crop(bb) if bb else out


def backdrop(size, tint=(52, 40, 30)):
    """A dark radial backdrop with a thin gold frame."""
    bg = Image.new('RGBA', (size, size))
    px = bg.load()
    c = size / 2
    for y in range(size):
        for x in range(size):
            r = ((x - c) ** 2 + (y - c * 0.85) ** 2) ** 0.5 / (size * 0.75)
            k = max(0.0, 1 - r)
            px[x, y] = (int(tint[0] + 70 * k), int(tint[1] + 58 * k), int(tint[2] + 40 * k), 255)
    d = ImageDraw.Draw(bg)
    d.rectangle([1, 1, size - 2, size - 2], outline=(170, 132, 62, 255), width=2)
    d.rectangle([4, 4, size - 5, size - 5], outline=(60, 44, 26, 255), width=1)
    return bg


def framed(art, size, mode):
    """Set a cut-out on the backdrop: 'head' frames head and shoulders, 'fit' shows it whole."""
    bg = backdrop(size)
    w, h = art.size
    if mode == 'head':
        # Centre on the upper body: the widest part of the top third, roughly.
        a = np.asarray(art)[:, :, 3] > 40
        top = a[: max(1, int(h * 0.35))]
        cols = np.where(top.any(0))[0]
        cx = (cols.min() + cols.max()) / 2 if len(cols) else w / 2
        side = min(w, int(h * 0.62))
        x0 = int(max(0, min(w - side, cx - side / 2)))
        art = art.crop((x0, 0, x0 + side, side))
        art = art.resize((size - 8, size - 8), Image.LANCZOS)
        bg.alpha_composite(art, (4, 6))
    else:
        s = (size - 14) / max(w, h)
        art = art.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
        bg.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2 + 2))
    d = ImageDraw.Draw(bg)
    d.rectangle([1, 1, size - 2, size - 2], outline=(170, 132, 62, 255), width=2)
    return bg


def save(img, sub, name, size):
    os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    img = img.convert('RGB').resize((size, size), Image.LANCZOS) if img.size != (size, size) else img.convert('RGB')
    img.save(os.path.join(OUT, sub, f'{name}.webp'), 'WEBP', quality=82, method=6)


UNITS = {
    # unit type: (sheet, box, framing)
    'worker': ('02-ironvale-army.png', (95, 80, 370, 392), 'head'),
    'guard': ('02-ironvale-army.png', (470, 80, 785, 392), 'head'),
    'archer': ('02-ironvale-army.png', (875, 90, 1165, 392), 'head'),
    'outrider': ('02-ironvale-army.png', (1270, 85, 1605, 392), 'fit'),
    'lancer': ('02-ironvale-army.png', (80, 450, 610, 762), 'fit'),
    'cleric': ('02-ironvale-army.png', (700, 445, 985, 757), 'head'),
    'mangonel': ('02-ironvale-army.png', (1100, 445, 1600, 780), 'fit'),
    'hero': ('01-heroes.png', (10, 135, 335, 492), 'head'),
    'ranger': ('01-heroes.png', (565, 135, 830, 497), 'head'),
    'sage': ('01-heroes.png', (1040, 120, 1340, 472), 'head'),
    'warden': ('01-heroes.png', (10, 575, 362, 928), 'head'),
    'huntress': ('01-heroes.png', (550, 590, 818, 958), 'head'),
    'speaker': ('01-heroes.png', (1020, 580, 1332, 962), 'head'),
    'tender': ('03-thornwild-army.png', (85, 115, 332, 392), 'head'),
    'thornguard': ('03-thornwild-army.png', (395, 115, 762, 397), 'head'),
    'slinger': ('03-thornwild-army.png', (815, 115, 1112, 392), 'head'),
    'fox': ('03-thornwild-army.png', (1170, 115, 1482, 392), 'fit'),
    'stagrider': ('03-thornwild-army.png', (75, 455, 502, 812), 'fit'),
    'mender': ('03-thornwild-army.png', (585, 450, 882, 812), 'head'),
    'rootcrusher': ('03-thornwild-army.png', (945, 452, 1497, 817), 'fit'),
    'brigand': ('04-neutral-enemies.png', (40, 90, 450, 470), 'head'),
    'poacher': ('04-neutral-enemies.png', (520, 95, 930, 470), 'head'),
    'chief': ('04-neutral-enemies.png', (1000, 85, 1500, 475), 'head'),
    'wolf': ('04-neutral-enemies.png', (60, 620, 450, 930), 'fit'),
    'brute': ('04-neutral-enemies.png', (480, 550, 900, 945), 'head'),
}

BUILDINGS = {
    'hq': ('05-ironvale-buildings.png', (65, 62, 372, 332)),
    'castle': ('05-ironvale-buildings.png', (400, 62, 722, 332)),
    'citadel': ('05-ironvale-buildings.png', (770, 62, 1150, 332)),
    'farm': ('05-ironvale-buildings.png', (1180, 60, 1517, 332)),
    'barracks': ('05-ironvale-buildings.png', (25, 400, 367, 617)),
    'lumbermill': ('05-ironvale-buildings.png', (405, 400, 752, 617)),
    'tower': ('05-ironvale-buildings.png', (840, 375, 1082, 622)),
    'altar': ('05-ironvale-buildings.png', (1140, 380, 1517, 617)),
    'smithy': ('05-ironvale-buildings.png', (40, 690, 372, 952)),
    'chapel': ('05-ironvale-buildings.png', (420, 670, 690, 952)),
    'workshop': ('05-ironvale-buildings.png', (735, 690, 1150, 952)),
    'heartwood': ('06-thornwild-buildings.png', (30, 60, 362, 332)),
    'deepwood': ('06-thornwild-buildings.png', (400, 62, 750, 332)),
    'ancient': ('06-thornwild-buildings.png', (760, 62, 1170, 332)),
    'grove': ('06-thornwild-buildings.png', (1170, 90, 1507, 332)),
    'saplodge': ('06-thornwild-buildings.png', (40, 390, 370, 632)),
    'den': ('06-thornwild-buildings.png', (410, 390, 762, 632)),
    'spire': ('06-thornwild-buildings.png', (830, 380, 1092, 627)),
    'circle': ('06-thornwild-buildings.png', (1135, 390, 1517, 632)),
    'barkweaver': ('06-thornwild-buildings.png', (30, 685, 370, 942)),
    'moonwell': ('06-thornwild-buildings.png', (420, 685, 747, 942)),
    'rootpit': ('06-thornwild-buildings.png', (775, 695, 1150, 942)),
    'shop': ('07-mines-and-landmarks.png', (60, 670, 470, 952)),
    'fountain': ('07-mines-and-landmarks.png', (570, 670, 950, 952)),
    'goldmine': ('07-mines-and-landmarks.png', (30, 340, 472, 612)),
    'tree': ('08-trees-and-forest.png', (35, 78, 502, 342)),
}

# Framed square icons on the sheets: used as they are.
ABILITIES = {
    'hammer': ('11-crown-spells.png', (24, 174, 180, 333)),
    'cry': ('11-crown-spells.png', (537, 174, 691, 333)),
    'mend': ('11-crown-spells.png', (1042, 174, 1198, 333)),
    'volley': ('11-crown-spells.png', (24, 484, 170, 635)),
    'mark': ('11-crown-spells.png', (537, 485, 692, 640)),
    'farsight': ('11-crown-spells.png', (1040, 485, 1192, 640)),
    'flame': ('11-crown-spells.png', (24, 782, 180, 943)),
    'slow': ('11-crown-spells.png', (537, 782, 697, 943)),
    'ward': ('11-crown-spells.png', (1042, 782, 1203, 943)),
    'entangle': ('12-thornwild-spells.png', (30, 120, 220, 305)),
    'barkskin': ('12-thornwild-spells.png', (537, 120, 727, 305)),
    'howl': ('12-thornwild-spells.png', (1040, 120, 1225, 305)),
    'thornrain': ('12-thornwild-spells.png', (30, 412, 220, 605)),
    'snare': ('12-thornwild-spells.png', (537, 410, 727, 600)),
    'owl': ('12-thornwild-spells.png', (1040, 410, 1225, 600)),
    'swarm': ('12-thornwild-spells.png', (30, 712, 220, 905)),
    'wither': ('12-thornwild-spells.png', (537, 712, 727, 905)),
    'regrowth': ('12-thornwild-spells.png', (1040, 712, 1240, 905)),
}
ITEMS = {
    'blade': ('10-items-and-loot.png', (278, 254, 364, 340)),
    'mail': ('10-items-and-loot.png', (654, 254, 740, 340)),
    'charm': ('10-items-and-loot.png', (1024, 254, 1110, 340)),
    'draught': ('10-items-and-loot.png', (1412, 254, 1498, 340)),
    'tonic': ('10-items-and-loot.png', (276, 556, 362, 642)),
    'scroll': ('10-items-and-loot.png', (654, 556, 740, 642)),
    'salve': ('10-items-and-loot.png', (1032, 557, 1118, 643)),
    'boots': ('10-items-and-loot.png', (1414, 557, 1500, 643)),
    'gauntlets': ('10-items-and-loot.png', (292, 862, 378, 948)),
    'circlet': ('10-items-and-loot.png', (658, 862, 744, 948)),
}
# Upgrades sit on parchment: cut out and framed.
RESEARCH = {
    'weapons1': ('13-crown-upgrades.png', (40, 95, 300, 298)),
    'weapons2': ('13-crown-upgrades.png', (340, 95, 600, 298)),
    'weapons3': ('13-crown-upgrades.png', (640, 95, 905, 298)),
    'armor1': ('13-crown-upgrades.png', (940, 95, 1200, 298)),
    'armor2': ('13-crown-upgrades.png', (1235, 95, 1500, 298)),
    'armor3': ('13-crown-upgrades.png', (40, 375, 300, 600)),
    'saws': ('13-crown-upgrades.png', (340, 375, 600, 600)),
    'carts': ('13-crown-upgrades.png', (640, 375, 925, 600)),
    'longbows': ('13-crown-upgrades.png', (965, 375, 1225, 600)),
    'healing2': ('13-crown-upgrades.png', (1260, 375, 1500, 600)),
    'castle': ('13-crown-upgrades.png', (35, 675, 375, 945)),
    'citadel': ('13-crown-upgrades.png', (410, 675, 775, 945)),
    'thorns1': ('14-thornwild-upgrades.png', (100, 95, 500, 195)),
    'thorns2': ('14-thornwild-upgrades.png', (560, 75, 940, 195)),
    'thorns3': ('14-thornwild-upgrades.png', (1040, 70, 1450, 195)),
    'bark1': ('14-thornwild-upgrades.png', (150, 255, 440, 412)),
    'bark2': ('14-thornwild-upgrades.png', (620, 255, 920, 412)),
    'bark3': ('14-thornwild-upgrades.png', (1100, 250, 1400, 412)),
    'deeproots': ('14-thornwild-upgrades.png', (50, 465, 430, 602)),
    'sapflow': ('14-thornwild-upgrades.png', (470, 465, 770, 602)),
    'longthorn': ('14-thornwild-upgrades.png', (820, 465, 1130, 602)),
    'swiftgrowth': ('14-thornwild-upgrades.png', (1175, 460, 1490, 602)),
    'deepwood': ('14-thornwild-upgrades.png', (50, 660, 500, 868)),
    'ancient': ('14-thornwild-upgrades.png', (530, 660, 1020, 868)),
    'bloom': ('14-thornwild-upgrades.png', (1060, 660, 1490, 868)),
}
RESOURCES = {
    'gold': ('02-ironvale-army.png', (835, 820, 995, 915)),
    'wood': ('02-ironvale-army.png', (1175, 820, 1380, 915)),
}


def main():
    sheets = {}
    get = lambda n: sheets.setdefault(n, sheet(n))
    for name, (sh, box, mode) in UNITS.items():
        save(framed(cut(get(sh), box), 128, mode), 'u', name, 128)
    for name, (sh, box) in BUILDINGS.items():
        save(framed(cut(get(sh), box), 128, 'fit'), 'b', name, 128)
    for name, (sh, box) in ABILITIES.items():
        save(get(sh).crop(box), 'a', name, 96)
    for name, (sh, box) in ITEMS.items():
        save(get(sh).crop(box), 'i', name, 96)
    for name, (sh, box) in RESEARCH.items():
        save(framed(cut(get(sh), box), 96, 'fit'), 'r', name, 96)
    for name, (sh, box) in RESOURCES.items():
        art = cut(get(sh), box)
        os.makedirs(os.path.join(OUT, 'res'), exist_ok=True)
        art.thumbnail((56, 40), Image.LANCZOS)
        art.save(os.path.join(OUT, 'res', f'{name}.webp'), 'WEBP', quality=85, method=6)
    print('wrote', OUT)


if __name__ == '__main__':
    main()
