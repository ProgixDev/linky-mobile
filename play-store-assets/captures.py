# -*- coding: utf-8 -*-
"""
Habille les captures d'écran brutes pour le Play Store.

    python play-store-assets/captures.py        legendes en francais
    python play-store-assets/captures.py en     legendes en anglais

La langue des legendes DOIT suivre celle des captures. Les premieres
versions portaient un titre francais au-dessus d'un ecran anglais.

ENTRÉE   screenshots-source/linky/*.png     (dans l'ordre d'affichage : 1, 2, 3…)
         screenshots-source/depose/*.png
SORTIE   play-store-assets/captures/linky-1.png …  (1080 × 1920, prêtes à déposer)

Mise en page : titre en haut À GAUCHE sur deux lignes — la seconde en couleur
d'accent —, une phrase descriptive en dessous, et le téléphone en grand qui
DÉBORDE par le bas. C'est la mise en page validée sur GetDraft.

┌─ CE QUE LE FORMAT IMPOSE, ET POURQUOI C'EST FAIT AINSI ────────────────────┐
- Play accepte un rapport entre 16:9 et 9:16 ; 1080×1920 est le format sûr.
- PAS de canal alpha : on écrit en RGB.
- La capture n'est JAMAIS déformée. On impose la LARGEUR du téléphone et on
  DÉDUIT sa hauteur du rapport de la capture. Un écran étiré se voit tout de
  suite et fait amateur.
- Le téléphone déborde volontairement du bas : ça donne de la présence à
  l'écran, et ça évite le vide sous l'appareil.
└────────────────────────────────────────────────────────────────────────────┘

⚠️ Ces images sont PUBLIQUES. Relire chaque capture avant de la déposer : aucun
numéro de téléphone réel, aucune adresse, aucun nom de client.
"""
import os, sys, glob
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ICI = os.path.dirname(os.path.abspath(__file__))
RACINE = os.path.dirname(ICI)
SOURCE = os.path.join(RACINE, 'screenshots-source')
SORTIE = os.path.join(ICI, 'captures')
FONTS = 'C:/Windows/Fonts/'

W, H = 1080, 1920

# La langue des legendes. Elle doit suivre celle des CAPTURES : une fiche Play
# qui melange un titre francais et un ecran anglais se voit au premier coup
# d'oeil, et c'est exactement ce que montraient les premieres.
LANGUE = 'en' if len(sys.argv) > 1 and sys.argv[1].lower() in ('en', 'anglais') else 'fr'

# ON ROGNE LA BARRE D'ETAT DU TELEPHONE.
#
# Les captures viennent d'un vrai appareil : elles portent l'heure, le niveau de
# batterie, le debit reseau et les icones de notification de son proprietaire
# (WhatsApp, Messenger, Slack…). Sur une fiche PUBLIQUE, ca fait neglige et ca
# expose un peu de sa vie privee. Mettre 0 pour la garder.
ROGNER_BARRE_ETAT = 0.038

# UNE CHARTE PAR APPLICATION.
#
# Les deux apps partagent la MEME marque : le theme de Depose declare le meme
# vert (#0E6E55) et le meme safran (#E8A53D) que Linky. Leur inventer des
# couleurs differentes casserait la famille — ce qui les separe, c'est le
# TRAITEMENT.
#
#   linky  : le champ est le vert de la marque. Une place de marche, de jour.
#   depose : le champ vire a l'encre de nuit et le vert passe en structure ;
#            le safran devient la seule lumiere. « Pensee pour la route, pas
#            pour le bureau. » Un trace d'itineraire en pointilles traverse le
#            fond, sous l'appareil.
CHARTES = {
    'linky': {
        'fond_haut': (9, 66, 49),
        'fond_bas': (5, 40, 30),
        'accent': (240, 178, 78),
        'texte': (255, 255, 255),
        'texte_doux': (188, 214, 203),
        'trace': None,
    },
    'depose': {
        'fond_haut': (12, 21, 27),
        'fond_bas': (9, 52, 41),
        'accent': (232, 165, 61),
        'texte': (255, 255, 255),
        'texte_doux': (158, 186, 177),
        # PAS de motif de fond. Un trace d'itineraire en pointilles a ete
        # essaye le 2026-10-07 et RETIRE : l'appareil occupe tout le champ, il
        # n'en restait que les deux extremites dans les coins, et des tirets
        # isolees se lisent comme des rayures, pas comme une route. Le champ
        # de nuit suffit largement a separer les deux fiches.
        'trace': None,
    },
}

MARGE = 76
LARGEUR_TEL = 700

