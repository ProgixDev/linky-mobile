# -*- coding: utf-8 -*-
"""
Regenere les visuels Play Store des deux applications.

    python play-store-assets/generer.py

Produit, dans ce meme dossier :
    linky-icone-512.png            depose-icone-512.png
    linky-banniere-1024x500.png    depose-banniere-1024x500.png

Sources : les icones DE L'APPLICATION (app-mobile et driver-app). Si le logo
change, il suffit de rejouer ce script.

Contraintes de Play respectees ici :
  - icone 512x512, PNG, SANS canal alpha (Play refuse la transparence) ;
  - banniere 1024x500 exactement ;
  - le texte reste loin des bords : Google recadre la banniere sur certaines
    surfaces, et ce qui touche le bord se fait couper.

Depend de Pillow. Les polices sont celles de Windows (Segoe UI) : l'application
tourne sur les polices systeme en V1, il n'y a donc pas de fonte de marque a
respecter.
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image, ImageDraw, ImageFont

RACINE = 'C:/Users/Omen/Documents/projects/linky/linky-mobile'
SORTIE = RACINE + '/play-store-assets'
os.makedirs(SORTIE, exist_ok=True)

FONTS = 'C:/Windows/Fonts/'


def police(nom, taille):
    return ImageFont.truetype(FONTS + nom, taille)


# ── 1. LES ICONES 512x512 ──────────────────────────────────────────────────
# Play exige 512x512, PNG 32 bits, SANS transparence. Les deux sources sont
# deja opaques (verifie) : un simple reechantillonnage LANCZOS suffit, et on
# force le mode RGB pour qu'aucun canal alpha ne subsiste dans le fichier.
def icone(src, dst):
    im = Image.open(RACINE + '/' + src).convert('RGB')
    im = im.resize((512, 512), Image.LANCZOS)
    im.save(SORTIE + '/' + dst, 'PNG', optimize=True)
    ko = os.path.getsize(SORTIE + '/' + dst) / 1024
    print('  %-28s 512x512 RGB  %.0f Ko' % (dst, ko))


print('ICONES')
icone('app-mobile/assets/images/icon.png', 'linky-icone-512.png')
icone('driver-app/assets/images/icon.png', 'depose-icone-512.png')


# ── 2. LES BANNIERES 1024x500 ──────────────────────────────────────────────
# Le degrade est celui de la carte du portefeuille dans l'app : c'est le seul
# endroit ou la marque est deja posee en couleurs, autant que la fiche du
# magasin lui ressemble.
VERT_CLAIR = (17, 136, 102)
VERT = (10, 82, 64)
VERT_SOMBRE = (6, 57, 41)
SAFRAN = (232, 165, 61)


def degrade(w, h):
    """Diagonale clair -> sombre, comme LinearGradient start(0,0) end(1,1)."""
    im = Image.new('RGB', (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            t = (x / w + y / h) / 2.0
            if t < 0.5:
                u = t / 0.5
                a, b = VERT_CLAIR, VERT
            else:
                u = (t - 0.5) / 0.5
                a, b = VERT, VERT_SOMBRE
            px[x, y] = (int(a[0] + (b[0] - a[0]) * u),
                        int(a[1] + (b[1] - a[1]) * u),
                        int(a[2] + (b[2] - a[2]) * u))
    return im


def halo(im, cx, cy, r, couleur, force):
    """Une tache douce, comme les blobs de la carte. Dessinee en petit puis
       agrandie : c'est ce qui lui donne son flou sans filtre de flou."""
    P = 64
    m = Image.new('L', (P, P), 0)
    d = ImageDraw.Draw(m)
    for i in range(P // 2, 0, -1):
        v = int(force * 255 * (1 - i / (P / 2)) ** 2)
        d.ellipse([P // 2 - i, P // 2 - i, P // 2 + i, P // 2 + i], fill=v)
    m = m.resize((r * 2, r * 2), Image.LANCZOS)
    couche = Image.new('RGB', (r * 2, r * 2), couleur)
    im.paste(couche, (cx - r, cy - r), m)


def banniere(dst, titre, sous_titre, icone_src):
    W, H = 1024, 500
    im = degrade(W, H)
    halo(im, W - 120, 60, 220, SAFRAN, 0.30)
    halo(im, 40, H - 40, 240, (120, 220, 180), 0.16)

    # L'icone a gauche, en CARRE ARRONDI et non en rond : le rond coupait la
    # pastille « 24h/7 » de l'icone Depose, qui est dessinee dans un coin. Le
    # carre arrondi preserve tout le dessin, et c'est de toute facon la forme
    # sous laquelle une icone d'application se reconnait.
    T = 200
    ic = Image.open(RACINE + '/' + icone_src).convert('RGB').resize((T, T), Image.LANCZOS)
    S = 4  # on dessine en grand puis on reduit : c'est ce qui lisse le contour
    masque = Image.new('L', (T * S, T * S), 0)
    ImageDraw.Draw(masque).rounded_rectangle(
        [0, 0, T * S - 1, T * S - 1], radius=int(T * S * 0.22), fill=255)
    masque = masque.resize((T, T), Image.LANCZOS)
    im.paste(ic, (78, (H - T) // 2), masque)

    d = ImageDraw.Draw(im)
    x = 78 + 190 + 54
    f_titre = police('segoeuib.ttf', 62)
    f_sous = police('segoeui.ttf', 27)

    # Le titre peut deborder : on reduit jusqu'a ce qu'il tienne, plutot que de
    # le laisser sortir du cadre.
    dispo = W - x - 70
    while d.textlength(titre, font=f_titre) > dispo and f_titre.size > 30:
        f_titre = police('segoeuib.ttf', f_titre.size - 2)

    # Le sous-titre se coupe en lignes sur la largeur restante.
    mots, lignes, cour = sous_titre.split(), [], ''
    for m in mots:
        essai = (cour + ' ' + m).strip()
        if d.textlength(essai, font=f_sous) <= dispo:
            cour = essai
        else:
            lignes.append(cour); cour = m
    if cour:
        lignes.append(cour)

    h_bloc = f_titre.size + 18 + len(lignes) * (f_sous.size + 9)
    y = (H - h_bloc) // 2
    d.text((x, y), titre, font=f_titre, fill=(255, 255, 255))
    y += f_titre.size + 20
    for l in lignes:
        d.text((x, y), l, font=f_sous, fill=(235, 245, 240))
        y += f_sous.size + 9

    im.save(SORTIE + '/' + dst, 'PNG', optimize=True)
    print('  %-28s 1024x500     %.0f Ko' % (dst, os.path.getsize(SORTIE + '/' + dst) / 1024))


print('BANNIERES')
banniere('linky-banniere-1024x500.png',
         'Linky',
         'Achetez, vendez et louez en Guinée. Paiement sécurisé, livraison suivie.',
         'app-mobile/assets/images/icon.png')
banniere('depose-banniere-1024x500.png',
         'Dépose',
         "L'application des livreurs Linky : courses, itinéraire et remise par QR.",
         'driver-app/assets/images/icon.png')

print()
print('Ecrits dans', SORTIE)
