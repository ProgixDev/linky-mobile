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
    # L'app ecrit litteralement « 📍 Lieu de livraison » dans un AppText. Segoe
    # UI n'a pas l'epingle : sans la police emoji, elle sort en carre vide.
    try:
        f_emo = ImageFont.truetype(FONTS + 'seguiemj.ttf', px(14))
        d.text((cx, cy - px(1)), '📍', font=f_emo, embedded_color=True)
        avance = d.textlength('📍', font=f_emo) + px(6)
    except Exception:
        avance = 0
    d.text((cx + avance, cy), 'Lieu de livraison', font=LABEL(), fill=C['ink'])
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


def rond(d, cx, cy, r, fill, bord=None, ep=0):
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill,
              outline=bord, width=ep)


def carte_rue(w, h):
    """Un fond de plan stylise, dans les tons de Mapbox « Street » (clair).

    L'app affiche une VRAIE carte Mapbox. Ici elle est dessinee : on ne peut pas
    embarquer une tuile Mapbox dans une image de fiche sans son attribution, et
    reproduire une ville precise n'apporterait rien. Le trace est generique."""
    im = Image.new('RGB', (w, h), (240, 237, 230))
    d = ImageDraw.Draw(im)

    # Les ilots : des aplats a peine plus clairs que le fond.
    import random
    rng = random.Random(7)          # fige : la meme carte a chaque rendu
    for _ in range(26):
        bx = rng.randint(-60, w)
        by = rng.randint(-60, h)
        bw = rng.randint(px(60), px(150))
        bh = rng.randint(px(50), px(130))
        d.rounded_rectangle([bx, by, bx + bw, by + bh], radius=px(4),
                            fill=(247, 245, 240))

    # Un plan d'eau et un parc, pour que la carte ne soit pas un damier mort.
    d.rounded_rectangle([-px(40), int(h * 0.70), int(w * 0.40), h + px(40)],
                        radius=px(30), fill=(199, 221, 232))
    d.rounded_rectangle([int(w * 0.62), int(h * 0.12), w + px(40), int(h * 0.30)],
                        radius=px(26), fill=(214, 231, 211))

    # Les rues : un lisere sombre, puis le blanc par-dessus.
    axes = [('h', 0.16, px(16)), ('h', 0.40, px(22)), ('h', 0.63, px(14)),
            ('h', 0.86, px(18)), ('v', 0.20, px(18)), ('v', 0.48, px(22)),
            ('v', 0.78, px(14))]
    for sens, u, ep in axes:
        if sens == 'h':
            y = int(h * u)
            d.line([(0, y), (w, y)], fill=(227, 222, 212), width=ep + px(3))
            d.line([(0, y), (w, y)], fill=(255, 255, 255), width=ep)
        else:
            x = int(w * u)
            d.line([(x, 0), (x, h)], fill=(227, 222, 212), width=ep + px(3))
            d.line([(x, 0), (x, h)], fill=(255, 255, 255), width=ep)
    # Une diagonale, pour casser le damier.
    d.line([(-px(20), int(h * 0.30)), (w + px(20), int(h * 0.74))],
           fill=(227, 222, 212), width=px(17))
    d.line([(-px(20), int(h * 0.30)), (w + px(20), int(h * 0.74))],
           fill=(255, 255, 255), width=px(14))
    return im