# Trois morceaux par capture : la premiere ligne du titre (blanche), la seconde
# (en accent), puis la phrase. Court : ca se lit sur une vignette de quelques
# centimetres, pas en plein ecran.
LEGENDES = {
    'linky': [
        ("Le marché guinéen.", "Dans ta poche.",
         "Acheter, vendre, louer. Partout en Guinée, depuis ton téléphone."),
        ("Tout le marché,", "catégorie par catégorie.",
         "Électronique, mode, maison, auto, terrains, logements. Tout est là."),
        ("Paiement sécurisé.", "À chaque achat.",
         "Le vendeur n'est payé qu'une fois que tu as confirmé la livraison."),
        ("Louer ou acheter", "un logement.",
         "Contrat signé dans l'application, loyer gardé jusqu'à ton entrée."),
        ("Découvre,", "d'un coup d'œil.",
         "Un fil d'annonces à faire défiler : articles et immobilier mêlés."),
        ("Tes ventes,", "encaissées.",
         "Suis ton solde et retire vers Orange Money ou MTN quand tu veux."),
        ("Acheteur, vendeur,", "ou agent.",
         "Un seul compte. Tu choisis ce que tu fais, et tu peux en changer."),
        ("Garde tes", "coups de cœur.",
         "Retrouve tes annonces préférées, articles comme logements."),
        ("Ton compte,", "au même endroit.",
         "Commandes, réservations, portefeuille et boutique : tout part d'ici."),
    ],
    'depose': [
        ("Tes courses", "du jour.",
         "Toutes les livraisons qui t'attendent, dans l'ordre."),
        ("Chaque course", "en détail.",
         "Adresse, contact, montant : tout ce qu'il faut avant de partir."),
        ("La remise", "se valide par QR.",
         "Le client montre son code, tu le scannes, la course est close."),
        ("Ton historique,", "toujours à jour.",
         "Retrouve ce que tu as livré, et quand."),
        # Les quatre premieres suivent l'ordre des ecrans rendus par
        # ecrans-depose.py : liste, detail, scanner, terminees. Celles qui
        # suivent attendent leur ecran.
        ("L'itinéraire,", "dans l'application.",
         "La carte t'emmène du vendeur jusqu'au client, sans changer d'app."),
        ("Livrer", "avec Linky.",
         "Rejoins les livreurs de la place de marché guinéenne."),
        ("Simple,", "rapide, suivi.",
         "Une application pensée pour la route, pas pour le bureau."),
        ("Dépose.", "",
         "L'application des livreurs Linky."),
    ],
}

# Les memes, en anglais. Une fiche Play se lit dans UNE langue : si les captures
# montrent l'appli en anglais, les legendes doivent l'etre aussi. C'est le
# defaut qu'on corrige ici — le premier jeu melangeait titre francais et ecran
# anglais.
LEGENDES_EN = {
    'linky': [
        ("Guinea's marketplace.", "In your pocket.",
         "Buy, sell, rent. Anywhere in Guinea, straight from your phone."),
        ("The whole market,", "category by category.",
         "Electronics, fashion, home, cars, land, homes. It is all here."),
        ("Secure payment.", "On every purchase.",
         "The seller is only paid once you have confirmed delivery."),
        ("Rent or buy", "a home.",
         "Contract signed in the app, rent held until you move in."),
        ("Discover,", "at a glance.",
         "A feed to scroll through: items and property, side by side."),
        ("Your sales,", "cashed in.",
         "Track your balance and withdraw to Orange Money or MTN anytime."),
        ("Buyer, seller,", "or agent.",
         "One account. You choose what you do, and you can switch."),
        ("Keep your", "favourites.",
         "Find the listings you saved, items and homes alike."),
        ("Your account,", "all in one place.",
         "Orders, bookings, wallet and shop: everything starts here."),
    ],
    'depose': [
        ("Your runs", "for the day.",
         "Every delivery waiting for you, in order."),
        ("Every run", "in detail.",
         "Address, contact, amount: everything you need before you set off."),
        ("Handover", "is confirmed by QR.",
         "The customer shows their code, you scan it, the run is closed."),
        ("Your history,", "always up to date.",
         "Find what you delivered, and when."),
        # Meme ordre que la liste francaise — les deux tables sont indexees par
        # le MEME numero de fichier, les desynchroniser donnerait un titre sur
        # le mauvais ecran.
        ("The route,", "inside the app.",
         "The map takes you from the seller to the customer, in one place."),
        ("Deliver", "with Linky.",
         "Join the couriers of Guinea's marketplace."),
        ("Simple,", "fast, tracked.",
         "An app built for the road, not for the desk."),
        ("Depose.", "",
         "The app for Linky couriers."),
    ],
}



def police(nom, taille):
    return ImageFont.truetype(FONTS + nom, taille)


