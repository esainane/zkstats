#!/bin/bash

# This finds any demos older than two months, and archives them into a folder that does not need regular scanning.
# Summaries are compiled into an archive.json.frags file, to avoid needing to assemble a list of all old summaries.
# The archive/ folder maintains a similar folder structure to its live parent. This is so summaries can be more easily
# regenerated as a one-off if later need be, while speeding up routine data reconciliation.

mkdir -p archive/{demos,stats,summaries}

while read id; do
	for d in demos stats summaries; do
		mv ${d}/${id} archive/${d}/${id}
	done
	if ! grep -q "^${id} " demos/exclude.txt then
		cat archive/${d}/${id} >> archive.json.frags
	fi
done < <(find demos -mindepth 1 -type d -newermt '2 months ago' | sed 's_^.*/\([^\/*]\)_\1_' | grep -vFf <(sed 's/^BATTLEIDS:=//' < demos/index.mk | tr \  \\n))

