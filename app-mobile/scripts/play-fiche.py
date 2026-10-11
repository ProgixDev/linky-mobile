# -*- coding: utf-8 -*-
"""Lit l'etat de la FICHE Play d'une application : textes et visuels.

Repond sans ouvrir la console : la fiche existe-t-elle, dans quelles langues,
quels textes sont poses, et combien d'images de chaque type sont deposees.

    python scripts/play-fiche.py com.linky.driver

Sortie 0 = lu. 2 = la sonde n'a pas pu mesurer.
"""
import io, json, time, base64, sys
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

CLE = r'C:\Users\Omen\Documents\projects\linky\linky-mobile\app-mobile\google-service-account.json'
BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications'
PAQUET = sys.argv[1] if len(sys.argv) > 1 else 'com.linkygroup.app'

# Les emplacements d'images que Play connait.
TYPES = ['icon', 'featureGraphic', 'phoneScreenshots',
         'sevenInchScreenshots', 'tenInchScreenshots', 'tvBanner']


def b64(o):
    return base64.urlsafe_b64encode(o).rstrip(b'=')


def jeton():
    sa = json.load(io.open(CLE, encoding='utf-8'))
    m = int(time.time())
    entete = {'alg': 'RS256', 'typ': 'JWT'}
    corps = {'iss': sa['client_email'],
             'scope': 'https://www.googleapis.com/auth/androidpublisher',
             'aud': 'https://oauth2.googleapis.com/token', 'iat': m, 'exp': m + 3600}
    non_signe = b64(json.dumps(entete).encode()) + b'.' + b64(json.dumps(corps).encode())
    cle = serialization.load_pem_private_key(sa['private_key'].encode(), password=None)
    sig = cle.sign(non_signe, padding.PKCS1v15(), hashes.SHA256())
    r = requests.post('https://oauth2.googleapis.com/token', data={
        'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        'assertion': (non_signe + b'.' + b64(sig)).decode()}, timeout=30)
    if r.status_code != 200:
        print('authentification refusee :', r.status_code, r.text[:200])
        sys.exit(2)
    return r.json()['access_token']


def main():
    h = {'Authorization': 'Bearer ' + jeton()}
    r = requests.post('%s/%s/edits' % (BASE, PAQUET), headers=h, timeout=30)
    if r.status_code != 200:
        print('edition refusee :', r.status_code, r.text[:200])
        return 2
    e = r.json()['id']
    racine = '%s/%s/edits/%s' % (BASE, PAQUET, e)

    def fin(code):
        requests.delete(racine, headers=h, timeout=30)
        return code

    print('=== %s ===\n' % PAQUET)

    r = requests.get(racine + '/listings', headers=h, timeout=30)
    if r.status_code != 200:
        print('lecture des fiches :', r.status_code, r.text[:200])
        return fin(2)
    fiches = r.json().get('listings', []) or []
    if not fiches:
        print('AUCUNE fiche. Rien n a encore ete saisi.')
    for f in fiches:
        lang = f.get('language')
        print('langue %s' % lang)
        for champ, maxi in (('title', 30), ('shortDescription', 80),
                            ('fullDescription', 4000), ('video', 0)):
            v = (f.get(champ) or '').strip()
            if not v:
                print('   %-18s VIDE' % champ)
            elif champ == 'fullDescription':
                print('   %-18s %d/%d car. — « %s… »'
                      % (champ, len(v), maxi, v.replace('\n', ' ')[:48]))
            else:
                print('   %-18s %s' % (champ, v if len(v) < 60 else v[:57] + '…'))
        print('   images :')
        for t in TYPES:
            ri = requests.get('%s/listings/%s/%s' % (racine, lang, t),
                              headers=h, timeout=30)
            n = len(ri.json().get('images', []) or []) if ri.status_code == 200 else -1
            if n > 0:
                print('      %-22s %d' % (t, n))
        manquants = []
        for t, mini in (('icon', 1), ('featureGraphic', 1), ('phoneScreenshots', 2)):
            ri = requests.get('%s/listings/%s/%s' % (racine, lang, t),
                              headers=h, timeout=30)
            n = len(ri.json().get('images', []) or []) if ri.status_code == 200 else 0
            if n < mini:
                manquants.append('%s (%d/%d)' % (t, n, mini))
        if manquants:
            print('      ⚠ obligatoires manquants : ' + ', '.join(manquants))
        print()
    return fin(0)


if __name__ == '__main__':
    sys.exit(main())