def trace_route(d, points, couleur, ep):
    """Le trace de l'itineraire : un lisere blanc dessous, la ligne dessus."""
    d.line(points, fill=(255, 255, 255), width=ep + px(5), joint='curve')
    d.line(points, fill=couleur, width=ep, joint='curve')
    for p in (points[0], points[-1]):
        rond(d, p[0], p[1], (ep + px(5)) // 2, couleur)


def marqueur_livreur(d, cx, cy):
    """h-10 w-10, rond, bg-ink, bord blanc de 2, avec le scooter."""
    r = px(20)
    rond(d, cx, cy, r, C['ink'], (255, 255, 255), px(2))
    # Segoe UI n'a PAS le scooter : il sortait en carre vide. L'app affiche un
    # vrai emoji (<AppText>🛵</AppText>), donc on prend la police emoji.
    try:
        f_emo = ImageFont.truetype(FONTS + 'seguiemj.ttf', px(17))
        l = d.textlength('🛵', font=f_emo)
        d.text((cx - l / 2, cy - px(11)), '🛵', font=f_emo,
               embedded_color=True)
    except Exception:
        rond(d, cx, cy, px(6), (255, 255, 255))


def epingle(d, cx, cy, couleur):
    """Une epingle de destination : goutte + pastille claire."""
    r = px(15)
    d.polygon([(cx - r * 0.72, cy - r * 0.1), (cx + r * 0.72, cy - r * 0.1),
               (cx, cy + r * 1.5)], fill=couleur)
    rond(d, cx, cy - r * 0.35, r, couleur, (255, 255, 255), px(2))
    rond(d, cx, cy - r * 0.35, px(5), (255, 255, 255))


def icone_horloge(d, cx, cy, r, couleur, ep):
    """lucide Clock : un cercle et deux aiguilles."""
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=couleur, width=ep)
    d.line([(cx, cy), (cx, cy - r * 0.55)], fill=couleur, width=ep)
    d.line([(cx, cy), (cx + r * 0.42, cy + r * 0.18)], fill=couleur, width=ep)


def icone_navigation(d, cx, cy, r, couleur):
    """lucide Navigation : un cerf-volant pointe vers le haut-droit."""
    d.polygon([(cx + r, cy - r), (cx - r * 0.85, cy + r * 0.35),
               (cx + r * 0.05, cy + r * 0.05), (cx + r * 0.35, cy + r * 0.95)],
              fill=couleur)


