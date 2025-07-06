#!/bin/bash

set -e

scrape_all_battles() {
    local offset="$1"
    shift
    curl -s "https://zero-k.info/Battles?Title=&Map=&PlayersFrom=2&PlayersTo=2&Age=0&MinLength=&MaxLength=&Mission=2&Bots=2&Rank=8&Victory=0&Matchmaker=0&Rating=3&Offset=$offset" | sed -n "s_^.*<a href='/Battles/Detail/\([0-9]\+\)'.*\$_\1_p"
    sleep 0.2
}

commit_shard() {
    # We have a newline separated list of battle IDs at demos/index.mk.in.
    # Transform this into a space separated list, then prepend BATTLEIDS:=
    # to make it a makefile importable file.
    local shard="$1"
    if [ "x$shard" == "x" ]; then
        return
    fi
    if [ ! -f demos/"${shard}"/index.mk ]; then
        # Perform "first time" setup, potentially resuming from a crash
        # Setup is only considered complete once an index.mk file has
        # been created
        # Note that stats/ and summaries/ are owned by the process side,
        # so must be created by them
        mkdir -p demos/"${shard}" # stats/"${shard}" summaries/"${shard}"
        mkdir -p shards/"${shard}"
        for i in demos stats summaries; do
            ln -sfT ../../"${i}"/"${shard}" shards/"${shard}"/"${i}"
        done
        for i in games maps; do
            ln -sfT ../../"${i}" shards/"${shard}"/"${i}"
        done
        ln -sfT ../../Makefile.shard shards/"${shard}"/Makefile
        ln -sfT ../../postprocess.py shards/"${shard}"/postprocess.py
    fi
    # Build the new index.mk file in a temporary file first
    paste -d\  -s - < demos/index.mk.in | sed 's/^/BATTLEIDS:=/' > demos/${shard}/index.mk.tmp
    rm -f demos/index.mk.in
    if diff -q demos/${shard}/index.mk.tmp demos/${shard}/index.mk; then
        # Do not update the timestamp if there is no difference in contents
        rm demos/${shard}/index.mk.tmp
    else
        # If there is a difference in contents, the temporary file becomes the new index
        mv -f demos/${shard}/index.mk.tmp demos/${shard}/index.mk
    fi
}

shardify() {
    # We are being piped a sorted list of battle IDs. Place them into new
    # index files for any relevant shards.
    local current_shard=""
    local last_shard=""
    while read id; do
        current_shard=$((id / 10000))
        if [ "$current_shard" -ne "${last_shard:--1}" ]; then
            commit_shard "$last_shard"
            mkdir -p demos/"${current_shard}/"
            last_shard="$current_shard"
        fi
        echo $id >> demos/index.mk.in
    done
    commit_shard "$last_shard"
}

main() {
    local start="$1"
    local end="$2"
    shift 2
    :> demos/index.mk.tmp
    while read offset; do
        scrape_all_battles "$offset" "$@"
    done < <(seq "$start" 40 "$end") | grep -vxFf demos/exclude.txt | sort -n | shardify
    echo "Delegating to makefile..."
    make -Rrk fetch
}

if [ $# -lt 2 ]; then
    echo "Usage: $0 REPLAYS-OFFSET REPLAYS-AMOUNT"
    echo "Updates the replay index, and fetches replays and all dependencies."
    echo
    echo "Will be rounded up to the nearest multiple of 40, as that is what the"
    echo "website paginates by."
    exit 1
fi

main "$1" "$2"
