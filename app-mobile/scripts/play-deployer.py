# -*- coding: utf-8 -*-
"""Fait passer une version de BROUILLON a DEPLOYEE sur une piste de test.

C'est le bouton « Demarrer le deploiement » de la console, en ligne de commande.
Il existe parce que la console demande un humain et une navigation, alors que la
meme donnee est accessible a la cle de compte de service deja creee pour
`eas submit` (cf play-tracks.py, dont il reprend l'authentification).

REPETITION A BLANC PAR DEFAUT. Sans `--appliquer`, il lit, montre ce qu'il
changerait, et n'ecrit RIEN : l'edition est supprimee au lieu d'etre validee.
Publier vers de vrais testeurs ne se fait pas a l'aveugle.

    python scripts/play-deployer.py alpha 21              # montre
    python scripts/play-deployer.py alpha 21 --appliquer  # publie

Sortie 0 = fait (ou blanc concluant). 1 = refus motive. 2 = la sonde ne mesure
plus rien.
"""
import io, json, time, base64, sys
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

CLE = r'C:\Users\Omen\Documents\projects\linky\linky-mobile\app-mobile\google-service-account.json'
PAQUET = 'com.linkygroup.app'
BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'


def b64(o):
    return base64.urlsafe_b64encode(o).rstrip(b'=')


def jeton():
    """Un JWT signe RS256, echange contre un jeton d'acces OAuth."""
    sa = json.load(io.open(CLE, encoding='utf-8'))
    maintenant = int(time.time())
    entete = {'alg': 'RS256', 'typ': 'JWT'}
    corps = {
        'iss': sa['client_email'],
        'scope': 'https://www.googleapis.com/auth/androidpublisher',
        'aud': 'https://oauth2.googleapis.com/token',
        'iat': maintenant,
        'exp': maintenant + 3600,
    }
    non_signe = b64(json.dumps(entete).encode()) + b'.' + b64(json.dumps(corps).encode())
    cle = serialization.load_pem_private_key(sa['private_key'].encode(), password=None)
    sig = cle.sign(non_signe, padding.PKCS1v15(), hashes.SHA256())
    assertion = (non_signe + b'.' + b64(sig)).decode()
    r = requests.post('https://oauth2.googleapis.com/token', data={
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': assertion,
    }, timeout=30)
    if r.status_code != 200:
        print('authentification refusee :', r.status_code, r.text[:300])
        sys.exit(2)
    return r.json()['access_token']


def main():
    brut = sys.argv[1:]
    appliquer = '--appliquer' in brut

    notes_fr = None
    if '--notes' in brut:
        i = brut.index('--notes')
        if i + 1 >= len(brut):
            print('--notes attend un chemin de fichier')
            return 1
        notes_fr = io.open(brut[i + 1], encoding='utf-8').read().strip()
        del brut[i:i + 2]

    args = [a for a in brut if not a.startswith('--')]
    if len(args) != 2:
        print(__doc__)
        return 1
    piste, cible = args[0], int(args[1])

    h = {'Authorization': 'Bearer ' + jeton()}

    r = requests.post('%s/%s/edits' % (BASE, PAQUET), headers=h, timeout=30)
    if r.status_code != 200:
        print('creation de l edition :', r.status_code, r.text[:300])
        return 2
    edit = r.json()['id']

    def abandonne(code):
        requests.delete('%s/%s/edits/%s' % (BASE, PAQUET, edit), headers=h, timeout=30)
        return code

    url = '%s/%s/edits/%s/tracks/%s' % (BASE, PAQUET, edit, piste)
    r = requests.get(url, headers=h, timeout=30)
    if r.status_code != 200:
        print('lecture de la piste %s :' % piste, r.status_code, r.text[:300])
        return abandonne(2)
    track = r.json()
    sorties = track.get('releases', []) or []

    print('Piste « %s » — etat actuel :' % piste)
    for s in sorties:
        codes = ','.join(str(c) for c in s.get('versionCodes', []) or [])
        print('   statut=%-10s versionCode=%-8s %s' % (
            s.get('status'), codes, s.get('name', '')))

    vise = [s for s in sorties
            if cible in [int(c) for c in (s.get('versionCodes') or [])]]
    if not vise:
        print("\nAucune version %d sur cette piste. Rien a faire." % cible)
        return abandonne(1)
    vise = vise[0]

    if vise.get('status') == 'completed':
        print("\nLe %d est DEJA deploye. Rien a faire." % cible)
        return abandonne(0)
    if vise.get('status') != 'draft':
        print("\nLe %d est en statut « %s », pas « draft ». Je n'y touche pas."
              % (cible, vise.get('status')))
        return abandonne(1)

    # Une piste ne garde qu'UNE version deployee : l'API refuse
    # « Only one completed release is allowed. » La precedente n'est donc pas
    # conservee a cote, elle est REMPLACEE — elle reste dans l'historique des
    # versions de la console, et c'est bien ce que Google appelle « publier une
    # nouvelle version ».
    remplacees = [s for s in sorties
                  if s is not vise and s.get('status') == 'completed']

    print('\nCe qui changerait :')
    print('   versionCode %d :  draft  ->  completed' % cible)
    for s in remplacees:
        codes = ','.join(str(c) for c in s.get('versionCodes', []) or [])
        print('   versionCode %-8s remplacee (reste dans l historique)' % codes)
    print('   effet : la version part vers les testeurs de la piste « %s »' % piste)

    if notes_fr is not None:
        vise['releaseNotes'] = [{'language': 'fr-FR', 'text': notes_fr}]
        print('\n   notes de version (fr-FR) :')
        for ligne in notes_fr.splitlines():
            print('      ' + ligne)
    elif not vise.get('releaseNotes'):
        print('\n   ATTENTION : aucune note de version. Les testeurs recevront')
        print('   une mise a jour muette. Passe --notes <fichier> pour en poser.')

    if not appliquer:
        print('\nREPETITION A BLANC — rien n a ete ecrit, l edition est abandonnee.')
        print('Pour publier pour de vrai, rajoute --appliquer')
        return abandonne(0)

    vise['status'] = 'completed'
    vise.pop('userFraction', None)   # reserve aux deploiements progressifs
    track['releases'] = [vise] + [s for s in sorties
                                  if s is not vise and s not in remplacees]
    r = requests.put(url, headers=h, json=track, timeout=30)
    if r.status_code != 200:
        print('\necriture refusee :', r.status_code, r.text[:500])
        return abandonne(1)

    r = requests.post('%s/%s/edits/%s:commit' % (BASE, PAQUET, edit),
                      headers=h, timeout=60)
    if r.status_code != 200:
        print('\nvalidation refusee :', r.status_code, r.text[:500])
        return abandonne(1)

    print('\nDEPLOYE. Le %d est parti sur la piste « %s ».' % (cible, piste))
    return 0


if __name__ == '__main__':
    sys.exit(main())
