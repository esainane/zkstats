#!/usr/bin/env python3

import json
import math
import re
from sys import argv, stderr, exit

filename = argv[1]
id = int(argv[2])

# Scrape detail.html
premap = re.compile(r'a href="/Maps/Detail/')
mapname = re.compile(r'Map: (?P<name>[^<]+)')
# From 105.1.1-2314-g9e0bf7d, a new way of recording the timestamp in the replay filename was used.
# Before: YYYYMMDD_HHMMSS_
# After: YYYY-mm-dd_HH-MM-SS-mmm_
timestamp = re.compile(r"a href='/replays/(?P<year>[0-9]{4})-(?P<month>[0-9]{2})-(?P<day>[0-9]{2})_(?P<hours>[0-9]{2})-(?P<minutes>[0-9]{2})-(?P<seconds>[0-9]{2})-[0-9]{3}_")
timestamp_pre_2314 = re.compile(r"a href='/replays/(?P<year>[0-9]{4})(?P<month>[0-9]{2})(?P<day>[0-9]{2})_(?P<hours>[0-9]{2})(?P<minutes>[0-9]{2})(?P<seconds>[0-9]{2})_")
userid = re.compile(r"href='/Users/Detail/(?P<userid>[0-9]+)'[^>]+>(?P<username>[^<]+)</a>")

name_to_userid = {}
teamid_to_player = {}
name_to_player = {}

# Scrape events.log
playerinfo = re.compile(r'\[(?:0|1)\] (?P<name>.*), team: (?P<teamid>[0-9]+), elo:(?P<elo>[0-9]+)(?:, userid: (?P<userid>[0-9]+))?(?:, ai: (?P<ai>.*))?')
facplop = re.compile(r'\[(?P<frame>[0-9]+)\] Event \[(?P<location>[^\]]+)\]: (?P<teamid>[0-9]+) finished unit (?P<fac>Cloakbot Factory|Shieldbot Factory|Rover Assembly|Hovercraft Platform|Gunship Plant|Airplane Plant|Spider Factory|Jumpbot Factory|Tank Foundry|Amphbot Factory|Shipyard|Strider Hub)')

class SkipCondition(object):
    def __init__(self, why, expr, extra=lambda: True):
        self.why = why
        self.expr = re.compile(expr)
        self.extra = extra

    def satisfied(self, line):
        return self.expr.match(line) and self.extra()


winner = re.compile(r'\[(?P<frame>[0-9]+)\] Received game_message: (?P<name>.*) wins!')
statsheader = re.compile(r'\[(?P<frame>[0-9]+)\] Game End Stats Header: ')

win = None
duration = None
battlemap = None
started = None
sp = None
zk = None
skip = False

draw = SkipCondition('Game Draw', r'\[(?P<frame>[0-9]+)\] Received game_message: The game ended in a draw!')
autohostexit = SkipCondition('Autohost exit', r'\[(?P<frame>[0-9]+)\] autohost exit')
nostartpos = SkipCondition('No start placement', r'\[(?P<frame>[0-9]+)\] player nonplacement')
all_players_exit = SkipCondition('All players disconnected', r'\[(?P<frame>[0-9]+)\] all players disconnected', lambda: win == None)

skip_conditions = [draw, autohostexit, nostartpos, all_players_exit]

def d(*args, **kwargs):
    print(file=stderr, *args, **kwargs)

# Scan through detail detail.html
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
        if not m:
            m = timestamp_pre_2314.search(line)
        if m:
            started = '%s-%s-%s %s:%s:%s' % (m.group('year'), m.group('month'), m.group('day'), m.group('hours'), m.group('minutes'), m.group('seconds'))
        m = userid.search(line)
        if m:
            name_to_userid[m.group('username')] = m.group('userid')

mapdef = re.compile(r'\| maps/(?P<map>.*)\.html$')
spver = re.compile(r'engine/linux64/(?P<spver>[^/]*)/')
zkver = re.compile(r'\| games/(?P<zkver>Zero-K\\ [v0-9.]+)$')

# Scan through the dependency information. This is derived from detail.html, but faster to read through here.
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

# Scan through the event log.
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
        for sc in skip_conditions:
            if sc.satisfied(line):
                d("Skip condition met: " + sc.why + ": " + line)
                skip = True
                break
        if skip:
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

if win is None:
    d('WARNING: Could not find winner after reading file! What follows is probably garbage!')

def ensure_supplementary(player_data):
    if 'userid' in player_data and player_data['userid'] is not None:
        return
    player_data['userid'] = name_to_userid[player_data['name']]


def player_data_by_winning(name_to_player, win):
    winning_player = name_to_player[win]
    losing_player = [p for p in name_to_player.values() if p['name'] != win][0]
    ensure_supplementary(winning_player)
    ensure_supplementary(losing_player)
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
summary['winner_userid'] = winning_player['userid']
summary['loser_userid'] = losing_player['userid']
summary['duration'] = int(duration)
summary['gameid'] = id
summary['started'] = started
summary['map'] = battlemap or 'Unknown'
summary['zk_version'] = zk
summary['spring_version'] = sp

d(repr(summary))

print(json.dumps(summary))