def fond(charte):
    """Un aplat sombre, très légèrement dégradé du haut vers le bas."""
    haut, bas = charte['fond_haut'], charte['fond_bas']
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        u = y / H
        d.line([(0, y), (W, y)], fill=(
            int(haut[0] + (bas[0] - haut[0]) * u),
            int(haut[1] + (bas[1] - haut[1]) * u),
            int(haut[2] + (bas[2] - haut[2]) * u)))
    if charte['trace']:
        trace(im, charte)
    return im


def trace(im, charte):
    """Un itinéraire en pointillés, en diagonale, DERRIÈRE l'appareil.

    Il dit « route » sans rien illustrer. Deux garde-fous appris à nos dépens :
    il est flouté (un pointillé net sur un aplat fait un motif de papier peint),
    et il passe sous le téléphone, qui en masque le milieu — ce qui suggère
    qu'il continue au lieu de s'arrêter."""
    couleur, alpha = charte['trace']
    calque = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(calque)

    # Une diagonale montante : le départ en bas à gauche, l'arrivée en haut à
    # droite. On la découpe en tirets de longueur constante.
    x0, y0, x1, y1 = -60, H - 150, W + 60, 430
    n = 44
    for i in range(n):
        if i % 2:
            continue
        a, b = i / n, (i + 0.62) / n
        d.line([(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a),
                (x0 + (x1 - x0) * b, y0 + (y1 - y0) * b)],
               fill=couleur + (alpha,), width=9)

    calque = calque.filter(ImageFilter.GaussianBlur(1.6))
    im.paste(Image.alpha_composite(im.convert('RGBA'), calque).convert('RGB'), (0, 0))


def pastille(im, d, index, total, charte):
    """« 3/8 » en haut a droite — on fait defiler une fiche Play, savoir ou l'on
    est dans la serie donne envie de la parcourir en entier."""
    f = police('segoeui.ttf', 24)
    texte = '%d/%d' % (index, total)
    l = d.textlength(texte, font=f)
    x1, y1 = W - MARGE - l - 30, 104
    d.rounded_rectangle([x1, y1, x1 + l + 30, y1 + 44], radius=22,
                        fill=(255, 255, 255, 0), outline=(255, 255, 255, 60), width=2)
    d.text((x1 + 15, y1 + 7), texte, font=f, fill=charte['texte_doux'])


def coupe(d, texte, f, largeur):
    """Découpe une phrase en lignes qui tiennent dans `largeur`."""
    lignes, cour = [], ''
    for mot in texte.split():
        essai = (cour + ' ' + mot).strip()
        if d.textlength(essai, font=f) <= largeur:
            cour = essai
        else:
            if cour:
                lignes.append(cour)
            cour = mot
    if cour:
        lignes.append(cour)
    return lignes


def telephone(capture, largeur):
    """Dessine un téléphone AUTOUR de la capture, sans jamais la déformer.

    On impose la LARGEUR ; la hauteur se déduit du rapport de la capture."""
    BEZEL = 13
    RAYON = 52
    cw, ch = capture.size
    w_ecran = largeur - BEZEL * 2
    h_ecran = max(1, round(w_ecran * ch / cw))
    ecran = capture.resize((w_ecran, h_ecran), Image.LANCZOS).convert('RGB')

    tw, th = largeur, h_ecran + BEZEL * 2
    tel = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(tel)
    # Un gris très foncé plutôt qu'un noir pur : sur un fond sombre, le noir pur
    # fait un trou et l'appareil perd son relief.
    d.rounded_rectangle([0, 0, tw - 1, th - 1], radius=RAYON, fill=(20, 24, 28, 255))
    d.rounded_rectangle([0, 0, tw - 1, th - 1], radius=RAYON,
                        outline=(255, 255, 255, 46), width=2)

    masque = Image.new('L', (w_ecran * 4, h_ecran * 4), 0)
    ImageDraw.Draw(masque).rounded_rectangle(
        [0, 0, w_ecran * 4 - 1, h_ecran * 4 - 1], radius=(RAYON - BEZEL) * 4, fill=255)
    masque = masque.resize((w_ecran, h_ecran), Image.LANCZOS)
    tel.paste(ecran, (BEZEL, BEZEL), masque)

    ombre = Image.new('RGBA', (tw + 160, th + 160), (0, 0, 0, 0))
    ImageDraw.Draw(ombre).rounded_rectangle(
        [80, 80, 80 + tw, 80 + th], radius=RAYON, fill=(0, 0, 0, 150))
    ombre = ombre.filter(ImageFilter.GaussianBlur(34))
    return tel, ombre


