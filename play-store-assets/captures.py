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

# La palette. Le fond est le vert le plus sombre de la marque — celui du bas du
# degrade de la carte du portefeuille ; l'accent est le safran du logo.
FOND_HAUT = (9, 66, 49)
FOND_BAS = (5, 40, 30)
ACCENT = (240, 178, 78)
TEXTE = (255, 255, 255)
TEXTE_DOUX = (188, 214, 203)

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
        ("L'itinéraire,", "dans l'application.",
         "La carte t'emmène du vendeur jusqu'au client, sans changer d'app."),
        ("La remise", "se valide par QR.",
         "Le client montre son code, tu le scannes, la course est close."),
        ("Chaque course", "en détail.",
         "Adresse, contact, montant : tout ce qu'il faut avant de partir."),
        ("Ton historique,", "toujours à jour.",
         "Retrouve ce que tu as livré, et quand."),
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
        ("The route,", "inside the app.",
         "The map takes you from the seller to the customer, in one place."),
        ("Handover", "is confirmed by QR.",
         "The customer shows their code, you scan it, the run is closed."),
        ("Every run", "in detail.",
         "Address, contact, amount: everything you need before you set off."),
        ("Your history,", "always up to date.",
         "Find what you delivered, and when."),
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


def fond():
    """Un aplat sombre, très légèrement dégradé du haut vers le bas."""
    im = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        u = y / H
        d.line([(0, y), (W, y)], fill=(
            int(FOND_HAUT[0] + (FOND_BAS[0] - FOND_HAUT[0]) * u),
            int(FOND_HAUT[1] + (FOND_BAS[1] - FOND_HAUT[1]) * u),
            int(FOND_HAUT[2] + (FOND_BAS[2] - FOND_HAUT[2]) * u)))
    return im


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


def habille(chemin_capture, legende, destination):
    titre1, titre2, phrase = legende
    im = fond()
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
    d.text((MARGE, y), titre1, font=f_titre, fill=TEXTE)
    y += int(f_titre.size * 1.16)
    if titre2:
        d.text((MARGE, y), titre2, font=f_titre, fill=ACCENT)
        y += int(f_titre.size * 1.16)

    # ── LA PHRASE ─────────────────────────────────────────────────────────
    f_phrase = police('segoeui.ttf', 30)
    lignes = coupe(d, phrase, f_phrase, dispo)
    # Au-delà de deux lignes on réduit : la place appartient au téléphone.
    while len(lignes) > 2 and f_phrase.size > 24:
        f_phrase = police('segoeui.ttf', f_phrase.size - 2)
        lignes = coupe(d, phrase, f_phrase, dispo)
    y += 14
    for l in lignes:
        d.text((MARGE, y), l, font=f_phrase, fill=TEXTE_DOUX)
        y += f_phrase.size + 10

    # ── LE TÉLÉPHONE, QUI DÉBORDE PAR LE BAS ──────────────────────────────
    tel, ombre = telephone(capture, LARGEUR_TEL)
    x = (W - LARGEUR_TEL) // 2
    haut = y + 58
    im.paste(ombre, (x - 80, haut - 80 + 24), ombre)
    im.paste(tel, (x, haut), tel)   # ce qui dépasse de 1920 est simplement coupé

    im.save(destination, 'PNG', optimize=True)
    return im.size


def main():
    if not os.path.isdir(SOURCE):
        print("Rien a faire : le dossier %s n'existe pas." % SOURCE)
        return
    os.makedirs(SORTIE, exist_ok=True)
    total = 0
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
            habille(f, legende, dst)
            print('   %-12s -> %-16s « %s %s »'
                  % (os.path.basename(f), os.path.basename(dst), legende[0], legende[1]))
            total += 1
    print()
    print('%d capture(s) habillee(s) dans %s  (legendes : %s)'
          % (total, SORTIE, LANGUE))
    if total > 8:
        print("⚠️  Play n'accepte que 8 captures telephone par fiche.")
        print("   Il y en a %d : il faut en retirer %d avant de deposer."
              % (total, total - 8))
        print("   La plus dispensable est « Garde tes coups de cœur » (les")
        print("   favoris se vendent moins bien qu'un ecran de compte).")


if __name__ == '__main__':
    main()
