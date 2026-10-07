# -*- coding: utf-8 -*-
"""Rend un APERCU des affiches Depose, avant d'avoir la moindre capture.

Il sert a juger le TRAITEMENT (fond, trace, titres, cadre) sans attendre que
quelqu'un installe l'app. L'ecran pose dans le telephone est un gabarit gris
NEUTRE, barre d'un libelle explicite : on ne fabrique pas de fausse capture, et
rien ici ne doit atterrir sur une fiche Play.

    python play-store-assets/apercu-depose.py

Ecrit dans play-store-assets/apercu/. Ce dossier est jetable.
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image, ImageDraw

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
import captures as C

SORTIE = os.path.join(ICI, 'apercu')
os.makedirs(SORTIE, exist_ok=True)

# Le gabarit : un gris neutre, pour que seules les couleurs de l'AFFICHE soient
# jugees. Rapport 1080x2340, celui d'un telephone courant.
GW, GH = 1080, 2340


def gabarit():
    im = Image.new('RGB', (GW, GH), (31, 36, 42))
    d = ImageDraw.Draw(im)
    f = C.police('segoeui.ttf', 54)
    fb = C.police('segoeuib.ttf', 64)

    # Un rectangle en pointilles, bien au centre.
    x0, y0, x1, y1 = 90, GH // 2 - 320, GW - 90, GH // 2 + 320
    pas, trait = 36, 20
    for x in range(x0, x1, pas):
        d.line([(x, y0), (min(x + trait, x1), y0)], fill=(96, 106, 116), width=4)
        d.line([(x, y1), (min(x + trait, x1), y1)], fill=(96, 106, 116), width=4)
    for y in range(y0, y1, pas):
        d.line([(x0, y), (x0, min(y + trait, y1))], fill=(96, 106, 116), width=4)
        d.line([(x1, y), (x1, min(y + trait, y1))], fill=(96, 106, 116), width=4)

    for texte, font, dy, couleur in (
        ('APERÇU', fb, -70, (150, 162, 172)),
        ("l'écran réel", f, 20, (112, 124, 134)),
        ('vient ici', f, 90, (112, 124, 134)),
    ):
        l = d.textlength(texte, font=font)
        d.text(((GW - l) / 2, GH // 2 + dy), texte, font=font, fill=couleur)
    return im


def main():
    chemin = os.path.join(SORTIE, '_gabarit.png')
    gabarit().save(chemin, 'PNG')

    legendes = C.LEGENDES['depose']
    # Trois affiches suffisent a juger : un titre court, un titre long, et
    # celle qui n'a pas de seconde ligne.
    for n, i in enumerate((0, 2, 7), start=1):
        dst = os.path.join(SORTIE, 'depose-apercu-%d.png' % n)
        C.habille(chemin, legendes[i], dst, index=i + 1, total=8,
                  charte=C.CHARTES['depose'])
        print('  %s   « %s %s »' % (os.path.basename(dst),
                                    legendes[i][0], legendes[i][1]))

    # Le meme, avec la charte Linky : c'est la COMPARAISON qui dit si les deux
    # fiches se distinguent assez.
    dst = os.path.join(SORTIE, 'comparaison-charte-linky.png')
    C.habille(chemin, legendes[0], dst, index=1, total=8,
              charte=C.CHARTES['linky'])
    print('  %s   (meme legende, charte Linky)' % os.path.basename(dst))
    print('\nApercu dans %s' % SORTIE)


if __name__ == '__main__':
    main()
