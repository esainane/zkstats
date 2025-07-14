#!/bin/bash

set -euo pipefail

run_timeout() {
    local timeout="$1"
    shift
    /usr/bin/timeout -k 30s "$timeout" /usr/bin/time -v "$@"
}

main() {
    local id="$1"
    local replay="$2"
    local dir="$3"
    local zkdir="$4"
    local timeout="$5"

    mkdir -p "../../stats/$((id / 10000))"
    mkdir -p "$dir"
    mkdir -p "$zkdir/LuaUI/Logs/replay_stats/$id/"
    local work_dir="$(mktemp -d)"
    trap 'rm -rf "${work_dir}"' EXIT

    local spring_version=$(sed -nf ../../bin/get-spring-version.sed demos/$id/detail.html)
    local spring_bin="$zkdir/engine/linux64/${spring_version}/spring-headless"

    cat "$zkdir/springsettings.cfg" <(echo ZKHeadlessReplay=$id) > "${work_dir}/springsettings.$id.cfg"

    if ! run_timeout "$timeout" "$spring_bin" -write-dir "$zkdir" -config "${work_dir}/springsettings.$id.cfg" "$replay" 2> >(
        grep -avF 'lups/ParticleClasses/nanolasersnoshader.lua' >&2
    ) > stats/$id/spring.log; then
        CODE=$?
        if [ "$CODE" -eq 127 -o "$CODE" -eq 137 ]; then
            printf "%d (Automatic) Timeout reached, replay skipped. Added %s\n" "$id" "$(date --iso-8601)" >> ../../demos/exclude.txt
        fi
        exit "$CODE"
    fi
    test -e "$zkdir/LuaUI/Logs/replay_stats/$id/events.log" && mv -f "$zkdir/LuaUI/Logs/replay_stats/$id/events.log" "stats/$id/events.log"
}

main "$@"
