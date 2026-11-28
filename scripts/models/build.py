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
import musketeer  # noqa: E402
import crown_buildings as CBL  # noqa: E402
import wild_buildings as WBL  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'public', 'models')

MODELS = {
    'guard': crown.guard,
    'worker': lambda: __import__('workers').laborer(),
    'archer': lambda: __import__('archer').archer(),
    'cleric': lambda: __import__('support').cleric(),
    'lancer': lambda: __import__('cavalry').lancer(),
    'outrider': lambda: __import__('support').outrider(),
    'mangonel': crown.mangonel,
    'hero': lambda: __import__('heroes').marshal(),
    'ranger': lambda: __import__('heroes').pathfinder(),
    'sage': lambda: __import__('heroes').sage(),
    'tender': lambda: __import__('workers').tender(),
    'thornguard': lambda: __import__('woodguard').build('thornguard'),
    'slinger': lambda: __import__('thornfolk').slinger(),
    'fox': lambda: __import__('forest').fox(),
    'stagrider': lambda: __import__('forest').stagrider(),
    'mender': lambda: __import__('thornfolk').mender(),
    'rootcrusher': lambda: __import__('treant').rootcrusher(),
    'warden': lambda: __import__('heroes').warden(),
    'huntress': lambda: __import__('heroes').huntress(),
    'speaker': lambda: __import__('heroes').speaker(),
    'brigand': lambda: __import__('outlaws').brigand(),
    'poacher': lambda: __import__('outlaws').poacher(),
    'chief': lambda: __import__('outlaws').chief(),
    'brute': lambda: __import__('outlaws').brute(),
    'wolf': lambda: __import__('outlaws').dire_wolf(),
    # Elite units (sheet 16).
    'musketeer': musketeer.musketeer,
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
        # Triangle budgets: armies of a hundred units must stay light; buildings are few.
        budget = int(os.environ.get('BUDGET', 0)) or (45000 if n.startswith('b_') else 16000)
        before, after = blib.export(path, budget)
        print(n, os.path.getsize(path), 'bytes', f'{before} -> {after} tris')
