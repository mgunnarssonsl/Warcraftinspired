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
