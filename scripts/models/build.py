"""Build unit models as .glb files into public/models/.

    pip install bpy
    python3 scripts/models/build.py            # every model
    python3 scripts/models/build.py guard      # some
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blib  # noqa: E402
import crown  # noqa: E402
import wild  # noqa: E402
import neutral  # noqa: E402
import elite  # noqa: E402
import crown_buildings as CBL  # noqa: E402
import wild_buildings as WBL  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'public', 'models')

MODELS = {
    'guard': crown.guard,
    'worker': crown.laborer,
    'archer': crown.archer,
    'cleric': crown.cleric,
    'lancer': crown.lancer,
    'outrider': crown.outrider,
    'mangonel': crown.mangonel,
    'hero': crown.marshal,
    'ranger': crown.pathfinder,
    'sage': crown.sage,
    'tender': wild.tender,
    'thornguard': wild.thornguard,
    'slinger': wild.slinger,
    'fox': wild.fox,
    'stagrider': wild.stagrider,
    'mender': wild.mender,
    'rootcrusher': wild.rootcrusher,
    'warden': wild.thorn_warden,
    'huntress': wild.huntress,
    'speaker': wild.grove_speaker,
    'brigand': neutral.brigand,
    'poacher': neutral.poacher,
    'chief': neutral.chief,
    'brute': neutral.brute,
    'wolf': neutral.wolf,
    # Elite units (sheet 16).
    'musketeer': elite.musketeer,
    'warbear': elite.warbear,
    'sentinel': elite.sentinel,
    'bearwarden': elite.bearwarden,
    'bearrider': elite.bearrider,
    'naturewolf': elite.naturewolf,
    'barksentinel': elite.barksentinel,
    'wolfkeeper': elite.wolfkeeper,
    'wolfrider': elite.wolfrider,
    'shifter': elite.shifter,
    'panther': elite.panther,
    # Buildings: b_<type>, with tiers as b_<type>_<tier>.
    'b_hq': CBL.keep,
    'b_hq_2': lambda: CBL.keep(2),
    'b_hq_3': lambda: CBL.keep(3),
    'b_farm': CBL.farm,
    'b_barracks': CBL.barracks,
    'b_lumbermill': CBL.lumbermill,
    'b_tower': CBL.tower,
    'b_altar': CBL.altar,
    'b_smithy': CBL.smithy,
    'b_chapel': CBL.chapel,
    'b_workshop': CBL.workshop,
    'b_shop': CBL.shop,
    'b_fountain': CBL.fountain,
    'm_tiny': lambda: CBL.mine('tiny'),
    'm_small': lambda: CBL.mine('small'),
    'm_start': lambda: CBL.mine('start'),
    'm_standard': lambda: CBL.mine('standard'),
    'm_rich': lambda: CBL.mine('rich'),
    'm_depleted': lambda: CBL.mine('depleted'),
    'b_heartwood': WBL.heartwood,
    'b_heartwood_2': lambda: WBL.heartwood(2),
    'b_heartwood_3': lambda: WBL.heartwood(3),
    'b_grove': WBL.grove,
    'b_saplodge': WBL.saplodge,
    'b_den': WBL.den,
    'b_spire': WBL.spire,
    'b_circle': WBL.circle,
    'b_barkweaver': WBL.barkweaver,
    'b_moonwell': WBL.moonwell,
    'b_rootpit': WBL.rootpit,
}

if __name__ == '__main__':
    names = sys.argv[1:] or list(MODELS)
    os.makedirs(OUT, exist_ok=True)
    for n in names:
        blib.reset()
        blib._mats.clear()
        MODELS[n]()
        path = os.path.join(OUT, f'{n}.glb')
        blib.export(path)
        print(n, os.path.getsize(path), 'bytes')
