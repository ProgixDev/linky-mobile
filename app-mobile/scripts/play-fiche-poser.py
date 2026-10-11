# -*- coding: utf-8 -*-
"""Pose la fiche Play d'une application : textes et visuels, depuis le terminal.

Les TEXTES sont EXTRAITS de PLAY_STORE_FICHES.md, jamais recopies ici : deux
copies d'un meme texte divergent toujours, et c'est le dossier qui fait foi.

REPETITION A BLANC PAR DEFAUT. Sans `--appliquer`, il lit, montre ce qu'il
ecrirait, et supprime l'edition au lieu de la valider.

    python scripts/play-fiche-poser.py depose
    python scripts/play-fiche-poser.py depose --appliquer

Sortie 0 = fait (ou blanc concluant). 1 = refus motive. 2 = la sonde ne mesure
plus rien.
"""
import io, os, re, json, time, base64, sys
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ICI = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(ICI)                      # app-mobile/
RACINE = os.path.dirname(APP)                   # linky-mobile/
CLE = os.path.join(APP, 'google-service-account.json')
DOSSIER = os.path.join(RACINE, 'PLAY_STORE_FICHES.md')
VISUELS = os.path.join(RACINE, 'play-store-assets')

BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
TELEVERSE = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications'
LANGUE = 'fr-FR'

# Les limites de Play. Depasser = refus a la validation, autant le voir ici.
LIMITES = {'title': 30, 'shortDescription': 80, 'fullDescription': 4000}

APPS = {
    'depose': {
        'paquet': 'com.linky.driver',
        'section': '## 2. Dépose',
        'icon': 'depose-icone-512.png',
        'featureGraphic': 'depose-banniere-1024x500.png',
        'captures': 'captures/depose-%d.png',
    },
    'linky': {
        'paquet': 'com.linkygroup.app',
        'section': '## 1. Linky',
        'icon': 'linky-icone-512.png',
        'featureGraphic': 'linky-banniere-1024x500.png',
        'captures': 'captures/linky-%d.png',
    },
}


def b64(o):
    return base64.urlsafe_b64encode(o).rstrip(b'=')


