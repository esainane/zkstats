function widget:GetInfo() return {
	name    = "SpringRTS Replay Stats",
	desc    = "[v0.0.1] Tracks stats from a replay and saves them to a file. Makes use of the state graph data.",
	author  = "esainane",
	date    = "2019-07-07",
	license = "GNU GPL v2 or later",
	layer   = -1,
	enabled = true,
} end

--
-- Widget state
--
local logfile
local gameOver = false

--
-- Constants
--
local STATS_FOLDER = LUAUI_DIRNAME .. "Logs/replay_stats/"

local directStats = {
	metalProduced = true,
	metalUsed = true
}
local rulesParamStats = {
	metal_excess = true,
	metal_overdrive = true,
	metal_reclaim = true,
	unit_value = true,
	unit_value_army = true,
	unit_value_def = true,
	unit_value_econ = true,
	unit_value_other = true,
	unit_value_killed = true,
	unit_value_lost = true,
	metal_income = true,
	energy_income = true,
	damage_dealt = true,
	damage_received = true,
}
local hiddenStats = {
	damage_dealt = true,
	unit_value_killed = true,
}

--
-- Constant function cache
--
local spGetTeam			          = Spring.GetUnitTeam
local spGetLastAttacker		    = Spring.GetUnitLastAttacker
local GetHiddenTeamRulesParam = Spring.Utilities.GetHiddenTeamRulesParam


--
-- Utility functions
--

