#!/usr/bin/env python3

import json
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
winner = re.compile(r'\[(?P<frame>[0-9]+)\] Received game_message: (?P<name>.*) wins!')
statsheader = re.compile(r'\[(?P<frame>[0-9]+)\] Game End Stats Header: ')

win = None
duration = None
battlemap = None
started = None
sp = None
zk = None

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
            p['facplop'] = None
            teamid_to_player[p['teamid']] = p
            name_to_player[p['name']] = p
            continue
        m = facplop.match(line)
        if m:
            d('Found facplop', repr(m.groupdict()))
            p = teamid_to_player[m.group('teamid')]
            if not p['facplop']:
                p['facplop'] = m.group('fac')
            continue
        m = winner.match(line)
        if m:
            duration = m.group('frame')
            win = m.group('name')
            continue
        if win is None:
            continue
        m = statsheader.match(line)
        if m:
            break
        d('Uh oh, something\'s gone wrong - winner not followed by stats header!')

winning_player = name_to_player[win]
losing_player = [p for p in name_to_player.values() if p['name'] != win][0]

d('teamid', winning_player['teamid'], 'wins')

summary = {}
summary['winner_elo_lead'] = int(winning_player['elo']) - int(losing_player['elo'])
summary['winner_elo'] = int(winning_player['elo'])
summary['loser_elo'] = int(losing_player['elo'])
summary['winner_fac'] = winning_player['facplop'] or 'Never'
summary['loser_fac'] = losing_player['facplop'] or 'Never'
summary['duration'] = int(duration)
summary['gameid'] = id
summary['started'] = started
summary['map'] = battlemap or 'Unknown'
summary['zk_version'] = zk
summary['spring_version'] = sp

d(repr(summary))

print(json.dumps(summary))
