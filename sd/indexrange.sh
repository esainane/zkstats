#!/bin/bash

set -e

retrieve_all_types() {
    local offset="$1"
    shift
    while [ $# -gt 0 ]; do
        local title="$1"
        shift
        curl -s "https://zero-k.info/Battles?Title=${title}&Map=&PlayersFrom=2&PlayersTo=2&Age=0&Mission=2&Bots=2&Rank=8&Victory=0&Offset=$offset" | sed -n "s_^.*<a href='/Battles/Detail/\([0-9]\+\)'.*\$_\1_p"
        sleep 0.2
    done
}


main() {
    local start="$1"
    local end="$2"
    shift 2
    while read offset; do
        retrieve_all_types "$offset" "$@"
    done < <(seq "$start" 40 "$end") | grep -vxFf demos/exclude.txt | paste -d\  -s - | sed 's/^/BATTLEIDS:=/' > demos/index.mk.tmp
    mv -f demos/index.mk.tmp demos/index.mk.in
    mv -f demos/index.mk.in demos/index.mk
    make -Rr demos || make -Rr demos # Fetching a new game version sometimes fails the first time. FIXME!
}

if [ $# -lt 2 ]; then
  echo "Usage: $0 REPLAYS-OFFSET REPLAYS-AMOUNT"
  echo "Updates the replay index, and fetches replays and all dependencies."
  echo
  echo "Will be rounded up to the nearest multiple of 40, as that is what the"
  echo "website paginates by."
  exit 1
fi

main "$1" "$2" "MM+" "[A]%20Pro%201v1%20Host"