def itineraire():
    """L'ecran Itineraire : la carte plein cadre + la feuille du bas."""
    im = carte_rue(W, H)
    d = ImageDraw.Draw(im)

    chemin = [(px(70), int(H * 0.60)), (px(150), int(H * 0.50)),
              (px(150), int(H * 0.38)), (px(250), int(H * 0.33)),
              (px(300), int(H * 0.22))]
    trace_route(d, chemin, C['brand600'], px(9))
    marqueur_livreur(d, *chemin[0])
    epingle(d, chemin[-1][0], chemin[-1][1], C['accent'])

    # Le bouton de retour : h-10 w-10, rond, blanc, ombre.
    rond(d, px(20) + px(20), BANDE + px(20) + px(20), px(20), C['surface'])
    d.text((px(20) + px(14), BANDE + px(20) + px(8)), '‹', font=f('b', 22),
           fill=C['ink'])

    # La feuille : rounded-t-3xl, px-5 pb-6 pt-3.
    hf = px(300)
    fy = H - hf
    d.rounded_rectangle([0, fy, W, H + px(40)], radius=px(24), fill=C['surface'])
    # La poignee : h-1 w-10, ink-faint/25
    d.rounded_rectangle([(W - px(40)) // 2, fy + px(10),
                         (W + px(40)) // 2, fy + px(14)],
                        radius=px(2), fill=(221, 226, 232))

    x = px(20)
    y = fy + px(28)
    # Ligne 1 : temps estime
    rond(d, x + px(22), y + px(22), px(22), C['brand600'])
    icone_horloge(d, x + px(22), y + px(22), px(10), C['surface'], px(2))
    d.text((x + px(58), y + px(6)), 'Temps estimé', font=CAPTION(), fill=C['inkMuted'])
    d.text((x + px(58), y + px(26)), '~12 min', font=LABEL(), fill=C['ink'])
    txt = '3,4 km'
    fl = CAPTION()
    lw = d.textlength(txt, font=fl) + px(24)
    d.rounded_rectangle([W - x - lw, y + px(12), W - x, y + px(12) + px(28)],
                        radius=px(14), fill=C['brand50'])
    d.text((W - x - lw + px(12), y + px(16)), txt, font=fl, fill=C['brand700'])
    y += px(62)
    d.line([(x, y), (W - x, y)], fill=(234, 237, 241), width=px(1))
    y += px(16)
    # Ligne 2 : l'adresse
    rond(d, x + px(22), y + px(22), px(22), C['brand600'])
    icone_navigation(d, x + px(22), y + px(22), px(9), C['surface'])
    d.text((x + px(58), y + px(6)), 'Adresse de livraison', font=CAPTION(),
           fill=C['inkMuted'])
    d.text((x + px(58), y + px(26)), 'Immeuble Kania · Conakry · Matam',
           font=LABEL(), fill=C['ink'])
    y += px(64)
    # La carte de l'article
    hc = px(76)
    d.rounded_rectangle([x, y, W - x, y + hc], radius=px(14), fill=C['muted'])
    vignette(d, x + px(12), y + px(12), px(52), TEINTES[0])
    d.text((x + px(76), y + px(18)), 'Sac de riz 25 kg', font=LABEL(), fill=C['ink'])
    d.text((x + px(76), y + px(40)), 'LNK-4821 · 450 000 GNF', font=CAPTION(),
           fill=C['inkMuted'])
    return im


def carte_onglet():
    """L'onglet Carte : les courses actives posees sur le plan."""
    im = carte_rue(W, H)
    d = ImageDraw.Draw(im)

    marqueur_livreur(d, int(W * 0.30), int(H * 0.46))
    for (u, v, couleur) in ((0.70, 0.26, C['accent']), (0.52, 0.62, C['brand600']),
                            (0.82, 0.55, C['brand600'])):
        epingle(d, int(W * u), int(H * v), couleur)

    # Le bandeau de titre, pose sur la carte.
    d.rounded_rectangle([px(16), BANDE + px(10), W - px(16), BANDE + px(78)],
                        radius=px(16), fill=C['surface'])
    d.text((px(32), BANDE + px(22)), 'Carte', font=TITLE(), fill=C['ink'])
    t = '3 courses actives'
    fl = CAPTION()
    d.text((W - px(32) - d.textlength(t, font=fl), BANDE + px(30)), t,
           font=fl, fill=C['inkMuted'])

    # La feuille du bas : les courses actives.
    hf = px(250)
    fy = H - hf
    d.rounded_rectangle([0, fy, W, H + px(40)], radius=px(24), fill=C['surface'])
    d.rounded_rectangle([(W - px(40)) // 2, fy + px(10),
                         (W + px(40)) // 2, fy + px(14)],
                        radius=px(2), fill=(221, 226, 232))
    x, y = px(20), fy + px(30)
    for ref, zone, delai, actif in (('LNK-4821', 'Conakry · Matam', '1 h 12', True),
                                    ('LNK-4819', 'Conakry · Ratoma', '2 h 40', False),
                                    ('LNK-4815', 'Conakry · Dixinn', '3 h 05', False)):
        rond(d, x + px(14), y + px(14), px(7),
             C['accent'] if actif else C['brand600'])
        d.text((x + px(34), y + px(1)), ref, font=LABEL(), fill=C['ink'])
        d.text((x + px(34), y + px(22)), zone, font=CAPTION(), fill=C['inkMuted'])
        lw = d.textlength(delai, font=CAPTION())
        d.text((W - x - lw, y + px(10)), delai, font=CAPTION(),
               fill=C['ink'] if actif else C['inkFaint'])
        y += px(58)
    return im


def accueil():
    """L'ecran d'accueil, avec le fond SVG que l'app embarque (MapBackdrop).

    Reproduit trait pour trait depuis src/features/welcome/ui/map-backdrop.tsx :
    degrade #0A4D3C -> #0E6E55 -> #0C5A47, motif de rues #5FC9A3 a 12 %, route
    en pointilles #A7F3D0 a 18 % entre deux points, et le double chevron blanc
    en filigrane a 8 %."""
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    etapes = [(0.0, (10, 77, 60)), (0.55, (14, 110, 85)), (1.0, (12, 90, 71))]
    for y in range(H):
        u = y / H
        for i in range(len(etapes) - 1):
            a, ca = etapes[i]
            b, cb = etapes[i + 1]
            if a <= u <= b:
                t = (u - a) / (b - a)
                d.line([(0, y), (W, y)], fill=tuple(
                    int(ca[k] + (cb[k] - ca[k]) * t) for k in range(3)))
                break

    calque = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    cd = ImageDraw.Draw(calque)
    rue, ep = (95, 201, 163), max(1, px(1.5))
    a12 = int(255 * 0.12)
    for p in ((-20, H * 0.22, W + 20, H * 0.22), (-20, H * 0.34, W + 20, H * 0.34),
              (W * 0.25, -20, W * 0.25, H + 20), (W * 0.7, -20, W * 0.7, H + 20),
              (-20, H * 0.1, W * 0.9, H * 0.55)):
        cd.line([(p[0], p[1]), (p[2], p[3])], fill=rue + (a12,), width=ep)

    # La route en pointilles, de (0.12, 0.46) a (0.85, 0.18), courbee.
    a18 = int(255 * 0.18)
    pts = []
    for i in range(61):
        t = i / 60.0
        # Bezier cubique, memes points de controle que le SVG.
        p0 = (W * 0.12, H * 0.46); p1 = (W * 0.3, H * 0.3)
        p2 = (W * 0.6, H * 0.5); p3 = (W * 0.85, H * 0.18)
        mt = 1 - t
        pts.append((mt**3 * p0[0] + 3*mt*mt*t * p1[0] + 3*mt*t*t * p2[0] + t**3 * p3[0],
                    mt**3 * p0[1] + 3*mt*mt*t * p1[1] + 3*mt*t*t * p2[1] + t**3 * p3[1]))
    for i in range(0, len(pts) - 1, 3):
        cd.line([pts[i], pts[i + 1]], fill=(167, 243, 208, a18), width=px(2))
    cd.ellipse([W*0.12 - px(4), H*0.46 - px(4), W*0.12 + px(4), H*0.46 + px(4)],
               fill=(167, 243, 208, a18))
    cd.ellipse([W*0.85 - px(4), H*0.18 - px(4), W*0.85 + px(4), H*0.18 + px(4)],
               fill=(255, 197, 61, a18))

    a08 = int(255 * 0.08)
    cd.line([(W*0.2, H*0.34), (W*0.5, H*0.12), (W*0.8, H*0.34)],
            fill=(255, 255, 255, a08), width=px(18), joint='curve')
    cd.line([(W*0.32, H*0.36), (W*0.5, H*0.22), (W*0.68, H*0.36)],
            fill=(255, 255, 255, a08), width=px(12), joint='curve')
    im = Image.alpha_composite(im.convert('RGBA'), calque).convert('RGB')
    d = ImageDraw.Draw(im)

    # La signature, en haut a gauche.
    x = px(24)
    rond(d, x + px(17), BANDE + px(24), px(17), C['accent'])
    d.text((x + px(10), BANDE + px(14)), '∞', font=f('b', 14), fill=C['brand700'])
    d.text((x + px(44), BANDE + px(16)), 'Dépose', font=LABEL(), fill=C['inverse'])

    # Le bloc du bas : titre, sous-titre, points, bouton a glisser.
    y = H - px(260)
    d.text((x, y), 'Gagne plus', font=DISPLAY(), fill=C['inverse'])
    y += px(38)
    d.text((x, y), 'à chaque course', font=DISPLAY(), fill=C['inverse'])
    y += px(46)
    for ligne in ('Reçois des livraisons et fais grimper',
                  'tes revenus, à ton rythme.'):
        d.text((x, y), ligne, font=BODY(), fill=(214, 229, 223))
        y += px(24)
    y += px(18)
    cx = x
    for i in range(3):
        w = px(20) if i == 0 else px(6)
        d.rounded_rectangle([cx, y, cx + w, y + px(6)], radius=px(3),
                            fill=C['accent'] if i == 0 else (120, 160, 148))
        cx += w + px(6)
    y += px(28)

    # SwipeToStart : h-16, rounded-full, bg-surface, bouton brand-500 a gauche.
    hb = px(64)
    d.rounded_rectangle([x, y, W - x, y + hb], radius=hb // 2, fill=C['surface'])
    texte = 'Glisser pour commencer'
    fl = LABEL()
    l = d.textlength(texte, font=fl)
    d.text(((W - l) / 2, y + (hb - fl.size) / 2 - px(1)), texte, font=fl,
           fill=C['inkMuted'])
    rond(d, x + px(4) + px(28), y + hb / 2, px(28), C['brand500'])
    d.text((x + px(20), y + hb / 2 - px(10)), '››', font=f('b', 16),
           fill=C['inverse'])
    return im


def profil():
    im, d = ecran()
    x = px(20)
    dispo = W - x * 2
    y = BANDE + px(14)

    d.text((x, y), 'Profil', font=DISPLAY(), fill=C['ink'])
    y += px(54)

    # L'en-tete : avatar + nom + role
    hc = px(120)
    carte(d, x, y, dispo, hc)
    rond(d, x + px(16) + px(34), y + px(26) + px(34), px(34), C['brand50'])
    f_ini = f('b', 24)
    ini = 'MS'
    li = d.textlength(ini, font=f_ini)
    d.text((x + px(16) + px(34) - li / 2, y + px(26) + px(34) - f_ini.size * 0.66),
           ini, font=f_ini, fill=C['brand700'])
    d.text((x + px(100), y + px(34)), 'Mamadou S.', font=TITLE(), fill=C['ink'])
    lw = d.textlength('Livreur Linky', font=CAPTION()) + px(20)
    d.rounded_rectangle([x + px(100), y + px(66), x + px(100) + lw, y + px(66) + px(28)],
                        radius=px(14), fill=C['brand50'])
    d.text((x + px(110), y + px(70)), 'Livreur Linky', font=CAPTION(),
           fill=C['brand700'])
    y += hc + px(16)

    # Les deux champs
    for libelle, valeur in (('Ville / zone', 'Conakry · Ratoma'),
                            ('Moyen de transport', 'Moto')):
        hc = px(78)
        carte(d, x, y, dispo, hc)
        d.text((x + px(16), y + px(16)), libelle, font=CAPTION(), fill=C['inkMuted'])
        d.text((x + px(16), y + px(40)), valeur, font=BODY(), fill=C['ink'])
        y += hc + px(12)

    y += px(6)
    y += bouton(d, x, y, dispo, 'Modifier mes infos', 'secondary') + px(20)

    # Les lignes de reglages
    for libelle in ('Mon compte', 'Aide & support'):
        hc = px(64)
        carte(d, x, y, dispo, hc)
        d.text((x + px(16), y + px(21)), libelle, font=BODY(), fill=C['ink'])
        d.text((W - x - px(26), y + px(18)), '›', font=f('b', 16), fill=C['inkFaint'])
        y += hc + px(12)

    bouton(d, x, H - px(20) - px(48), dispo, 'Se déconnecter', 'ghost')
    return im


def main():
    os.makedirs(SORTIE, exist_ok=True)
    ecrans = [
        ('1.png', lambda: liste('En cours', COURSES, '6 livraisons')),
        ('2.png', detail),
        ('3.png', scanner),
        ('4.png', lambda: liste('Terminées', TERMINEES, '6 livraisons')),
        ('5.png', itineraire),
        ('6.png', carte_onglet),
        ('7.png', accueil),
        ('8.png', profil),
    ]
    for nom, rendu in ecrans:
        chemin = os.path.join(SORTIE, nom)
        rendu().save(chemin, 'PNG', optimize=True)
        print('  %s' % chemin)
    print('\n%d ecran(s). Lance maintenant :\n  python play-store-assets/captures.py'
          % len(ecrans))


if __name__ == '__main__':
    main()
