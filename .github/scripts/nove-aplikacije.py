"""Vsak javni repozitorij na GitHubu (myedgeofficial), ki še nima mape, doda pod Apps v Studio.
Izbrisane samodejne mape (nastavitve/samodejno.izpusti) se ne vrnejo."""
import json, os, re, subprocess, sys, urllib.request

P = os.environ["P"]
OWNER = os.environ.get("OWNER", "myedgeofficial")
IZPUSTI = {"byurska-studio", "myedgeofficial.github.io"}
DB = f"https://firestore.googleapis.com/v1/projects/{P}/databases/(default)/documents"
TOKEN = subprocess.check_output(["gcloud", "auth", "print-access-token"], text=True).strip()


def req(url, method="GET", body=None, auth=True):
    h = {"Content-Type": "application/json", "User-Agent": "byurska-studio"}
    if auth:
        h["Authorization"] = f"Bearer {TOKEN}"
    elif os.environ.get("GH_TOKEN"):
        h["Authorization"] = f"Bearer {os.environ['GH_TOKEN']}"
    r = urllib.request.Request(url, method=method, headers=h, data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(r, timeout=60) as f:
            return json.load(f)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        sys.exit(f"::error::{method} {url} -> {e.code} {e.read().decode()[:400]}")


val = lambda f: next(iter(f.values())) if isinstance(f, dict) else None
mape, tok = [], ""
while True:
    d = req(f"{DB}/mape?pageSize=300" + (f"&pageToken={tok}" if tok else "")) or {}
    for doc in d.get("documents", []):
        f = doc.get("fields", {})
        mape.append({k: val(v) for k, v in f.items()} | {"id": doc["name"].split("/")[-1]})
    tok = d.get("nextPageToken")
    if not tok:
        break
if not mape:
    print("::notice::Mape še niso ustvarjene (prvi zagon aplikacije). Preskočeno.")
    sys.exit(0)

s = req(f"{DB}/nastavitve/samodejno") or {}
izpusti = IZPUSTI | {v.get("stringValue", "") for v in s.get("fields", {}).get("izpusti", {}).get("arrayValue", {}).get("values", [])}
norm = lambda x: re.sub(r"[^a-z0-9]", "", str(x or "").lower())
imamo = {norm(m.get("repo")) for m in mape} | {norm(m.get("ime")) for m in mape} | {norm(m["id"]) for m in mape}
red = max([int(m.get("red") or 0) for m in mape if m.get("oce") == "apps"] + [10])

repos = req(f"https://api.github.com/users/{OWNER}/repos?per_page=100&type=owner&sort=created", auth=False) or []
dodanih = 0
for r in repos:
    ime = r["name"]
    if r.get("fork") or r.get("archived") or ime.lower() in izpusti or norm(ime) in imamo:
        continue
    lepo = " ".join(w.capitalize() for w in re.split(r"[-_]+", ime))
    url = r.get("homepage") or (f"https://{OWNER}.github.io/{ime}/" if r.get("has_pages") else None)
    red += 1
    polja = {"ime": {"stringValue": lepo}, "oce": {"stringValue": "apps"}, "red": {"integerValue": str(red)},
             "repo": {"stringValue": ime.lower()}, "samodejno": {"booleanValue": True}}
    polja["url"] = {"stringValue": url} if url else {"nullValue": None}
    req(f"{DB}/mape/gh-{norm(ime)}?currentDocument.exists=false", "PATCH", {"fields": polja})
    print(f"::notice::Dodana app {lepo}")
    dodanih += 1
print(f"Novih app: {dodanih}")
