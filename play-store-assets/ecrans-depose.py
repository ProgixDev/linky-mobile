# -*- coding: utf-8 -*-
"""Rend des ecrans de Depose FIDELES a l'application, faute de telephone.

POURQUOI CE FICHIER EXISTE — et ce qu'il n'est pas.

Personne n'a pu installer Depose pour en faire des captures, et une fiche Play
sans visuel ne part pas. Ces ecrans sont donc DESSINES. Pour qu'ils restent des
representations honnetes et non une fiction marketing, chaque valeur vient du
code de l'app, relevee le 2026-10-07 :

  couleurs      src/shared/theme/colors.ts
  typographie   src/shared/ui/text.tsx     (display 30, title 20, body 16,
                                            label 14 medium, caption 14 muted)
  carte         src/shared/ui/card.tsx     (bord filet ink-faint/15, p-4)
  bouton        src/shared/ui/button.tsx   (h-12, primary brand-600, secondary
                                            brand-50 / texte brand-700)
  libelles      deliveries-screen.tsx, delivery-row.tsx,
                delivery-detail-screen.tsx, qr-scanner.tsx

⚠ A REMPLACER par de vraies captures des que l'app tourne sur un appareil.
Google demande que les visuels d'une fiche representent l'app reelle ; un rendu
fidele d'ecrans qui existent vraiment s'en approche, une capture le prouve.

⚠ AUCUNE donnee reelle : noms, references et adresses sont inventes, et les
numeros de telephone sont absents. Meme regle que captures.py.

    python play-store-assets/ecrans-depose.py

Ecrit des PNG 1080x2340 dans screenshots-source/depose/, prets pour captures.py.
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image, ImageDraw, ImageFont

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
SORTIE = os.path.join(RACINE, 'screenshots-source', 'depose')
FONTS = 'C:/Windows/Fonts/'

W, H = 1080, 2340
# 1080 px pour 390 pt de large : le facteur d'un telephone courant. Toutes les
# tailles du code (text-sm = 14, h-12 = 48...) passent par la.
S = W / 390.0

# captures.py rogne 3.8 % du haut pour retirer la barre d'etat d'un vrai
# telephone. On laisse donc une bande vide de cette hauteur : apres rognage, il
# ne reste que le contenu.
BANDE = int(H * 0.038)

C = {
    'brand50':  (232, 242, 238),
    'brand100': (207, 229, 221),
    'brand500': (14, 110, 85),
    'brand600': (10, 82, 64),
    'brand700': (8, 59, 45),
    'accent':   (232, 165, 61),
    'surface':  (255, 255, 255),
    'muted':    (248, 250, 252),
    'ink':      (15, 23, 42),
    'inkMuted': (100, 116, 139),
    'inkFaint': (148, 163, 184),
    'inverse':  (248, 250, 252),
    'success':  (31, 169, 113),
}


def px(pt):
    return int(round(pt * S))


def f(poids, pt):
    fichiers = {'r': 'segoeui.ttf', 'm': 'segoeui.ttf',
                'sb': 'seguisb.ttf', 'b': 'segoeuib.ttf'}
    nom = fichiers[poids]
    chemin = FONTS + nom
    if not os.path.exists(chemin):
        chemin = FONTS + 'segoeuib.ttf'
    return ImageFont.truetype(chemin, px(pt))


# Les cinq variantes de AppText, telles que text.tsx les declare.
DISPLAY = lambda: f('b', 30)
TITLE = lambda: f('sb', 20)
BODY = lambda: f('r', 16)
LABEL = lambda: f('sb', 14)
CAPTION = lambda: f('r', 14)


def coupe(d, texte, font, largeur):
    lignes, cour = [], ''
    for mot in texte.split():
        essai = (cour + ' ' + mot).strip()
        if d.textlength(essai, font=font) <= largeur:
            cour = essai
        else:
            if cour:
                lignes.append(cour)
            cour = mot
    if cour:
        lignes.append(cour)
    return lignes


def tronque(d, texte, font, largeur):
    if d.textlength(texte, font=font) <= largeur:
        return texte
    while texte and d.textlength(texte + '…', font=font) > largeur:
        texte = texte[:-1]
    return texte + '…'


def ecran():
    im = Image.new('RGB', (W, H), C['surface'])
    return im, ImageDraw.Draw(im)


def carte(d, x, y, w, h, fond=None):
    """Card : coins arrondis, bord filet ink-faint a 15 %, pas d'ombre."""
    d.rounded_rectangle([x, y, x + w, y + h], radius=px(16),
                        fill=fond or C['surface'],
                        outline=(214, 220, 228), width=max(1, px(0.5)))


