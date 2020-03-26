#!/usr/bin/env python3

import json
import math
import re
from sys import argv, stderr, exit

filename = argv[1]
id = int(argv[2])

premap = re.compile(r'a href="/Maps/Detail/')
mapname = re.compile(r'Map: (?P<name>[^<]+)')
timestamp = re.compile(r"a href='/replays/(?P<year>[0-9]{4})(?P<month>[0-9]{2})(?P<day>[0-9]{2})_(?P<hours>[0-9]{2})(?P<minutes>[0-9]{2})(?P<seconds>[0-9]{2})_")

teamid_to_player = {}
name_to_player = {}

playerinfo = re.compile(r'\[(?:0|1)\] (?P<name>.*), team: (?P<teamid>[0-9]+), elo:(?P<elo>[0-9]+)')
facplop = re.compile(r'\[(?P<frame>[0-9]+)\] Event \[(?P<location>[^\]]+)\]: (?P<teamid>[0-9]+) finished unit (?P<fac>Cloakbot Factory|Shieldbot Factory|Rover Assembly|Hovercraft Platform|Gunship Plant|Airplane Plant|Spider Factory|Jumpbot Factory|Tank Foundry|Amphbot Factory|Shipyard|Strider Hub)')
draw = re.compile(r'\[(?P<frame>[0-9]+)\] Received game_message: The game ended in a draw!')
winner = re.compile(r'\[(?P<frame>[0-9]+)\] Received game_message: (?P<name>.*) wins!')
statsheader = re.compile(r'\[(?P<frame>[0-9]+)\] Game End Stats Header: ')

win = None
duration = None
battlemap = None
started = None
sp = None
zk = None
skip = False

def d(*args, **kwargs):
    print(file=stderr, *args, **kwargs)

with open('demos/%d/detail.html' % id, 'r') as f:
    mapflag = False
    for line in f.readlines():
        if mapflag:
            m = mapname.search(line)
            if m:
                battlemap = m.group('name')
                d('Found map:', battlemap)
            else:
                d('Whoops, something went wrong finding the map name!')
            mapflag = False
        if premap.search(line):
            mapflag = True
            continue
        m = timestamp.search(line)
        if m:
            started = '%s-%s-%s %s:%s:%s' % (m.group('year'), m.group('month'), m.group('day'), m.group('hours'), m.group('minutes'), m.group('seconds'))

mapdef = re.compile(r'\| maps/(?P<map>.*)\.html$')
spver = re.compile(r'engine/linux64/(?P<spver>[^/]*)/')
zkver = re.compile(r'\| games/(?P<zkver>Zero-K\\ [v0-9.]+)$')

with open('demos/%d/events.log.deps' % id, 'r') as f:
    for line in f.readlines():
        m = spver.search(line)
        if m:
            sp = m.group('spver')
            continue
        m = zkver.search(line)
        if m:
            zk = m.group('zkver').replace(r'\ ', ' ')
            continue

with open(filename, 'r') as f:
    for line in f.readlines():
        m = playerinfo.match(line)
        if m:
            p = m.groupdict()
            d('Found player', repr(p))
            if p['name'] == '?':
                d('Skipping spectator...')
                continue
            p['facplop'] = []
            teamid_to_player[p['teamid']] = p
            name_to_player[p['name']] = p
            continue
        m = facplop.match(line)
        if m:
            d('Found facplop', repr(m.groupdict()))
            p = teamid_to_player[m.group('teamid')]
            p['facplop'].append(m.group('fac'))
            continue
        m = winner.match(line)
        if m:
            duration = m.group('frame')
            win = m.group('name')
            continue
        m = draw.match(line)
        if m:
            skip = True
            break
        if win is None:
            continue
        m = statsheader.match(line)
        if m:
            break
        d('Uh oh, something\'s gone wrong - winner not followed by stats header!')

if skip:
    print(json.dumps({'skip': True}))
    exit(0)

def player_data_by_winning(name_to_player, win):
    winning_player = name_to_player[win]
    losing_player = [p for p in name_to_player.values() if p['name'] != win][0]
    return winning_player, losing_player

def truncate_if_numeric(v, truncate_to_bits=24):
    """
    Truncates a value as if coerced through a float.

    If v looks like a number, returns a string comprising that number
    truncated to truncate_to_bits of precision, as if stored lossily in a
    floating point with that many bits available.

    Only performs mantissa truncation - simulating running out of space for
    the exponent is not supported.
    """
    try:
        i = int(v)
    except ValueError:
        return v
    bitlen = math.ceil(math.log(i,2))
    shift = bitlen - truncate_to_bits
    return str(i + (1 << shift - 1) >> shift << shift)

def player_data_maps(name_to_player):
    """
    Yields candidate player data maps in order.

    This begins with the map straight, and tries workarounds in sequence if failing.
    """
    yield name_to_player
    # Try to work around Spring being eager to convert numeric-looking strings
    # to numbers in RuleParams, such as storage for player names, potentially
    # losing precision (yes, really - see Battle 855246 >_<;; )
    yield { truncate_if_numeric(k):v for k,v in name_to_player.items() }

winning_player, losing_player = None,None
err = None
for m in player_data_maps(name_to_player):
    try:
        d('Trying',repr(m))
        winning_player, losing_player = player_data_by_winning(m, win)
    except KeyError as e:
        err = e
        continue
    break
else:
    raise err

d('teamid', winning_player['teamid'], 'wins')

summary = {}
summary['winner_elo_lead'] = int(winning_player['elo']) - int(losing_player['elo'])
summary['winner_elo'] = int(winning_player['elo'])
summary['loser_elo'] = int(losing_player['elo'])
summary['winner_fac'] = winning_player['facplop'][0] if len(winning_player['facplop']) else 'Never'
summary['winner_fac_prog'] = winning_player['facplop']
summary['loser_fac'] = losing_player['facplop'][0] if len(losing_player['facplop']) else 'Never'
summary['loser_fac_prog'] = losing_player['facplop']
summary['duration'] = int(duration)
summary['gameid'] = id
summary['started'] = started
summary['map'] = battlemap or 'Unknown'
summary['zk_version'] = zk
summary['spring_version'] = sp

d(repr(summary))

print(json.dumps(summary))
