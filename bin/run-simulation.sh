#!/bin/bash

set -euo pipefail

early_exit_watcher() {
    local id="$1"
    local sim_pgid="$2"

    local seen_replay_stats_lua=""
    # Watch for conditions which the replay analysis widget cannot
    while read -r line; do
        # Have we reached the end of the replay, without reaching a normal exit?
        if [[ "$line" =~ End\ of\ demo\ reached$ ]]; then
            echo "Watchdog: Replay EOF detected."
            sleep 15
            echo "Watchdog: 15 seconds past end of replay without normal exit. Killing simulation." >&2
            printf "%d (Automatic) Non-terminating replay detected. Added %s\n" "$id" "$(date --iso-8601)" >> ../../demos/exclude.txt
            kill -- -"$sim_pgid" 2>/dev/null ||:
            break
        fi
        # Has the simulation started without the replay analysis widget?
        # Watch for the line that indicates the widget has been loaded.
        # Example line:
        # [t=00:00:16.943076][f=-000001] Loaded widget:  SpringRTS Replay Stats  <replay_stats.lua>
        if [[ "$line" =~ ^\[t=[0-9:\.]+\]\[f=-000001]\ Loaded\ widget:\ +SpringRTS\ Replay\ Stats\ +\<replay_stats.lua\>$ ]]; then
            seen_replay_stats_lua=1
        fi
        # Watch for any line with a non-negative frame number, indicating the simulation has started.
        # Example line:
        # [t=00:00:37.065796][f=0000000] Playback continued
        if [[ -z "$seen_replay_stats_lua" ]] && [[ "$line" =~ ^\[t=[0-9:\.]+\]\[f=[^-] ]]; then
            echo "Watchdog: Replay simulation started without loading replay_stats.lua. Killing simulation." >&2
            printf "%d (Automatic) Could not load replay_stats.lua. Added %s\n" "$id" "$(date --iso-8601)" >> ../../demos/exclude.txt
            kill -- -"$sim_pgid" 2>/dev/null ||:
            break
        fi
    done < <(tail -F "stats/$id/spring.log")
}

run_spring() {
    local id="$1"
    local replay="$2"
    local zkdir="$3"
    local timeout="$4"
    local work_dir="$5"

    local spring_version=$(sed -nf ../../bin/get-spring-version.sed demos/$id/detail.html)
    local spring_bin="$zkdir/engine/linux64/${spring_version}/spring-headless"

    exec setsid /usr/bin/timeout --foreground -k 30s "$timeout" /usr/bin/time -v \
        "$spring_bin" -write-dir "$zkdir" -config "${work_dir}/springsettings.$id.cfg" "$replay" 2> >(
            # Filter out some spammy errors from stderr
            grep -avF 'lups/ParticleClasses/nanolasersnoshader.lua' >&2
        ) > "stats/$id/spring.log"
}

main() {
    local id="$1"
    local replay="$2"
    local zkdir="$3"
    local timeout="$4"

    mkdir -p "../../stats/$((id / 10000))/$id/"
    mkdir -p "$zkdir/LuaUI/Logs/replay_stats/$id/"
    local work_dir="$(mktemp -d)"
    trap "rm -rf '${work_dir}'" EXIT

    cat "$zkdir/springsettings.cfg" <(echo ZKHeadlessReplay=$id) > "${work_dir}/springsettings.$id.cfg"

    # Clear any previous output, so the early exit watcher doesn't trigger a false positive
    rm -f "stats/$id/spring.log"
    # Start the simulation
    run_spring "$id" "$replay" "$zkdir" "$timeout" "$work_dir" &
    sim_pgid=$!
    # Watch for abnormal conditions which require the simulation to be externally killed
    early_exit_watcher "$id" "$sim_pgid" &
    watcher_pid=$!

    trap "set +e; rm -rf '${work_dir}'; kill -- -'"$sim_pgid"' 2>/dev/null; kill '"$watcher_pid"' 2>/dev/null" EXIT

    # Wait for the simulation to finish
    set +e
    wait "$sim_pgid"; local sim_retcode=$?
    set -e

    # If the replay timed out, skip it
    if [[ "$sim_retcode" -eq 124 ]]; then
        printf "%d (Automatic) Timeout reached, replay skipped. Added %s\n" "$id" "$(date --iso-8601)" >> ../../demos/exclude.txt
    fi

    kill "$watcher_pid" 2>/dev/null ||:
    wait "$watcher_pid" 2>/dev/null ||:

    # Forward exit code failures
    if [ "$sim_retcode" -ne 0 ]; then
        exit "$sim_retcode"
    fi

    # Check we actually produced necessary output, then move it
    test -e "$zkdir/LuaUI/Logs/replay_stats/$id/events.log" && mv -f "$zkdir/LuaUI/Logs/replay_stats/$id/events.log" "stats/$id/events.log"
}

main "$@"
