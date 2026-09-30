# -*- coding: utf-8 -*-
"""Lit l'etat REEL des canaux de test via l'API Google Play Developer.

Repond a une seule question, sans deviner : la version de test ferme est-elle
publiee, ou encore en revue ? La console est la source de verite, mais elle
demande un humain ; cette sonde interroge la meme donnee avec la cle de compte
de service qu'on a creee pour `eas submit`.

Droits requis : « Afficher les informations sur l'application » — deja accorde.
"""
import io, json, time, base64, sys
import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

CLE = r'C:\Users\Omen\Documents\projects\linky\linky-mobile\app-mobile\google-service-account.json'
PAQUET = 'com.linkygroup.app'


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
    r.raise_for_status()
    return r.json()['access_token']


def main():
    t = jeton()
    h = {'Authorization': 'Bearer ' + t}
    base = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/%s' % PAQUET

    # Une « edition » est le contexte de lecture/ecriture de l'API. On la cree,
    # on lit, on l'abandonne : rien n'est modifie.
    r = requests.post(base + '/edits', headers=h, timeout=30)
    if r.status_code != 200:
        print('creation de l edition :', r.status_code, r.text[:300])
        return
    eid = r.json()['id']

    try:
        r = requests.get('%s/edits/%s/tracks' % (base, eid), headers=h, timeout=30)
        if r.status_code != 200:
            print('lecture des canaux :', r.status_code, r.text[:300])
            return
        for piste in r.json().get('tracks', []):
            nom = piste.get('track')
            sorties = piste.get('releases', [])
            if not sorties:
                print('%-18s (aucune version)' % nom)
                continue
            for s in sorties:
                codes = ','.join(str(c) for c in s.get('versionCodes', []) or [])
                print('%-18s statut=%-12s versionCode=%-6s %s'
                      % (nom, s.get('status', '?'), codes or '-', s.get('name', '')))
    finally:
        requests.delete('%s/edits/%s' % (base, eid), headers=h, timeout=30)


main()
