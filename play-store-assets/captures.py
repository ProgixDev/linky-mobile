# -*- coding: utf-8 -*-
"""
Habille les captures d'écran brutes pour le Play Store.

    python play-store-assets/captures.py

ENTRÉE   screenshots-source/linky/*.png     (dans l'ordre d'affichage : 1, 2, 3…)
         screenshots-source/depose/*.png
SORTIE   play-store-assets/captures/linky-1.png …  (1080 × 1920, prêtes à déposer)

Chaque image sortante = un fond aux couleurs de la marque, une phrase courte en
haut, et la capture dans un cadre de téléphone dessiné ici même (aucun visuel
externe à fournir).

┌─ CE QUE LE FORMAT IMPOSE, ET POURQUOI C'EST FAIT AINSI ────────────────────┐
- Play accepte un rapport entre 16:9 et 9:16 ; 1080×1920 est le format sûr.
- PAS de canal alpha : on écrit en RGB.
- La capture n'est JAMAIS déformée. La largeur du cadre est DÉRIVÉE du rapport
  de la capture, au lieu d'étirer l'image pour la faire entrer dans un cadre
  fixe. Un écran d'application étiré se voit immédiatement et fait amateur.
- Les téléphones droits et centrés, pas inclinés : sur une fiche de magasin,
  l'utilisateur regarde l'interface, pas la mise en scène. L'inclinaison est
  bonne pour une bannière, mauvaise pour une capture.
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

# ON ROGNE LA BARRE D'ETAT DU TELEPHONE.
#
# Les captures viennent d'un vrai appareil : elles portent l'heure, le niveau de
# batterie, le debit reseau et les icones de notification de son proprietaire
# (WhatsApp, Messenger, Slack…). Sur une fiche PUBLIQUE, ca fait negligé et ca
# expose un peu de sa vie privee. La proportion est celle d'une barre d'etat
# Android standard ; mettre 0 pour la garder.
ROGNER_BARRE_ETAT = 0.038

# La palette de la carte du portefeuille — le seul endroit où la marque est
# déjà posée en couleurs.
VERT_CLAIR = (17, 136, 102)
VERT = (10, 82, 64)
VERT_SOMBRE = (6, 57, 41)
SAFRAN = (232, 165, 61)

# Les phrases, dans l'ordre des fichiers. Courtes : elles se lisent sur une
# vignette de quelques centimètres, pas en plein écran.
LEGENDES = {
    'linky': [
        "Le marché guinéen, dans ta poche",
        "Tout le marché, catégorie par catégorie",
        "Le vendeur n'est payé qu'après ta confirmation",
        "Loue ou achète un logement",
        "Découvre les annonces en un coup d'œil",
        "Tes ventes encaissées, retirables quand tu veux",
        "Acheteur, vendeur ou agent : à toi de choisir",
        "Garde tes coups de cœur",
    ],
    'depose': [
        "Tes courses du jour",
        "L'itinéraire, directement dans l'app",
        "La remise se valide par QR",
        "Chaque course en détail",
        "Ton historique, toujours à jour",
        "Livrer avec Linky",
        "Simple, rapide, suivi",
        "Dépose",
    ],
}


def police(nom, taille):
    return ImageFont.truetype(FONTS + nom, taille)


def fond():
    """Le dégradé diagonal + deux halos, comme la carte et les bannières."""
    im = Image.new('RGB', (W, H))
    px = im.load()
    for y in range(H):
        for x in range(W):
            t = (x / W + y / H) / 2.0
            if t < 0.5:
                u, a, b = t / 0.5, VERT_CLAIR, VERT
            else:
                u, a, b = (t - 0.5) / 0.5, VERT, VERT_SOMBRE
            px[x, y] = (int(a[0] + (b[0] - a[0]) * u),
                        int(a[1] + (b[1] - a[1]) * u),
                        int(a[2] + (b[2] - a[2]) * u))
    halo(im, W - 60, 120, 340, SAFRAN, 0.22)
    halo(im, 20, H - 260, 380, (120, 220, 180), 0.14)
    return im


def halo(im, cx, cy, r, couleur, force):
    P = 64
    m = Image.new('L', (P, P), 0)
    d = ImageDraw.Draw(m)
    for i in range(P // 2, 0, -1):
        d.ellipse([P // 2 - i, P // 2 - i, P // 2 + i, P // 2 + i],
                  fill=int(force * 255 * (1 - i / (P / 2)) ** 2))
    m = m.resize((r * 2, r * 2), Image.LANCZOS)
    im.paste(Image.new('RGB', (r * 2, r * 2), couleur), (cx - r, cy - r), m)


def cadre_telephone(capture, h_ecran):
    """Dessine un téléphone AUTOUR de la capture, sans jamais la déformer.

    La largeur de l'écran est déduite du rapport de la capture : c'est elle qui
    commande, pas l'inverse. Rend (image RGBA du téléphone, masque d'ombre)."""
    cw, ch = capture.size
    w_ecran = max(1, round(h_ecran * cw / ch))
    ecran = capture.resize((w_ecran, h_ecran), Image.LANCZOS).convert('RGB')

    BEZEL = 14          # l'épaisseur de la coque autour de l'écran
    RAYON = 54          # les coins arrondis du téléphone
    tw, th = w_ecran + BEZEL * 2, h_ecran + BEZEL * 2

    tel = Image.new('RGBA', (tw, th), (0, 0, 0, 0))
    d = ImageDraw.Draw(tel)
    # La coque, presque noire mais pas tout à fait : un noir pur sur un fond
    # sombre fait un trou, un gris très foncé garde le relief.
    d.rounded_rectangle([0, 0, tw - 1, th - 1], radius=RAYON, fill=(22, 26, 30, 255))
    # Un liseré clair sur le bord : c'est lui qui détache le téléphone du fond.
    d.rounded_rectangle([0, 0, tw - 1, th - 1], radius=RAYON,
                        outline=(255, 255, 255, 38), width=2)

    # L'écran, avec ses propres coins arrondis.
    masque = Image.new('L', (w_ecran * 4, h_ecran * 4), 0)
    ImageDraw.Draw(masque).rounded_rectangle(
        [0, 0, w_ecran * 4 - 1, h_ecran * 4 - 1], radius=(RAYON - BEZEL) * 4, fill=255)
    masque = masque.resize((w_ecran, h_ecran), Image.LANCZOS)
    tel.paste(ecran, (BEZEL, BEZEL), masque)

    # L'ombre portée : le téléphone en noir, flouté, décalé vers le bas.
    ombre = Image.new('RGBA', (tw + 120, th + 120), (0, 0, 0, 0))
    ImageDraw.Draw(ombre).rounded_rectangle(
        [60, 60, 60 + tw, 60 + th], radius=RAYON, fill=(0, 0, 0, 120))
    ombre = ombre.filter(ImageFilter.GaussianBlur(26))
    return tel, ombre


def habille(chemin_capture, legende, destination):
    im = fond()
    capture = Image.open(chemin_capture)
    if capture.mode != 'RGB':
        capture = capture.convert('RGB')
    if ROGNER_BARRE_ETAT > 0:
        cw, ch = capture.size
        capture = capture.crop((0, int(ch * ROGNER_BARRE_ETAT), cw, ch))

    d = ImageDraw.Draw(im)

    # ── La phrase, en haut ────────────────────────────────────────────────
    MARGE = 72
    dispo = W - MARGE * 2
    f = police('segoeuib.ttf', 62)
    mots, lignes, cour = legende.split(), [], ''
    for m in mots:
        essai = (cour + ' ' + m).strip()
        if d.textlength(essai, font=f) <= dispo:
            cour = essai
        else:
            lignes.append(cour); cour = m
    if cour:
        lignes.append(cour)
    # Au-delà de deux lignes la phrase est trop longue pour une vignette : on
    # réduit plutôt que de manger la place du téléphone.
    while len(lignes) > 2 and f.size > 40:
        f = police('segoeuib.ttf', f.size - 4)
        lignes, cour = [], ''
        for m in mots:
            essai = (cour + ' ' + m).strip()
            if d.textlength(essai, font=f) <= dispo:
                cour = essai
            else:
                lignes.append(cour); cour = m
        if cour:
            lignes.append(cour)

    y = 96
    for l in lignes:
        d.text(((W - d.textlength(l, font=f)) / 2, y), l, font=f, fill=(255, 255, 255))
        y += f.size + 12

    # ── Le téléphone, en dessous ──────────────────────────────────────────
    HAUT = y + 54            # là où commence le téléphone
    BAS = H - 70             # et là où il s'arrête
    h_ecran = BAS - HAUT - 28
    tel, ombre = cadre_telephone(capture, h_ecran)
    tw = tel.size[0]
    # Si la capture est large (une tablette, par exemple), on réduit jusqu'à ce
    # que le téléphone tienne dans la largeur.
    if tw > W - MARGE:
        facteur = (W - MARGE) / tw
        h_ecran = int(h_ecran * facteur)
        tel, ombre = cadre_telephone(capture, h_ecran)
        tw = tel.size[0]
    x = (W - tw) // 2
    im.paste(ombre, (x - 60, HAUT - 60 + 18), ombre)
    im.paste(tel, (x, HAUT), tel)

    im.save(destination, 'PNG', optimize=True)
    return im.size


def main():
    if not os.path.isdir(SOURCE):
        print("Rien a faire : le dossier %s n'existe pas." % SOURCE)
        print("Y deposer les captures dans linky/ et depose/, nommees 1.png, 2.png…")
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
            legendes = LEGENDES.get(app, [])
            legende = legendes[i] if i < len(legendes) else ''
            dst = os.path.join(SORTIE, '%s-%d.png' % (app, i + 1))
            taille = habille(f, legende, dst)
            print('   %-28s -> %-16s %dx%d  « %s »'
                  % (os.path.basename(f), os.path.basename(dst), taille[0], taille[1], legende))
            total += 1
    print()
    print('%d capture(s) habillee(s) dans %s' % (total, SORTIE))
    if total > 8:
        print('⚠️  Play n en accepte que 8 par application.')


if __name__ == '__main__':
    main()
