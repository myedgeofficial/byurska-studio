# Iz izpisa »firebase apps:sdkconfig WEB --json« izlušči nastavitve spletne aplikacije (apiKey, projectId ...).
import json, sys

def find(o):
    if isinstance(o, dict):
        if "apiKey" in o and "projectId" in o:
            return o
        for v in o.values():
            r = find(v)
            if r: return r
    if isinstance(o, list):
        for v in o:
            r = find(v)
            if r: return r
    return None

cfg = find(json.load(sys.stdin))
if not cfg:
    sys.exit("Nastavitev Firebase ni bilo mogoče prebrati")
if len(sys.argv) > 1 and not cfg.get("storageBucket"):
    cfg["storageBucket"] = sys.argv[1]
print(json.dumps(cfg))
