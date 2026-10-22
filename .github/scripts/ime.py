"""Spremeni ime aplikacije v App Store Connect (ime v TestFlightu in App Store) za vse jezike."""
import os, re, textwrap, time, sys
import jwt, requests

API = "https://api.appstoreconnect.apple.com/v1"
raw = os.environ["KEY_P8"].replace("\\n", "\n")
body = re.sub(r"[^A-Za-z0-9+/=]", "", re.sub(r"-----(BEGIN|END)[A-Z ]*-----", "", raw))
pem = "-----BEGIN PRIVATE KEY-----\n" + "\n".join(textwrap.wrap(body, 64)) + "\n-----END PRIVATE KEY-----\n"
tok = jwt.encode({"iss": os.environ["ISSUER_ID"], "iat": int(time.time()), "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"},
                 pem, algorithm="ES256", headers={"kid": os.environ["KEY_ID"], "typ": "JWT"})
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
IME = os.environ["IME"]

app = requests.get(API + "/apps", headers=H, params={"filter[bundleId]": os.environ["BUNDLE_ID"]}, timeout=60).json()["data"][0]
print(f"::notice::Aplikacija {app['attributes']['name']} ({app['id']})")
napaka = False
for info in requests.get(f"{API}/apps/{app['id']}/appInfos", headers=H, timeout=60).json()["data"]:
    for loc in requests.get(f"{API}/appInfos/{info['id']}/appInfoLocalizations", headers=H, timeout=60).json()["data"]:
        r = requests.patch(f"{API}/appInfoLocalizations/{loc['id']}", headers=H, timeout=60,
                           json={"data": {"type": "appInfoLocalizations", "id": loc["id"], "attributes": {"name": IME}}})
        ok = r.status_code < 400
        napaka |= not ok
        print(("::notice::" if ok else "::error::") + f"{loc['attributes']['locale']} ({info['attributes'].get('appStoreState') or info['attributes'].get('state')}): {r.status_code} {'' if ok else ' '.join(r.text.split())[:600]}")
sys.exit(1 if napaka else 0)
