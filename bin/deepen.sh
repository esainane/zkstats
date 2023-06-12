#!/bin/bash

set -ex

main() {
  local amount="$1"
  systemctl disable zkreplay-fetch.timer zkreplay-process.timer
  local base="$(ls -1 /var/lib/zkreplay/demos/ | grep -v index | wc -l)"
  su - zkreplayfetch -s /bin/bash -c "/var/lib/zkreplay/bin/scrape.sh '$base' '$(($base + $amount))'"
  systemctl enable zkreplay-fetch.timer zkreplay-process.timer
}

if [ $# -lt 1 ]; then
  echo "Usage: $0 DEEPEN-AMOUNT"
  echo "Deepens history by at most DEEPEN-AMOUNT."
  echo
  echo "The actual amount deepened by depends on the number of new replays that"
  echo "have been added since the last time the index was updated and used."
  exit 1
fi

main "$1"
