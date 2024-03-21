#!/usr/bin/env make -rR
# Expects to be in /var/lib/zkreplay

default:
	echo "Please specify one of fetch, process, or a more specific target."
	false

# Find all immediate children of the shards directory.
# Strip all but the last component of the path to obtain a list of live shards.
# The end result is a list of numbers. For example: "115 116 82 85 125 141 77 ..."
SHARDS:=$(shell find shards -mindepth 1 -maxdepth 1 -type d | sed 's_^.*/\([^\/*]\)_\1_')
# For the actual shard directories, use SHARDDIRS.
SHARDDIRS:=$(addprefix shards/,$(SHARDS))

# There are four files in each shard we examine from the top level.
# SHARDDIR/demos/index.mk is updated by the scraping process, and means there
#   are new battle IDs allocated to this shard. If this is the case, we need
#   to download the associated replay and dependencies (engine, map, game),
#   and update the fetch timestamp.
# SHARDDIR/fetch-complete-stamp is updated by the shard makefile as part of
#   the fetch target, indicating that the fetch target completed fully and
#   successfully, and does not need to be examined again until and unless the
#   list of battles to fetch has changed.
# SHARDDIR/fetch-stamp is updated by the shard makefile as part of the fetch
#   target, indicating that new replays are available to be processed.
# SHARDDIR/summaries/shard.json.frags is created by the shard makefile as part
#   of the process target, and contains the results of all of its replays.
#
# No other files in a shard directory are examined by the top level Makefile.
# Care is taken to ensure that data will not be in an inconsistent state even
# if a fetch or process target is unexpectedly interrupted.
#
# This is done in order to cut down on very excessive I/O - which a single
# Makefile examining an appreciable fraction of a million folders otherwise
# does, taking several minutes before any command is executed.
#
# Horizontal partitioning should give zkstats a new lease on life, but this
# could still use a proper rewrite before the filesystem runs out of inodes.
# At the time of writing, we're 27% there.

# No use for all SHARDINDICES - pattern prereq in the below fetch-stamp rule
SHARDFETCHSTAMPS:=$(addsuffix /fetch-complete-stamp,$(SHARDDIRS))
SHARDRESULTS:=$(addsuffix /summaries/shard.json.frags,$(SHARDDIRS))

fetch: $(SHARDFETCHSTAMPS)
# all.json depends on SHARDRESULTS
process: summaries/all.json

demos: fetch
summaries: process
stats: process

.PHONY: default demos stats summaries fetch-replays process fetch

# index.mk should always be created by the scraper.
# See: bin/scrape.sh
# Recipe pattern: Shard ID, eg: $* := 160
shards/%/demos/index.mk:
	@echo "Error: inconsistent state (shard $* exists without index.mk)"
	false

# New battle IDs ready to be retrieved. Delegate fetching to the shard makefile.
# See: Makefile.shard
# See: bin/scrape.sh for the symlinking, setup, and layout of a shard
# Recipe pattern: Shard ID, eg: $* := 160
# FIXME: Sometimes fetching a new game fails the first time, so we run make
#   fetch twice if the first time fails
shards/%/fetch-complete-stamp: shards/%/demos/index.mk
	@echo "Fetching shard $*..."
	#$(MAKE) -Rrk -C "$(dir $@)" fetch || $(MAKE) -Rrk -C "$(dir $@)" fetch
	make -Rrk -C "$(dir $@)" fetch || make -Rrk -C "$(dir $@)" fetch
	test -f "$@"

# New battle data has been retrieved, but not yet processed.
# Delegate processing to the shard makefile.
# See: Makefile.shard
# Recipe pattern: Shard ID, eg: $* := 160
shards/%/summaries/shard.json.frags: shards/%/fetch-stamp postprocess.py
	@echo "Processing shard $*..."
	$(MAKE) -Rrk -C "shards/$*/" process
	test -f "$@"

# Combine the results from all shards
summaries/all.json: $(SHARDRESULTS)
	( echo -n [ && find -L shards -maxdepth 3 -name shard.json.frags -exec cat {} + | paste -s -d, - && echo -n ] ) > "$@.tmp"
	mv -f "$@.tmp" "$@"

