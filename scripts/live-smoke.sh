#!/usr/bin/env bash
# Read-only live smoke against Binance Agentic Wallet (baw).
# Does NOT run mutating commands (send, deposit, swap execute, etc.).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT/demo"
OUT_FILE="$OUT_DIR/live-smoke.txt"
mkdir -p "$OUT_DIR"

# Tee all stdout/stderr to demo/live-smoke.txt (truncate each run)
exec > >(tee "$OUT_FILE") 2>&1

PASS=0
FAIL=0
SKIP_NOTE=""

resolve_baw() {
  if [[ -n "${BAW_BIN:-}" && -x "$BAW_BIN" ]]; then
    echo "$BAW_BIN"
    return 0
  fi
  if [[ -x "$HOME/.local/bin/baw" ]]; then
    echo "$HOME/.local/bin/baw"
    return 0
  fi
  if command -v baw >/dev/null 2>&1; then
    command -v baw
    return 0
  fi
  return 1
}

if ! BAW="$(resolve_baw)"; then
  echo "FAIL: baw not found (set BAW_BIN, install to ~/.local/bin/baw, or put baw on PATH)"
  echo "SUMMARY fail"
  exit 1
fi

echo "=== live-smoke: using baw at $BAW ==="
echo "=== $(date -u '+%Y-%m-%dT%H:%M:%SZ') UTC ==="
echo

run_check() {
  local name="$1"
  shift
  echo "----- $name -----"
  echo "+ $BAW $* --json"
  local out ec=0
  # Capture output even on non-zero; do not abort set -e mid-suite for soft fails
  set +e
  out="$("$BAW" "$@" --json 2>&1)"
  ec=$?
  set -e
  echo "$out"
  if [[ $ec -ne 0 ]]; then
    echo "RESULT: FAIL ($name) exit=$ec"
    FAIL=$((FAIL + 1))
    return 1
  fi
  echo "RESULT: PASS ($name)"
  PASS=$((PASS + 1))
  # stash last JSON for callers via global LAST_JSON
  LAST_JSON="$out"
  return 0
}

# --- 1) wallet status (must be CONNECTED) ---
LAST_JSON=""
if ! run_check "wallet status" wallet status; then
  echo
  echo "SUMMARY fail (wallet status command failed)"
  exit 1
fi

STATUS_JSON="$LAST_JSON"
# Accept connectionStatus or status fields containing CONNECTED
if ! printf '%s' "$STATUS_JSON" | python3 -c '
import json,sys
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except Exception as e:
    # sometimes CLI wraps or prints banners; try last JSON object
    start=raw.find("{")
    end=raw.rfind("}")
    if start<0 or end<0:
        print("PARSE_ERROR:"+str(e)); sys.exit(3)
    d=json.loads(raw[start:end+1])
# flatten common shapes
vals=[]
def walk(x):
    if isinstance(x, dict):
        for k,v in x.items():
            if k in ("connectionStatus","status","walletStatus","authStatus") and isinstance(v,str):
                vals.append(v)
            walk(v)
    elif isinstance(x, list):
        for i in x: walk(i)
walk(d)
ok = any(v.upper()=="CONNECTED" for v in vals) or ("CONNECTED" in json.dumps(d))
print("connection_fields="+",".join(vals) if vals else "connection_fields=(none)")
sys.exit(0 if ok else 2)
'; then
  echo "FAIL: wallet status is not CONNECTED (required for live smoke)"
  echo "Hint: real auth is: baw auth signin → Binance App QR → baw auth verify"
  echo "      (Hub Connect alone is not enough)"
  echo
  echo "SUMMARY fail"
  exit 2
fi
echo "STATUS: CONNECTED OK"
echo

# --- remaining read-only checks ---
run_check "wallet address" wallet address || true
run_check "wallet balance" wallet balance || true
BALANCE_JSON="${LAST_JSON:-}"
run_check "wallet settings" wallet settings || true
run_check "wallet left-quota" wallet left-quota || true
run_check "wallet chains" wallet chains || true
run_check "defi position" defi position || true
run_check "defi protocol-list" defi protocol-list || true

# --- quote 1 USDT -> BNB (read-only) ---
USDT=0x55d398326f99059fF775485246999027B3197955
BNB=0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE
run_check "market-order quote 1 USDT->BNB" market-order quote --binanceChainId 56 --fromTokenQty 1 --fromToken "$USDT" --toToken "$BNB" || true
echo

# --- empty balance → SKIP stake/swap note (read-only; we never mutate) ---
if [[ -n "${BALANCE_JSON:-}" ]]; then
  EMPTY="$(printf '%s' "$BALANCE_JSON" | python3 -c '
import json,sys
raw=sys.stdin.read()
try:
    d=json.loads(raw)
except Exception:
    s,e=raw.find("{"),raw.rfind("}")
    a,b=raw.find("["),raw.rfind("]")
    # prefer array root if balance returns a list
    if a>=0 and (s<0 or a<s):
        d=json.loads(raw[a:b+1])
    elif s>=0:
        d=json.loads(raw[s:e+1])
    else:
        print("unknown"); sys.exit(0)
def is_empty(x):
    if x is None: return True
    if isinstance(x, list): return len(x)==0
    if isinstance(x, dict):
        for k in ("data","balances","tokens","list","result"):
            if k in x:
                return is_empty(x[k])
        # empty object with no balance-like keys
        return False
    return False
print("empty" if is_empty(d) else "nonempty")
' 2>/dev/null || echo unknown)"
  if [[ "$EMPTY" == "empty" ]]; then
    SKIP_NOTE="SKIP stake/swap — fund wallet first"
    echo
    echo "$SKIP_NOTE"
  fi
fi


echo
echo "========== JUDGE CHECKLIST (ChainPulse / Track A) =========="
echo "HOOK: Automated on-chain workflows (swap/stake/DeFi) via BAW — caps + App confirmations."
echo "  · NOT NewsPulse (CEX news trading)"
echo "  · NOT PayPulse (A2A micropay); x402 is wallet quota only"
echo "Auth: baw auth signin → App QR → verify until CONNECTED (Hub Connect alone is not enough)"
echo "Caps (documented defaults): swap ~USD50k / defi ~USD5k / x402 ~USD20 per day"
echo "Honesty: PENDING = awaiting App confirm (not success); REJECTED = clear reason; no fake live fills"
echo "Demo: see JUDGE.md (60-90s). Rationales: why swap/stake/skip (rules-based)."
echo "============================================================"
echo

if [[ $FAIL -eq 0 ]]; then
  echo "SUMMARY pass ($PASS checks)"
  [[ -n "$SKIP_NOTE" ]] && echo "$SKIP_NOTE"
  echo "LIVE_SMOKE_PASS"
  exit 0
else
  echo "SUMMARY fail (pass=$PASS fail=$FAIL)"
  [[ -n "$SKIP_NOTE" ]] && echo "$SKIP_NOTE"
  exit 1
fi
