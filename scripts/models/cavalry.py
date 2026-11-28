"""Crown cavalry (sheet 02): the Lancer on a barded destrier."""
import beasts as BS
import horse as HS
import knight as KN
import sylvan as SY
from figure import Figure


def lancer():
    B = HS.horse()
    F = KN.build('lancer', Figure(bulk=1.12), animate=False)
    BS.seat_rider(B, F)
    for s, sx in (('R', -1), ('L', 1)):
        F[f'thigh.{s}'].rotation_euler = (-1.3, sx * 0.5, 0)
        F[f'shin.{s}'].rotation_euler = (1.4, 0, 0)
    B.animate(gait='trot', attack='rear')
    F.animate(attack=None, mounted=True)
    SY.spear_thrust(F, mounted=True)
    return F