def bouton(d, x, y, w, libelle, variante='primary'):
    """Button : h-12, rounded-control. Rend la hauteur consommee."""
    h = px(48)
    fonds = {'primary': C['brand600'], 'secondary': C['brand50'],
             'ghost': None, 'destructive': (209, 79, 60)}
    textes = {'primary': C['inverse'], 'secondary': C['brand700'],
              'ghost': C['brand600'], 'destructive': C['inverse']}
    if fonds[variante]:
        d.rounded_rectangle([x, y, x + w, y + h], radius=px(12),
                            fill=fonds[variante])
    font = LABEL()
    l = d.textlength(libelle, font=font)
    d.text((x + (w - l) / 2, y + (h - font.size) / 2 - px(1)), libelle,
           font=font, fill=textes[variante])
    return h


def pastille(d, x, y, texte, fond, couleur):
    """Le badge de statut de delivery-row : rounded-full px-2 py-0.5."""
    font = CAPTION()
    l = d.textlength(texte, font=font)
    w, h = l + px(16), font.size + px(8)
    d.rounded_rectangle([x, y, x + w, y + h], radius=h // 2, fill=fond)
    d.text((x + px(8), y + px(3)), texte, font=font, fill=couleur)
    return w


def vignette(d, x, y, taille, teinte):
    """Le carre 56x56 de la photo d'article. Sans photo reelle : un aplat doux
    avec une silhouette de colis, pour ne rien faire passer pour une vraie
    photo de produit."""
    d.rounded_rectangle([x, y, x + taille, y + taille], radius=px(12),
                        fill=teinte)
    m = taille * 0.26
    d.rounded_rectangle([x + m, y + m, x + taille - m, y + taille - m],
                        radius=px(3), outline=(255, 255, 255), width=px(1.6))
    d.line([(x + m, y + taille / 2), (x + taille - m, y + taille / 2)],
           fill=(255, 255, 255), width=px(1.6))


# ── Les donnees affichees. Inventees, et volontairement invraisemblables en
#    tant qu'identites : prenoms courants, quartiers reels de Conakry, aucune
#    adresse exacte, aucun numero.
COURSES = [
    ('LNK-4821', 'Sac de riz 25 kg', 'Boutique Kaloum', 'Conakry · Matam',
     'En cours', '1 h 12', True),
    ('LNK-4819', 'Ventilateur sur pied', 'Électro Madina', 'Conakry · Ratoma',
     'Assignée', '2 h 40', False),
    ('LNK-4815', 'Carton de savon', 'Grossiste Taouyah', 'Conakry · Dixinn',
     'Assignée', '3 h 05', False),
    ('LNK-4810', 'Téléphone Tecno Spark', 'Phone Store GN', 'Conakry · Kaloum',
     'Assignée', '4 h 30', False),
    ('LNK-4806', 'Cuisinière 4 feux', 'Maison Bambeto', 'Conakry · Ratoma',
     'Assignée', '5 h 15', False),
    ('LNK-4803', 'Rouleau de tissu', 'Tissus Madina', 'Conakry · Matoto',
     'Assignée', '6 h 00', False),
]

TERMINEES = [
    ('LNK-4802', 'Bidon d\u2019huile 20 L', 'Alimentation Hamdallaye',
     'Conakry · Ratoma', 'Livrée', 'il y a 2 h', False),
    ('LNK-4797', 'Matelas 1 place', 'Meubles Cosa', 'Conakry · Matoto',
     'Livrée', 'il y a 5 h', False),
    ('LNK-4791', 'Groupe électrogène', 'Tech Kipé', 'Conakry · Ratoma',
     'Livrée', 'il y a 1 j', False),
    ('LNK-4788', 'Sacs de ciment ×4', 'Dépôt Sonfonia', 'Conakry · Matoto',
     'Livrée', 'il y a 1 j', False),
    ('LNK-4780', 'Chaises plastique ×6', 'Bazar Kipé', 'Conakry · Ratoma',
     'Livrée', 'il y a 2 j', False),
    ('LNK-4772', 'Bouteille de gaz', 'Gaz Taouyah', 'Conakry · Dixinn',
     'Livrée', 'il y a 2 j', False),
]

TEINTES = [(222, 234, 229), (240, 233, 219), (226, 232, 240), (231, 238, 234)]


def liste(filtre_actif, courses, compte):
    im, d = ecran()
    y = BANDE + px(14)
    x = px(20)
    dispo = W - x * 2

    d.text((x, y), 'Mes livraisons', font=DISPLAY(), fill=C['ink'])
    y += px(38)
    d.text((x, y), compte, font=CAPTION(), fill=C['inkMuted'])
    y += px(30)

    # TextField de recherche
    h = px(48)
    d.rounded_rectangle([x, y, x + dispo, y + h], radius=px(12),
                        fill=C['muted'], outline=(226, 232, 240), width=px(1))
    d.text((x + px(16), y + px(14)), 'Rechercher une livraison (réf, ville…)',
           font=BODY(), fill=C['inkFaint'])
    y += h + px(14)

    # Les puces de filtre, dans l'ordre de FILTERS
    cx = x
    for libelle in ('À récupérer', 'En cours', 'Urgent', 'Aujourd’hui', 'Terminées'):
        font = LABEL()
        l = d.textlength(libelle, font=font)
        w = l + px(26)
        if cx > W:
            break
        actif = libelle == filtre_actif
        d.rounded_rectangle([cx, y, cx + w, y + px(36)], radius=px(18),
                            fill=C['brand600'] if actif else C['muted'],
                            outline=None if actif else (226, 232, 240),
                            width=px(1))
        d.text((cx + px(13), y + px(9)), libelle, font=font,
               fill=C['inverse'] if actif else C['inkMuted'])
        cx += w + px(8)
    y += px(36) + px(18)

    # Les lignes
    for i, (ref, titre, boutique, zone, statut, droite, transit) in enumerate(courses):
        hc = px(104)
        carte(d, x, y, dispo, hc)
        vx, vy = x + px(14), y + px(14)
        vignette(d, vx, vy, px(56), TEINTES[i % len(TEINTES)])

        tx = vx + px(56) + px(12)
        tw = x + dispo - px(14) - tx
        ty = y + px(13)

        fc = CAPTION()
        d.text((tx, ty), ref, font=fc, fill=C['inkMuted'])
        lr = d.textlength(droite, font=fc)
        d.text((tx + tw - lr, ty), droite, font=fc,
               fill=C['ink'] if transit else C['inkFaint'])
        ty += px(20)

        d.text((tx, ty), tronque(d, titre, LABEL(), tw), font=LABEL(), fill=C['ink'])
        ty += px(20)
        d.text((tx, ty), tronque(d, boutique, fc, tw), font=fc, fill=C['inkMuted'])
        ty += px(22)

        lp = d.textlength(statut, font=fc) + px(16)
        d.text((tx, ty + px(3)), tronque(d, zone, fc, tw - lp - px(8)),
               font=fc, fill=C['inkMuted'])
        pastille(d, tx + tw - lp, ty,
                 statut,
                 C['brand50'] if transit else C['muted'],
                 C['brand700'] if transit else C['inkMuted'])

        y += hc + px(12)
        if y > H - px(60):
            break
    return im


def detail():
    im, d = ecran()
    x = px(20)
    dispo = W - x * 2
    y = BANDE + px(14)

    # Barre de navigation : une fleche de retour et le titre de la route.
    d.text((x, y + px(2)), '‹', font=f('b', 30), fill=C['ink'])
    d.text((x + px(30), y + px(8)), 'Livraison', font=TITLE(), fill=C['ink'])
    y += px(52)

    # Carte 1 : l'article
    hc = px(96)
    carte(d, x, y, dispo, hc)
    vignette(d, x + px(14), y + px(14), px(56), TEINTES[0])
    tx = x + px(14) + px(56) + px(12)
    ty = y + px(18)
    d.text((tx, ty), 'LNK-4821', font=CAPTION(), fill=C['inkMuted'])
    ty += px(22)
    d.text((tx, ty), 'Sac de riz 25 kg', font=LABEL(), fill=C['ink'])
    ty += px(22)
    d.text((tx, ty), '450 000 GNF', font=CAPTION(), fill=C['inkMuted'])
    y += hc + px(14)

    # Carte 2 : le lieu de livraison
    hc = px(248)
    carte(d, x, y, dispo, hc)
    cy = y + px(16)
    cx = x + px(16)
    d.text((cx, cy), '📍 Lieu de livraison', font=LABEL(), fill=C['ink'])
    cy += px(28)
    d.text((cx, cy), 'Client', font=CAPTION(), fill=C['inkMuted'])
    cy += px(20)
    d.text((cx, cy), 'Mariama D.', font=BODY(), fill=C['ink'])
    cy += px(28)
    d.text((cx, cy), 'Adresse de livraison', font=CAPTION(), fill=C['inkMuted'])
    cy += px(20)
    d.text((cx, cy), 'Immeuble Kania, 3ᵉ étage', font=BODY(), fill=C['inkMuted'])
    cy += px(22)
    d.text((cx, cy), 'Conakry · Matam', font=BODY(), fill=C['inkMuted'])
    cy += px(30)
    bouton(d, cx, cy, dispo - px(32), 'Voir l’itinéraire', 'secondary')
    y += hc + px(16)

    # La ligne de statut
    fc = CAPTION()
    d.text((x, y), 'Statut', font=fc, fill=C['inkMuted'])
    d.text((x + d.textlength('Statut', font=fc) + px(8), y), 'En cours',
           font=fc, fill=C['ink'])

    # Les actions, en bas
    by = H - px(20) - px(48) * 3 - px(12) * 2
    bouton(d, x, by, dispo, 'Scanner la livraison', 'primary')
    by += px(48) + px(12)
    bouton(d, x, by, dispo, 'J’ai récupéré le colis', 'secondary')
    by += px(48) + px(12)
    bouton(d, x, by, dispo, 'Signaler un problème', 'ghost')
    return im


def scanner():
    """L'ecran de scan : le flux camera est remplace par un aplat sombre.

    On ne simule PAS une scene filmee — ce serait inventer ce que la camera
    voit. Le cadre de visee, la pastille et la barre du bas sont ceux du code."""
    im = Image.new('RGB', (W, H), (26, 30, 36))
    d = ImageDraw.Draw(im)

    # Un degrade tres leger, pour que l'aplat ne soit pas mort.
    for yy in range(H):
        u = yy / H
        d.line([(0, yy), (W, yy)],
               fill=(int(26 + 10 * u), int(30 + 10 * u), int(36 + 10 * u)))

    # Le viseur : 256x256 (h-64 w-64), coins de 36 (h-9 w-9), trait de 4.
    cote = px(256)
    cx = (W - cote) // 2
    cy = (H - cote) // 2 - px(40)
    b, t, r = px(36), px(4), px(16)
    blanc = (255, 255, 255)

    # Les quatre equerres sont decoupees dans UN rectangle arrondi complet.
    #
    # Les dessiner piece par piece (deux lignes + un arc) ne marche pas : PIL
    # epaissit un arc VERS L'INTERIEUR de sa boite, alors qu'une ligne est
    # centree sur son trace. Les deux traits se raccordent donc avec un
    # decalage d'une demi-epaisseur, visible a l'oeil nu. En partant d'un
    # rectangle arrondi, la geometrie est juste par construction.
    cadre = Image.new('RGBA', (cote + t * 2, cote + t * 2), (0, 0, 0, 0))
    ImageDraw.Draw(cadre).rounded_rectangle(
        [t // 2, t // 2, cote + t + t // 2, cote + t + t // 2],
        radius=r + t // 2, outline=blanc + (255,), width=t)

    masque = Image.new('L', cadre.size, 0)
    md = ImageDraw.Draw(masque)
    cw = b + t
    for (mx, my) in ((0, 0), (cadre.size[0] - cw, 0),
                     (0, cadre.size[1] - cw), (cadre.size[0] - cw, cadre.size[1] - cw)):
        md.rectangle([mx, my, mx + cw, my + cw], fill=255)
    cadre.putalpha(Image.composite(cadre.getchannel('A'),
                                   Image.new('L', cadre.size, 0), masque))
    im.paste(cadre, (cx - t, cy - t), cadre)
    d = ImageDraw.Draw(im)

    # La pastille d'aide : bg-ink/70, texte inverse, mt-6
    font = LABEL()
    texte = 'Scanne le QR du client'
    l = d.textlength(texte, font=font)
    pw, ph = l + px(32), font.size + px(20)
    pxx, pyy = (W - pw) // 2, cy + cote + px(24)
    calque = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(calque).rounded_rectangle(
        [pxx, pyy, pxx + pw, pyy + ph], radius=ph // 2, fill=C['ink'] + (179,))
    im.paste(Image.alpha_composite(im.convert('RGBA'), calque).convert('RGB'), (0, 0))
    d = ImageDraw.Draw(im)
    d.text((pxx + px(16), pyy + px(9)), texte, font=font, fill=C['inverse'])

    # La barre du bas : bg-surface/95, p-5, un bouton ghost « Annuler »
    hb = px(20) * 2 + px(48)
    d.rectangle([0, H - hb, W, H], fill=(252, 253, 254))
    bouton(d, px(20), H - hb + px(20), W - px(40), 'Annuler', 'ghost')
    return im


def main():
    os.makedirs(SORTIE, exist_ok=True)
    ecrans = [
        ('1.png', lambda: liste('En cours', COURSES, '6 livraisons')),
        ('2.png', detail),
        ('3.png', scanner),
        ('4.png', lambda: liste('Terminées', TERMINEES, '6 livraisons')),
    ]
    for nom, rendu in ecrans:
        chemin = os.path.join(SORTIE, nom)
        rendu().save(chemin, 'PNG', optimize=True)
        print('  %s' % chemin)
    print('\n%d ecran(s). Lance maintenant :\n  python play-store-assets/captures.py'
          % len(ecrans))


if __name__ == '__main__':
    main()
