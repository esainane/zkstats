# ZK Stats

Proof of concept processing of Zero-K replays, and visualisation of Zero-K matchup data.

## Design notes

Scrape `http://zero-k.info/Battles?Title=MM&Map=&PlayersFrom=2&PlayersTo=2&Age=0&Mission=2&Bots=2&Rank=8&Victory=0&` - look for for IDs of the form `745990` in `http://zero-k.info/Battles/Detail/745990`

Download the replay to `/var/lib/zkreplay/demos/ID/date_map_springversion.sdfz` and symlink `/var/lib/zkreplay/demos/<ID>/replay.sdfz` to it

Run a sandboxed instance of ZK, extracting the spring log to `/var/lib/zkreplay/stats/<ID>/spring.log`, and timestamped actions of potential importance to `/var/lib/zkreplay/stats/<ID>/events.log`

Postprocess events into visualisable json at `/var/lib/zkreplay/summaries/<ID>/summary.json`

Concatenate all the json together into one omnibus file at `/var/lib/zkreplay/summaries/all.json`

## Installation

Initial setup as the superuser:

```bash
apt install jq
adduser --system --home /var/lib/zkreplay --no-create-home --group zkreplay
adduser --system --home /var/lib/zkreplay/demos --no-create-home --ingroup zkreplay zkreplayfetch
mkdir /var/lib/zkreplay
cd /var/lib/zkreplay
chown -R zkreplay:zkreplay .
apt install unzip jq
mkdir demos
chown -R zkreplayfetch:zkreplay demos
```

Next, use your new service user to set up the Zero-K installation that will be used. Make its maps and linux64 engines folders writable to the group so that zkreplayfetch can fetch maps and engines for it. Finally, fix some of the more horrifying (world writable!) permissions that came with the portable archive.

```bash
su - zkreplay -s /bin/bash
mkdir Zero-K
cd Zero-K
unzip ../zero-k-portable.zip
cd ..
chmod g+w Zero-K Zero-K/maps/ Zero-K/rapid/ Zero-K/rapid/repos.springrts.com/ Zero-K/engine Zero-K/packages/ Zero-K/engine/ Zero-K/engine/linux64/
chmod g+w -R Zero-K/pool/
find . -perm /o=w | xargs -d \\n chmod o-w
exit
mkdir games
chown zkreplayfetch games
```

Permit zkreplayfetch through firewall on HTTPS outbound. When done, get it to fetch an example replay.

```bash
su - zkreplayfetch -s /bin/bash
make demos/745998/replay.sdfz
exit
```

Return to the spring user. Set up the local widgets necessary to extract data, and to uninteractively set the replay speed to something sensible.

```bash
su - zkreplay -s /bin/bash
cd Zero-K
mkdir -p LuaUI/Widgets/
cd $_
ln -s ../../../Widgets/replay_speed.lua .
ln -s ../../../Widgets/replay_stats.lua .
```

We will need to alter the LuaUI config directly, once, to enable local widgets. From there, our local replay widgets will handle configuration.

**Zero-K/LuaUI/ZK_config.lua**
```
        ["Local Widgets Config"] = {
                localWidgets = true,
                localWidgetsFirst = false,
        },
```

Note that while our widgets will try to set the speed to 100x, we're constrained by the mod's maximum game speed setting of 20 - or rather, spring's default for an unset maximum speed.

Now, return to the home directory and run spring.

```bash
cd
/usr/bin/time -v ./Zero-K/engine/linux64/104.0.1-1289-gfd5619c/spring-headless -write-dir /var/lib/zkreplay/Zero-K/ demos/745998/replay.sdfz
```

Process automated in the Makefile.

## Visualisation

This repository contains example data at `public/data/all7.json`, and is configured to find data at `public/data/live.json`. A symbolic link, `public/data/live.example.json` points to this example data. 

To copy this link into the live location, to use the example data:

```bash
cp -a public/data/live{.example,}.json
```

To point to the latest generated file:

```bash
ln -s ../../summaries/all.json public/data/live.json
```

Point your webserver at the `public/` directory to begin serving.