local function starts_with(str, start)
	if not str then
		log("--- WARNING --- starts_with on null string")
	end
	if (not str.sub) then
		log("--- WARNING --- starts_with where sub is nil")
		for k,v in pairs(str) do
			log("sub[" .. k .. "] = " .. v)
		end
	end
	return str:sub(1, #start) == start
end

local function printArray(arr)
	local res
	for k,v in pairs(arr) do
		res = (res and (res .. ',') or '') .. v
	end
	return res
end

local function log(msg)
	line = "[" .. Spring.GetGameFrame() .. "] " .. msg
	Spring.Echo("<Replay Stats> " .. line)
	logfile:write(line .. '\n')
end

local function AddEvent(str, unitDefId, _, _, pos)
	log('Event [' .. (pos and (printArray(pos)) or 'undefined') .. ']: ' .. str)
end

local function IsSpectator()
	local playerID = Spring.GetMyPlayerID()
	local _, _, spec = Spring.GetPlayerInfo(playerID, false)

	if spec then
		return true
	end

	return false
end


--
-- Print player information at startup. Simplified from start_boxes.lua gadget
--

local PLAYERINFO_CUSTOMKEYS = Spring.GetGameRulesParam("GetPlayerInfoCustomKeysIndex") or 10

-- name, elo, clanShort, clanLong, isAI
local function GetPlayerInfo (teamID)
	local _,playerID,_,isAI = Spring.GetTeamInfo(teamID, false)

	if isAI then
		return select(2, Spring.GetAIInfo(teamID)), -1000, "", "", true
	end

	local name = Spring.GetPlayerInfo(playerID, false) or "?"
	local customKeys = select(PLAYERINFO_CUSTOMKEYS, Spring.GetPlayerInfo(playerID)) or {}
	local clanShort = customKeys.clan     or ""
	local clanLong  = customKeys.clanfull or ""
	local elo       = customKeys.elo      or "0"
	log(name .. ", team: " .. teamID .. ", elo:" .. elo)
	return name, tonumber(elo), clanShort, clanLong, false
end

local function GetTeamInfo(allyTeamID)
	local teamList = Spring.GetTeamList(allyTeamID) or {}
	if #teamList == 0 then
		return "Empty", "Empty"
	end

	for i = 1, #teamList do
		local name, elo, clanShort, clanLong, isAI = GetPlayerInfo(teamList[i])
	end
end


--
-- Print a graph summary at the end. Simplified from gui_chili_endgraph.lua
-- Note that as we're just creating a log, we don't care about saving or mapping player names as we go
--

function widget:GameOver()
	gameOver = true
end

local function addTeamScores(dest, stats, graphLength, statistic)
	for b = 1, graphLength do
		dest[b] = (dest[b] or {})
		dest[b][statistic] = (dest[b][statistic] or 0) + (stats[b][statistic] or 0)
	end
end

local function getGameEndStats()
	local teams = Spring.GetTeamList()
	local graphLength = Spring.GetGameRulesParam("gameover_historyframe")

  -- teamID/allyTeamID => time => statisticName => value
	local teamScores = {}
	local allyTeamScores = {}

	local gaiaID = Spring.GetGaiaTeamID()
	local gaiaAllyTeamID = select(6, Spring.GetTeamInfo(gaiaID, false))

	for i = 1, #teams do
		local teamID = teams[i]
		local stats = Spring.GetTeamStatsHistory(teamID, 0, graphLength)
		if gaiaID ~= teamID and stats then
		  local allyTeamID = select(6, Spring.GetTeamInfo(teamID, false))
			teamScores[teamID] = teamScores[teamID] or {}
			allyTeamScores[allyTeamID] = allyTeamScores[allyTeamID] or {}

			for statistic,_ in pairs(rulesParamStats) do
				stats = {}
				for i = 0, graphLength do
					stats[i] = stats[i] or {}
					if hiddenStats[statistic] and gameOver then
						stats[i][statistic] = GetHiddenTeamRulesParam(teamID, "stats_history_" .. statistic .. "_" .. i) or 0
					else
						if not stats or stats == '?' then
							log('stats is ?')
						end
						if i == nil or i == '?' then
							log('i is ?')
						end
						if not statistic or statistic == '?' then
							log('statistic is ?')
						end
						local res = Spring.GetTeamRulesParam(teamID, "stats_history_" .. statistic .. "_" .. i) or 0
						stats[i][statistic] = res
					end
				end
				addTeamScores(teamScores[teamID], stats, graphLength, statistic)
				addTeamScores(allyTeamScores[allyTeamID], stats, graphLength, statistic)
			end
			for statistic,_ in pairs(directStats) do
				addTeamScores(teamScores[teamID], stats, graphLength, statistic)
				addTeamScores(allyTeamScores[allyTeamID], stats, graphLength, statistic)
			end
		end
	end
	return teamScores, allyTeamScores, graphLength
end

local function allStatNames()
	local ret = {}
	for statistic,_ in pairs(rulesParamStats) do
		ret[statistic] = true
	end
	for statistic,_ in pairs(directStats) do
		ret[statistic] = true
	end
	return ret
end

local function printGameEndStats(teamScores, allyTeamScores, graphLength)
	local s = ''
	statNames = allStatNames()
	for statName in pairs(statNames) do
		for allyTeamID,_ in pairs(allyTeamScores) do
			s = s .. ',allyTeam' .. allyTeamID .. '_' .. statName
		end
		for teamID,_ in pairs(teamScores) do
			s = s .. ',team' .. teamID .. '_' .. statName
		end
	end
	log('Game End Stats Header: time' .. s)
	for i = 0, graphLength do
		s = i
		for statName in pairs(statNames) do
			for _,allyTeamStats in pairs(allyTeamScores) do
				s = s .. ',' .. (allyTeamStats[i] and allyTeamStats[i][statName] or '"-"')
			end
			for _,teamStats in pairs(teamScores) do
				s = s .. ',' .. (teamStats[i] and teamStats[i][statName] or '"-"')
			end
		end
		log('Game End Stats Values: ' .. s)
	end
end

-- Dump a copy of the game's graph to the log. This is going to be heavy.
local function printStats()
	local teamScores, allyTeamScores, graphLength = getGameEndStats()
	printGameEndStats(teamScores, allyTeamScores, graphLength)
end

--
-- Simple spam to make sure that the widget is working.
--

local function startup()
	local allyTeamList = Spring.GetAllyTeamList()

	for i = 1, #allyTeamList do
		local allyTeamID = allyTeamList[i]
		local longName, shortName, clanLong, clanShort = GetTeamInfo(allyTeamID)
	end
end

local done_startup = false

function widget:GameFrame(f)
	-- spring v104.0.1-1239/Zero-K v1.7.5.1 doesn't call widget:GameFrame on frame 0
	if (not done_startup and f >= 0) then
		startup()
		done_startup = true
	end
	if gameOver then
		printStats()
		widgetHandler:RemoveCallIn("GameFrame")
	end
end

function widget:Initialize()
	if (not IsSpectator()) then
		Spring.Echo("<Replay Stats> Not spectating. Widget removed.")
		widgetHandler:RemoveWidget()
		return
	end
	if (not Spring.IsReplay()) then
		Spring.Echo("<Replay Stats> Not a replay. Widget removed.")
		widgetHandler:RemoveWidget()
		return
	end
	Spring.Echo("<Replay Stats> We appear to be in a replay/spectator. Writing stats to file.")
	local num = Spring.GetConfigInt("ZKHeadlessReplay") or 'unknown'
	local filename = STATS_FOLDER ..  num .. '/events.log'
	Spring.Echo("<Replay Stats> Attempting to open " .. filename)
	local err
	logfile, err = io.open(filename, 'w+')
	if not logfile then
		Spring.Echo('<Replay Stats> Something went wrong opening the output file! Was the parent directory created before spring was run?')
		Spring.Echo('<Replay Stats> Error: ' .. err)
	end
end

function widget:Shutdown()
	if logfile then
		io.close(logfile)
	end
end

function widget:AddConsoleMessage(msg)
	if not msg then
		log("--- WARNING --- Received null console message")
		return
	end
	-- Listen for 'game_message:' messages
	if msg.msgtype ~= "game_message" then return end
	log("Received game_message: " .. msg.text)
end


--
-- Log unit creation/destruction messages as we encounter the events. Simplified from gui_news_ticker
--

function widget:UnitDestroyed(unitID, unitDefID, unitTeam)
	--don't report cancelled constructions etc.
	local killer = spGetLastAttacker(unitID)
	if killer == nil or killer == -1 then return end
	local ud = UnitDefs[unitDefID]

	local pos = {Spring.GetUnitPosition(unitID)}

	local humanName = Spring.Utilities.GetHumanName(ud)
	AddEvent(unitTeam .. ' lost unit ' .. humanName, unitDefID, nil, "unitLost", pos)
end

function widget:UnitFinished(unitID, unitDefID, unitTeam)
	local ud = UnitDefs[unitDefID]
	local pos = {Spring.GetUnitPosition(unitID)}

	local humanName = Spring.Utilities.GetHumanName(ud)
	AddEvent(unitTeam .. ' finished unit ' .. humanName, unitDefID, nil, "structureComplete", pos)
end

function widget:UnitIdle(unitID, unitDefID, unitTeam)
	local ud = UnitDefs[unitDefID]
	if ud.isFactory and (spGetTeam(unitID) == myTeam) then
		local pos = {Spring.GetUnitPosition(unitID)}
		AddEvent(Spring.Utilities.GetHumanName(ud) .. ": factory idle", unitDefID, nil, "factoryIdle", pos)
	end
end

function widget:TeamDied(teamID)
	local player = Spring.GetPlayerList(teamID)[1]
	-- chicken team has no players (normally)
	if player then
		local playerName = Spring.GetPlayerInfo(player, false)
		AddEvent(playerName .. ' died', nil, colorOrange)
	end
end

--[[
function widget:TeamChanged(teamID)
	--// ally changed
	local playerName = Spring.GetPlayerInfo(Spring.GetPlayerList(teamID)[1], false)
	widget:AddWarning(playerName .. ' allied')
end
--]]

function widget:PlayerChanged(playerID)
	local playerName,active,isSpec,teamID = Spring.GetPlayerInfo(playerID, false)
  local _,_,isDead = Spring.GetTeamInfo(teamID, false)
	if (isSpec) then
		if not isDead then
			AddEvent(playerName .. ' resigned')
		end
	elseif (Spring.GetDrawFrame()>120) then --// skip `changed status` message flood when entering the game
		AddEvent(playerName .. ' changed status')
	end
end

function widget:PlayerRemoved(playerID, reason)
	local playerName,active,isSpec = Spring.GetPlayerInfo(playerID, false)
	if spec then return end
	if reason == 0 then
		AddEvent(playerName .. ' timed out')
	elseif reason == 1 then
		AddEvent(playerName .. ' quit')
	elseif reason == 2 then
		AddEvent(playerName .. ' got kicked')
	else
		AddEvent(playerName .. ' left (unknown reason)')
	end
end