def habille(chemin_capture, legende, destination, index=1, total=1, charte=None):
    charte = charte or CHARTES['linky']
    # Une legende porte 3 morceaux, ou 4 si elle impose l'appareil ENTIER.
    titre1, titre2, phrase = legende[0], legende[1], legende[2]
    entier = len(legende) > 3 and legende[3] == 'entier'
    im = fond(charte)
    d = ImageDraw.Draw(im)

    capture = Image.open(chemin_capture)
    if capture.mode != 'RGB':
        capture = capture.convert('RGB')
    if ROGNER_BARRE_ETAT > 0:
        cw, ch = capture.size
        capture = capture.crop((0, int(ch * ROGNER_BARRE_ETAT), cw, ch))

    dispo = W - MARGE * 2

    # ── LE TITRE, EN HAUT À GAUCHE ────────────────────────────────────────
    f_titre = police('segoeuib.ttf', 70)
    while (max(d.textlength(titre1, font=f_titre),
               d.textlength(titre2, font=f_titre)) > dispo and f_titre.size > 42):
        f_titre = police('segoeuib.ttf', f_titre.size - 2)

    y = 104
    d.text((MARGE, y), titre1, font=f_titre, fill=charte['texte'])
    y += int(f_titre.size * 1.16)
    if titre2:
        d.text((MARGE, y), titre2, font=f_titre, fill=charte['accent'])
        y += int(f_titre.size * 1.16)

    # ── LA PHRASE ─────────────────────────────────────────────────────────
    f_phrase = police('segoeui.ttf', 30)
    lignes = coupe(d, phrase, f_phrase, dispo)
    # Au-delà de deux lignes on réduit : la place appartient au téléphone.
    while len(lignes) > 2 and f_phrase.size > 24:
        f_phrase = police('segoeui.ttf', f_phrase.size - 2)
        lignes = coupe(d, phrase, f_phrase, dispo)
    # Un peu d'air entre le titre et la phrase : colles l'un a l'autre, ils se
    # lisent comme un seul bloc et le titre perd sa force.
    y += 26
    for l in lignes:
        d.text((MARGE, y), l, font=f_phrase, fill=charte['texte_doux'])
        y += f_phrase.size + 10

    # ── L'APPAREIL ────────────────────────────────────────────────────────
    haut = y + 58
    if entier:
        # Appareil ENTIER : on deduit la largeur de la hauteur disponible, pour
        # que rien ne soit coupe. Sert aux ecrans dont l'information vit en bas.
        dispo_h = H - haut - 56
        cw, ch = capture.size
        largeur = min(LARGEUR_TEL, int((dispo_h - 26) * cw / ch))
    else:
        largeur = LARGEUR_TEL

    tel, ombre = telephone(capture, largeur)
    x = (W - largeur) // 2

    im.paste(ombre, (x - 80, haut - 80 + 24), ombre)
    im.paste(tel, (x, haut), tel)   # ce qui dépasse de 1920 est simplement coupé

    if total > 1:
        pastille(im, d, index, total, charte)

    im.save(destination, 'PNG', optimize=True)
    return im.size


def main():
    if not os.path.isdir(SOURCE):
        print("Rien a faire : le dossier %s n'existe pas." % SOURCE)
        return
    os.makedirs(SORTIE, exist_ok=True)
    total = 0
    par_app = {}
    for app in ('linky', 'depose'):
        dossier = os.path.join(SOURCE, app)
        fichiers = sorted(glob.glob(os.path.join(dossier, '*.png'))
                          + glob.glob(os.path.join(dossier, '*.jpg')))
        if not fichiers:
            print('%-8s aucune capture dans %s' % (app, dossier))
            continue
        print(app)
        for i, f in enumerate(fichiers):
            table = LEGENDES_EN if LANGUE == 'en' else LEGENDES
            legendes = table.get(app, [])
            legende = legendes[i] if i < len(legendes) else ('', '', '')
            dst = os.path.join(SORTIE, '%s-%d.png' % (app, i + 1))
            habille(f, legende, dst, index=i + 1, total=len(fichiers),
                    charte=CHARTES[app])
            print('   %-12s -> %-16s « %s %s »'
                  % (os.path.basename(f), os.path.basename(dst), legende[0], legende[1]))
            total += 1
        par_app[app] = len(fichiers)
    print()
    print('%d capture(s) habillee(s) dans %s  (legendes : %s)'
          % (total, SORTIE, LANGUE))
    # La limite des 8 est PAR FICHE, et chaque app a la sienne. Additionner les
    # deux annoncait « 12, retires-en 4 » alors que 8 + 4 passe tres bien.
    for app, n in par_app.items():
        if n > 8:
            print("⚠️  %s : Play n'accepte que 8 captures telephone par fiche." % app)
            print("   Il y en a %d : il faut en retirer %d avant de deposer."
                  % (n, n - 8))
            if app == 'linky':
                print("   La plus dispensable est « Garde tes coups de cœur » (les")
                print("   favoris se vendent moins bien qu'un ecran de compte).")
        elif n < 2:
            print("⚠️  %s : Play en exige au moins 2. Il n'y en a que %d." % (app, n))


if __name__ == '__main__':
    main()
