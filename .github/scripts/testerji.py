"""Doda ekipo kot interne testerje na TestFlightu (skupina "Ekipa", vsi buildi).
Kdor še ni uporabnik v App Store Connect (npr. Nives), dobi povabilo z najmanjšimi pravicami samo za to aplikacijo;
ko ga sprejme, workflow zaženi še enkrat."""
import os, re, sys, textwrap, time
import jwt, requests

API = "https://api.appstoreconnect.apple.com/v1"
raw = os.environ["KEY_P8"].replace("\\n", "\n")
body = re.sub(r"[^A-Za-z0-9+/=]", "", re.sub(r"-----(BEGIN|END)[A-Z ]*-----", "", raw))
pem = "-----BEGIN PRIVATE KEY-----\n" + "\n".join(textwrap.wrap(body, 64)) + "\n-----END PRIVATE KEY-----\n"
tok = jwt.encode({"iss": os.environ["ISSUER_ID"], "iat": int(time.time()), "exp": int(time.time()) + 1200, "aud": "appstoreconnect-v1"},
                 pem, algorithm="ES256", headers={"kid": os.environ["KEY_ID"], "typ": "JWT"})
H = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def call(method, path, **kw):
    r = requests.request(method, API + path, headers=H, timeout=60, **kw)
    if r.status_code >= 400:
        print(f"::warning::{method} {path} -> {r.status_code} {' '.join(r.text.split())[:600]}")
    return r


apps = call("GET", "/apps", params={"filter[bundleId]": os.environ["BUNDLE_ID"]}).json().get("data", [])
if not apps:
    sys.exit(f"::error::V App Store Connect ni aplikacije z ID-jem paketa {os.environ['BUNDLE_ID']}. Najprej jo ustvari (glej README).")
app = apps[0]
print(f"::notice::Aplikacija {app['attributes']['name']} ({app['id']})")

grupe = call("GET", f"/apps/{app['id']}/betaGroups").json()["data"]
grupa = next((g for g in grupe if g["attributes"].get("isInternalGroup")), None)
if not grupa:
    grupa = call("POST", "/betaGroups", json={"data": {"type": "betaGroups",
        "attributes": {"name": "Ekipa", "isInternalGroup": True, "hasAccessToAllBuilds": True},
        "relationships": {"app": {"data": {"type": "apps", "id": app["id"]}}}}}).json()["data"]
print(f"::notice::Interna skupina {grupa['attributes']['name']}")

uporabniki = {u["attributes"]["username"].lower() for u in call("GET", "/users", params={"limit": 200}).json().get("data", [])}
povabljeni = {u["attributes"]["email"].lower() for u in call("GET", "/userInvitations", params={"limit": 200}).json().get("data", [])}
napaka = False

for email in [e.strip().lower() for e in os.environ["EMAILS"].split(",") if e.strip()]:
    if email not in uporabniki:
        if email in povabljeni:
            print(f"::warning::{email} še ni sprejel(a) povabila v App Store Connect (poglej e-pošto od Apple). Nato zaženi znova.")
            continue
        ime = email.split("@")[0]
        r = call("POST", "/userInvitations", json={"data": {"type": "userInvitations", "attributes": {
            "email": email, "firstName": ime.capitalize(), "lastName": "Tester", "roles": ["CUSTOMER_SUPPORT"],
            "allAppsVisible": False, "provisioningAllowed": False},
            "relationships": {"visibleApps": {"data": [{"type": "apps", "id": app["id"]}]}}}})
        if r.status_code < 300:
            print(f"::notice::{email} je dobil(a) povabilo v ekipo (samo za to aplikacijo). Ko ga sprejme, zaženi ta workflow znova.")
        else:
            napaka = True
        continue
    obst = call("GET", "/betaTesters", params={"filter[email]": email}).json()["data"]
    if obst:
        r = call("POST", f"/betaGroups/{grupa['id']}/relationships/betaTesters", json={"data": [{"type": "betaTesters", "id": obst[0]["id"]}]})
    else:
        r = call("POST", "/betaTesters", json={"data": {"type": "betaTesters", "attributes": {"email": email},
                 "relationships": {"betaGroups": {"data": [{"type": "betaGroups", "id": grupa["id"]}]}}}})
    print(("::notice::Tester " if r.status_code < 300 else "::error::Ni dodan ") + email)
    napaka |= r.status_code >= 300

sys.exit(1 if napaka else 0)
