#!/bin/bash
# usage: runx.sh <set: heldout2|heldout3> <version: A|C|D...> <label-name>; KB per version below
export KB_LLM_FACTS="${KB_LLM_FACTS:-0}"   # rules-only facts: no default-on LLM facts fallback (KB_LLM_FACTS=1 to enable)
S=${SCRATCH}; O=$S/heldout2-runs
SET=$1 V=$2 N=$3; H=$S/$SET
case $V in A) KB=$S/kb-go;; C) KB="node $O/ts-snap-c/dist/cli.js";; *) KB="node $O/ts-snap-$(echo $V | tr A-Z a-z)/dist/cli.js";; esac
D=$O/$SET-runs-$V/$N; [ $SET = heldout2 ] && D=$O/runs-$V/$N; rm -rf $D; mkdir -p $D
R=$(ACC_REPOS=$H/repos node /home/user/codewiki-ts/bench/accuracy/bin/mkcfg.mjs $H/labels/$N.json $D 2>$D/mkcfg.err) || { echo "$V $N mkcfg fail"; exit 1; }
{ date -u; echo "repo=$R"; S0=$SECONDS; timeout 1200 $KB compound --root $R --config $D/codewiki.yaml --llm template --full; echo "compound exit $? at $((SECONDS-S0))s"; timeout 600 $KB verify --root $R --config $D/codewiki.yaml > $D/verify.log 2>&1; echo "verify exit $?"; echo "dirty: $(git -C $R status --porcelain --ignored | wc -l)"; } > $D/run.log 2>&1
echo "$SET $V $N: $(grep -h 'exit\|dirty' $D/run.log | tr '\n' ' ') | $(grep -h 'verify PASS\|verify FAIL' $D/verify.log | head -1)"
