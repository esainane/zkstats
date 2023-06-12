#!/bin/bash

set -e

commit_shard() {
    # We have a newline separated list of battle IDs at migrate.in.
    # Move any existing data under demos, stats, and summaries to a new shard.
    local shard="$1"
    if [ "x$shard" == "x" ]; then
        return
    fi
    echo "Committing shard ${shard}..."
    # Firstly, create the shard.
    if [ ! -f demos/"${shard}"/index.mk ]; then
        # Perform "first time" setup, potentially resuming from a crash
        # Setup is only considered complete once an index.mk file has
        # been created
        mkdir -p demos/"${shard}" stats/"${shard}" summaries/"${shard}"
        mkdir -p shards/"${shard}"
        for i in demos stats summaries; do
            ln -sfT ../../"${i}"/"${shard}" shards/"${shard}"/"${i}"
        done
        ln -sfT ../../Makefile.shard shards/"${shard}"/Makefile
	ln -sfT ../../postprocess.py shards/"${shard}"/postprocess.py
    fi
    # Then, migrate any existing data.
    while read battle_id; do
        for i in demos stats summaries; do
            mv "${i}".migrate/"${battle_id}" "${i}"/"${shard}"/"${battle_id}" || echo "Could not move ${i}.migrate/${battle_id}!"
        done
    done < migrate.in
    # All shards must have a valid index.mk, which can be an empty list.
    echo "BATTLEIDS:=" > demos/"${shard}"/index.mk.tmp
    rm migrate.in
    # The existence of an index.mk indicates that shard setup is complete, and
    # must be the last step.
    mv -f demos/"${shard}"/index.mk.tmp demos/"${shard}"/index.mk
}

shardify() {
    # We are being piped a sorted list of battle IDs.
    # Accumulate them, then move them all into sharded locations once we know
    # all battles for a shard.
    local last_shard=""
    local current_shard=""
    while read id; do
        current_shard=$((id / 10000))
	if [ "x$current_shard" = "x" ]; then
	    echo "Something went wrong, invalid current shard: $current_shard via: $id"
	    exit 1
	fi
        if [ "$current_shard" != "$last_shard" ]; then
            commit_shard "$last_shard"
            :> migrate.in
            last_shard="$current_shard"
        fi
        echo "$id" >> migrate.in
    done
    commit_shard "$last_shard"
    mv -f demos.migrate/exclude.txt demos/exclude.txt
}

main() {
    # Anti foot-shooting: Move old directories containing lots of numbered
    # directories into a different location, so as to not be confused with
    # what will be newly created directories containing lots of a different
    # kind of numbered directories
    for i in demos stats summaries; do
        if [ ! -d "${i}".migrate ]; then
            mv "${i}" "${i}".migrate
        fi
    done
    find demos.migrate stats.migrate summaries.migrate -mindepth 1 -maxdepth 1 -type d | sed 's_^.*/\([^\/]*\)$_\1_' | sort -n | uniq | shardify
}

if [ $# -lt 1 ] || [ "x$1" != "x--commit" ]; then
    echo "Usage: $0 --commit"
    echo "Updates all project structure to use the sharded layout. All replays, dependencies, and results will be moved."
    exit 1
fi

main
