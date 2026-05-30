#!/usr/bin/env python3
"""AXIOM context-injection measurement harness (v2: correct nested token map + raw save)."""
import urllib.request, json, time, difflib, statistics

BASE = "https://axiom-cognitive-core-production.up.railway.app/v1/chat/completions"
MODEL = "claude-sonnet-4-5"
COMPONENTS = ["memory", "psyche", "goals", "knowledge", "screen", "brain"]
INPUTS = [
    "hey, how's it going?",
    "what have you been thinking about since we last talked?",
    "I'm stuck on a bug where the context injection keeps ballooning. ideas?",
    "do you ever feel like you're not real?",
    "remind me what we decided about the DreamCoder library learning",
    "I'm exhausted, today was rough.",
    "should I transfer to Stanford or Berkeley?",
    "tell me something true about yourself you haven't said before",
]

def call(content, ablate, tries=2):
    body = {"model": MODEL, "stream": False, "harness": True, "ablate": ablate, "temperature": 0,
            "messages": [{"role": "user", "content": content}]}
    for attempt in range(tries):
        try:
            t = time.time()
            req = urllib.request.Request(BASE, data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json"}, method="POST")
            with urllib.request.urlopen(req, timeout=90) as r:
                d = json.load(r)
            text = d.get("choices", [{}])[0].get("message", {}).get("content", "")
            return {"text": text, "ax": d.get("axiom"), "ms": int((time.time()-t)*1000)}
        except Exception as e:
            if attempt == tries - 1:
                return {"text": f"__ERR__ {e}", "ax": None, "ms": 0}
            time.sleep(2)

def sim(a, b): return difflib.SequenceMatcher(None, a, b).ratio()
def avg(xs): return statistics.mean(xs) if xs else 0.0
def tmap(ax): return (ax or {}).get("tokenmap") or {}
def ok(x): return not x["text"].startswith("__ERR__")

def main():
    raw = []
    for i, content in enumerate(INPUTS):
        rec = {"content": content, "b1": call(content, []), "b2": call(content, []), "abl": {}}
        for c in COMPONENTS:
            rec["abl"][c] = call(content, [c])
        raw.append(rec)
        json.dump(raw, open("harness_raw.json", "w"))
        print(f"[{i+1}/{len(INPUTS)}] done: {content[:40]!r}", flush=True)

    tokmaps = [tmap(r["b1"]["ax"]) for r in raw if tmap(r["b1"]["ax"]).get("components")]
    if not tokmaps:
        print("\nNO TOKEN MAPS — calls failed.", flush=True); return
    noise = [1 - sim(r["b1"]["text"], r["b2"]["text"]) for r in raw if ok(r["b1"]) and ok(r["b2"])]
    change = {c: [1 - sim(r["b1"]["text"], r["abl"][c]["text"]) for r in raw if ok(r["b1"]) and ok(r["abl"][c])] for c in COMPONENTS}
    base_lat = avg([r["b1"]["ms"] for r in raw if ok(r["b1"])])

    comp_avg = {c: avg([tm["components"][c] for tm in tokmaps]) for c in COMPONENTS}
    static_avg = avg([tm["static_instructions"] for tm in tokmaps])
    total_avg = avg([tm["injection_total"] for tm in tokmaps])
    final_avg = avg([tm["final_payload"] for tm in tokmaps])
    noise_floor = avg(noise)

    print("\n" + "=" * 66, flush=True)
    print("TOKEN MAP — where the per-turn injection goes (avg over %d inputs)" % len(tokmaps))
    print("=" * 66)
    print("%-22s %8s %8s" % ("component", "tokens", "% inj"))
    print("-" * 40)
    for c in COMPONENTS:
        pct = 100*comp_avg[c]/total_avg if total_avg else 0
        print("%-22s %8.0f %7.1f%%" % (c, comp_avg[c], pct))
    print("%-22s %8.0f %7.1f%%" % ("static_instructions", static_avg, 100*static_avg/total_avg if total_avg else 0))
    print("-" * 40)
    print("%-22s %8.0f %7s" % ("INJECTION TOTAL", total_avg, "100%"))
    print("%-22s %8.0f" % ("FINAL PAYLOAD (post-cap)", final_avg))
    print("%-22s %8.0f ms" % ("avg latency/turn", base_lat))

    print("\n" + "=" * 66, flush=True)
    print("ABLATION — does removing a region change the response?")
    print("noise floor (baseline vs baseline, same input): %.3f" % noise_floor)
    print("changes at/below noise = no real effect; >1.5x noise = load-bearing")
    print("=" * 66)
    print("%-12s %7s %7s %12s %9s   %s" % ("component", "tokens", "%inj", "resp-change", "vs noise", "verdict"))
    print("-" * 72)
    results = []
    for c in COMPONENTS:
        ch = avg(change[c]); ratio = ch/noise_floor if noise_floor > 0 else 0
        pct = 100*comp_avg[c]/total_avg if total_avg else 0
        verdict = "LOAD-BEARING" if ch > noise_floor*1.5 else ("marginal" if ch > noise_floor*1.05 else "DECORATIVE")
        print("%-12s %7.0f %6.1f%% %12.3f %8.1fx   %s" % (c, comp_avg[c], pct, ch, ratio, verdict), flush=True)
        results.append({"component": c, "tokens": round(comp_avg[c]), "pct_injection": round(pct,1),
                        "resp_change": round(ch,3), "vs_noise": round(ratio,2), "verdict": verdict})

    json.dump({"inputs": len(tokmaps), "noise_floor": round(noise_floor,3), "avg_latency_ms": round(base_lat),
               "token_map": {**{c: round(comp_avg[c]) for c in COMPONENTS}, "static_instructions": round(static_avg),
                             "injection_total": round(total_avg), "final_payload": round(final_avg)},
               "ablation": results}, open("harness_results.json","w"), indent=2)
    print("\nSaved harness_results.json\nDONE", flush=True)

if __name__ == "__main__":
    main()