def jeton():
    sa = json.load(io.open(CLE, encoding='utf-8'))
    m = int(time.time())
    entete = {'alg': 'RS256', 'typ': 'JWT'}
    corps = {'iss': sa['client_email'],
             'scope': 'https://www.googleapis.com/auth/androidpublisher',
             'aud': 'https://oauth2.googleapis.com/token', 'iat': m, 'exp': m + 3600}
    ns = b64(json.dumps(entete).encode()) + b'.' + b64(json.dumps(corps).encode())
    cle = serialization.load_pem_private_key(sa['private_key'].encode(), password=None)
    sig = cle.sign(ns, padding.PKCS1v15(), hashes.SHA256())
    r = requests.post('https://oauth2.googleapis.com/token', data={
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': (ns + b'.' + b64(sig)).decode()}, timeout=30)
    if r.status_code != 200:
        print('authentification refusee :', r.status_code, r.text[:200])
        sys.exit(2)
    return r.json()['access_token']


def textes(section):
    """Extrait titre / description courte / description complete du dossier."""
    s = io.open(DOSSIER, encoding='utf-8').read()
    if section not in s:
        print("section « %s » introuvable dans PLAY_STORE_FICHES.md" % section)
        sys.exit(2)
    bloc = s.split(section)[1].split('\n## ')[0]

    def bloc_apres(titre):
        if titre not in bloc:
            return None
        return bloc.split(titre)[1].split('```')[1].strip()

    t = {
        'title': bloc_apres("### Nom de l'application"),
        'shortDescription': bloc_apres('### Description courte'),
        'fullDescription': bloc_apres('### Description complète'),
    }
    for k, v in t.items():
        if not v:
            print('le dossier ne donne pas « %s »' % k)
            sys.exit(2)
    return t


def main():
    brut = sys.argv[1:]
    appliquer = '--appliquer' in brut
    args = [a for a in brut if not a.startswith('--')]
    if len(args) != 1 or args[0] not in APPS:
        print(__doc__)
        print('applications connues : ' + ', '.join(APPS))
        return 1
    cfg = APPS[args[0]]
    paquet = cfg['paquet']

    t = textes(cfg['section'])
    print('=== %s (%s) ===\n' % (args[0], paquet))
    print('Textes extraits de PLAY_STORE_FICHES.md :')
    trop = False
    for k in ('title', 'shortDescription', 'fullDescription'):
        n, maxi = len(t[k]), LIMITES[k]
        etat = 'OK' if n <= maxi else '⚠ DEPASSE'
        if n > maxi:
            trop = True
        print('   %-18s %4d/%-5d %s' % (k, n, maxi, etat))
    if trop:
        print('\nUn texte depasse la limite. Play refuserait. Corrige le dossier.')
        return 1

    # Les visuels
    images = []
    p = os.path.join(VISUELS, cfg['icon'])
    if os.path.exists(p):
        images.append(('icon', p))
    p = os.path.join(VISUELS, cfg['featureGraphic'])
    if os.path.exists(p):
        images.append(('featureGraphic', p))
    for i in range(1, 9):
        p = os.path.join(VISUELS, cfg['captures'] % i)
        if os.path.exists(p):
            images.append(('phoneScreenshots', p))

    nb = {}
    for t_, _ in images:
        nb[t_] = nb.get(t_, 0) + 1
    print('\nVisuels trouves :')
    for k, v in nb.items():
        print('   %-22s %d' % (k, v))
    for k, mini in (('icon', 1), ('featureGraphic', 1), ('phoneScreenshots', 2)):
        if nb.get(k, 0) < mini:
            print('\n⚠ Play exige au moins %d « %s ». Il y en a %d.'
                  % (mini, k, nb.get(k, 0)))
            return 1

    if not appliquer:
        print('\nREPETITION A BLANC — rien n a ete ecrit.')
        print('Pour poser la fiche pour de vrai, rajoute --appliquer')
        return 0

    h = {'Authorization': 'Bearer ' + jeton()}
    r = requests.post('%s/%s/edits' % (BASE, paquet), headers=h, timeout=30)
    if r.status_code != 200:
        print('edition refusee :', r.status_code, r.text[:200])
        return 2
    e = r.json()['id']
    racine = '%s/%s/edits/%s' % (BASE, paquet, e)

    def abandonne(code):
        requests.delete(racine, headers=h, timeout=30)
        return code

    # 1. Les textes
    r = requests.put('%s/listings/%s' % (racine, LANGUE), headers=h,
                     json={'language': LANGUE, **t}, timeout=30)
    if r.status_code != 200:
        print('\necriture des textes refusee :', r.status_code, r.text[:400])
        return abandonne(1)
    print('\ntextes poses')

    # 2. Les visuels — on efface d'abord, sinon ils s'empilent a chaque passage
    for type_img in sorted(nb):
        requests.delete('%s/listings/%s/%s' % (racine, LANGUE, type_img),
                        headers=h, timeout=60)
    for type_img, chemin in images:
        with open(chemin, 'rb') as f:
            octets = f.read()
        r = requests.post(
            '%s/%s/edits/%s/listings/%s/%s?uploadType=media'
            % (TELEVERSE, paquet, e, LANGUE, type_img),
            headers={**h, 'Content-Type': 'image/png'}, data=octets, timeout=180)
        if r.status_code != 200:
            print('  %s : REFUSE %s %s' % (os.path.basename(chemin),
                                           r.status_code, r.text[:200]))
            return abandonne(1)
        print('  %-22s %s' % (type_img, os.path.basename(chemin)))

    r = requests.post('%s/%s/edits/%s:commit' % (BASE, paquet, e),
                      headers=h, timeout=120)
    if r.status_code != 200:
        print('\nvalidation refusee :', r.status_code, r.text[:400])
        return abandonne(1)
    print('\nFICHE POSEE. Relis-la avec : python scripts/play-fiche.py %s' % paquet)
    return 0


if __name__ == '__main__':
    sys.exit(main())
