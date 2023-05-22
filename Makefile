#!/usr/bin/env make -rR
# Expects to be in /var/lib/zkreplay

default:
	echo "Please specify one of demos, stats, summaries, or a more specific target."
	false

ZKDIR:=/var/lib/zkreplay/Zero-K

SHELL:=/bin/bash
MAXSIMTIME=4h

# XXX: Assumes that ZKDIR contains exactly one hyphen, and that the spring version is separated by another hyphen.
LATESTSPRING:=$(shell ls -1d $(ZKDIR)/engine/linux64/* | sort --key=1,2d --key=3n --field-separator=- | tail -1)
ifndef PRDOWNLOADER
#ifeq ($(LATESTSPRING),104.0.1-1477-g8ecf38a)
# Workaround for 104.0.1-1477-g8ecf38a's pr-downloader failing to --download-game
PRDOWNLOADER:=$(ZKDIR)/engine/linux64/104.0.1-1435-g79d77ca/pr-downloader
#else
#PRDOWNLOADER:=$(LATESTSPRING)/pr-downloader
#endif
endif

# Demos/index.mk is a rolling list of the most recent Battle IDs. If zkstats is not run frequently enough, some may be missed!
-include demos/index.mk
# BATTLEIDS is the set of battle IDs that we can get from the index
# ALLBATTLEIDS is BATTLEIDS, plus what we already have locally.
EXCLUDEDBATTLEIDS:=$(shell cut -d\  -f1 demos/exclude.txt)
ALLBATTLEIDS:=$(filter-out $(EXCLUDEDBATTLEIDS), $(BATTLEIDS) $(shell find demos -mindepth 1 -maxdepth 1 -type d | sed 's_^.*/\([^\/*]\)_\1_')) 1394550 1389329
REPLAYS:=$(addprefix demos/,$(addsuffix /replay.sdfz, $(ALLBATTLEIDS)))
RDETAILS:=$(addprefix demos/,$(addsuffix /detail.html, $(ALLBATTLEIDS)))
EVENTS:=$(addprefix stats/,$(addsuffix /events.log, $(ALLBATTLEIDS)))
EVENTDEPS:=$(addprefix demos/,$(addsuffix /events.log.deps, $(ALLBATTLEIDS)))
SUMMARIES:=$(addprefix summaries/,$(addsuffix /summary.json, $(ALLBATTLEIDS)))

demos: demos/index.mk fetch-replays $(REPLAYS) $(RDETAILS)

stats: $(EVENTS)

summaries: $(SUMMARIES) summaries/all.json

.PHONY: default demos stats summaries fetch-replays demos/index.mk
.SECONDARY:

fetch-replays: $(REPLAYS) $(RDETAILS)

# If we can't find a zero-k.info URL to download a map from, instead look for 'Manual downloads:', and if the next line has a link, use that.
# This is exactly as fragile as it sounds, but it seems to work for all existing maps, and new maps seem to have a zk link anyway.
define mapmanualfallback
/Manual downloads:/{
n
s/\r//
s_^.*<a href='\([^']\+\)'.*$$_\1_p
}
endef

define getspringversion
/Engine version:/{
n
n
n
s/\r//
s_^ *\([-a-zA-Z0-9_.]\+\)$$_\1_p
}
endef

define getzkversion
/Game version:/{
n
n
n
s/\r//
s_^ *\([-a-zA-Z0-9_. ]\+\)$$_\1_p
}
endef

export getspringversion
export getzkversion
# This tries to build a dependency file once we have the battle detail available.
demos/%/events.log.deps: demos/%/detail.html
	MAPID=$$(sed -n 's_^.*<a href="/Maps/Detail/\([0-9]\+\)".*$$_\1_p' "$<") && echo "demos/$*/replay.sdfz: | maps/$${MAPID}.html" > "$@.tmp"
	SPRINGVERSION=$$(sed -n "$${getspringversion}" demos/$*/detail.html) && echo "demos/$*/replay.sdfz: | $(ZKDIR)/engine/linux64/$${SPRINGVERSION}/spring-headless" >> "$@.tmp"
	ZKVERSION=$$(sed -n "$${getzkversion}" demos/$*/detail.html) && echo "$${ZKVERSION}" && echo "demos/$*/replay.sdfz: | games/$$(sed 's/ /\\ /g' <<< "$${ZKVERSION}")" >> "$@.tmp"
	mv -f "$@.tmp" "$@"

# Index for rapid downloader.
$(ZKDIR)/rapid/repos.springrts.com/zk/versions.gz:
	$(PRDOWNLOADER) --filesystem-writepath "$(ZKDIR)"

# Download different Zero-K versions.
games/%: | $(ZKDIR)/rapid/repos.springrts.com/zk/versions.gz
	mkdir -p games
	ZKHASH=$$(zgrep -F "$*" "$(ZKDIR)/rapid/repos.springrts.com/zk/versions.gz" | grep '^zk:git:' | cut -f2 -d, ) && echo && echo "Downloading "$*" hash $${ZKHASH}..." && echo && $(PRDOWNLOADER) --download-game "$*" --filesystem-writepath "$(ZKDIR)" && test -e "$(ZKDIR)/packages/$${ZKHASH}.sdp" && ln -sf "$(ZKDIR)/packages/$${ZKHASH}.sdp" "$@"

# Download different springrts versions.
# pr-downloader variant reverted until it can be reworked to fit the zk directory structure?
#$(ZKDIR)/engine/linux64/%/spring-headless:
#	$(PRDOWNLOADER) --download-engine "spring $* maintenance" --filesystem-writepath "$(ZKDIR)"

$(ZKDIR)/engine/linux64/%/spring-headless:
	WORK=$$(mktemp -d) && echo; echo "=== Attempting to fetch spring engine version $*" ===; echo; curl -LsS "https://zero-k.info/engine/linux64/$*.zip" > "$${WORK}/$*.zip" && cd "$(ZKDIR)/engine/linux64" && mkdir -p "$*" && cd "$*" && unzip "$${WORK}/$*.zip" && chmod -R o-w . && chmod -R g+rX . && chmod g+x spring spring-headless spring-dedicated; rm -rf "$${WORK}"; test -x "$(ZKDIR)/engine/linux64/$*/spring-headless"

# Download different maps.
# Prefer a https://zero-k.info download link first, then the first entry of
# the manual downloads link.
# Note that ZKI is naughty, and can provide an invalid URL for a[href].
# If the map file contained spaces/quotes/etc, then this URL will also
# contain spaces/quotes/etc. Check against the following if modifying this
# code, to make sure nothing broke:
#  - 'Crystallized Plains 1.01.sd7'
#  - 'Lowland Crossing Revised v2'
#  - 'Ram Ramp v0.2.sd7'
#  - 'Rosetta 1.3.sd7'
#  - 'Stradvar Valleys.sd7'
#  - 'Tombstone Desert V2.sd7'
# Make sure that the files are saved with the non-uri encoded name!
# Modern browsers will silently fix this junk when encountered, but curl will
# not, and error out. To fix this, we call jq to uri-encode the final
# component, but not the rest of the URL.
# ...I am so sorry.
export mapmanualfallback
maps/%.html:
	BASE=$$(pwd) && if [ ! -f "maps/$*.html" ]; then echo; echo "=== Attempting to fetch map $*... ==="; echo; cd maps/ && curl -LsS -R "https://zero-k.info/Maps/Detail/$*" > "$*.html" && read -r -t 15 MAPURL < <(cd "$(ZKDIR)/maps" && (sed -n "s_^.*<a href='\(https://zero-k.info/content/maps/[^']\+.sd[7z]\)'.*\$$_\1_p" "$${BASE}/maps/$*.html" ; sed -n "$${mapmanualfallback}" "$${BASE}/maps/$*.html") | head -1); echo "Using scraped URL: $${MAPURL}"; DIR="$$(dirname "$${MAPURL}")" FILE="$$(basename "$${MAPURL}" | tr -d \\n | jq -sRr @uri)"; curl -LsS -o "$$(basename "$${MAPURL}")" -R "$${DIR}/$${FILE}"; fi || (echo "FAILED getting map ID $*" ; mv -f "$${BASE}/maps/$*.html" "$${BASE}/maps/FAILED.$*.html" ; false)
	sleep 0.2

# Finally, link replays to the Zero-K version, engine version, and map that it depends on.
-include $(EVENTDEPS)

demos/%/detail.html:
	mkdir -p "$(dir $@)" && cd "$(dir $@)" && curl -LsS "https://zero-k.info/Battles/Detail/$*" > detail.html
	sleep 0.2

# replay.sdfz is a symlink to the full replay with a more accessible name
# This recipe downloads the replay file as part of the process
demos/%/replay.sdfz: | demos/%/detail.html
	# Scrape the battle detail page for the "Manual download" replay link, extract it, urlencode the filename, reconstruct the full URL, download it, then symlink replay.sdfz to the result
	mkdir -p "$(dir $@)" && cd "$(dir $@)" && test -s "detail.html" && read -r u < <(cat "detail.html" | sed -n "s_^.*<a href='/replays/\(.*\.sdfz\)'>Manual download</a>.*\$$_\1_p" | tr -d \\n | jq -sRr @uri); if [ "x$$u" != x ]; then echo "$$u" | sed 's_^.*$$_https://zero-k.info/replays/&_' | xargs -n1 -d \\n curl -LsS -O -R && ls -1t *.sdfz | grep -vx replay.sdfz | head -1 | xargs -n1 -d \\n -I{} ln -sf {} replay.sdfz; else echo 'Could not find demofile link in demos/$*/detail.html, assuming no link. Skipping!'; printf '%d (Automatic) Could not find demofile link, replay skipped. Added %s\n' "$*" "$$(date --iso-8601)" >> ../exclude.txt; fi
	sleep 0.2



# Process the replay
stats/%/spring.log stats/%/events.log: demos/%/replay.sdfz
	mkdir -p "$(dir $@)"
	mkdir -p "$(ZKDIR)/LuaUI/Logs/replay_stats/$*/"
	set -o pipefail && WORK=$$(mktemp -d) && trap 'rm -rf "$${WORK}"' EXIT && SPRINGVERSION=$$(sed -n "$${getspringversion}" demos/$*/detail.html) && cat "$(ZKDIR)/springsettings.cfg" <(echo ZKHeadlessReplay=$*) > "$${WORK}/springsettings.$*.cfg" && /usr/bin/timeout -k 30s "$(MAXSIMTIME)" /usr/bin/time -v "$(ZKDIR)/engine/linux64/$${SPRINGVERSION}/spring-headless" -write-dir "$(ZKDIR)" -config "$${WORK}/springsettings.$*.cfg" $< 2>&1 > stats/$*/spring.log; CODE=$$? && if [ "$$CODE" -eq 127 -o "$$CODE" -eq 137 ]; then printf "%d (Automatic) Timeout reached, replay skipped. Added %s\n" "$*" "$$(date --iso-8601)" >> demos/exclude.txt; fi; exit "$$CODE"
	test -e "$(ZKDIR)/LuaUI/Logs/replay_stats/$*/events.log" && mv -f "$(ZKDIR)/LuaUI/Logs/replay_stats/$*/events.log" "stats/$*/events.log"

# Postprocess the events from the replay
summaries/%/summary.json: stats/%/events.log postprocess.py
	mkdir -p "$(dir $@)"
	python3 postprocess.py "$<" "$*" > "$@".tmp
	mv -f "$@".tmp "$@"

summaries/all.json: $(SUMMARIES)
	test -f archive.json.frags || touch archive.json.frags
	( echo -n [ && cat archive.json.frags summaries/*/summary.json | paste -s -d, - && echo -n ] ) > "$@.tmp"
	mv -f "$@.tmp" "$@"
