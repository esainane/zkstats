function widget:GetInfo() return {
	name    = "SpringRTS Replay Speed",
	desc    = "[v0.0.1] Sets the replay speed to an extremely high value during demo mode replays.",
	author  = "esainane",
	date    = "2019-07-07",
	license = "GNU GPL v2 or later",
	layer   = -1,
	enabled = true,
} end


local function IsSpectator()
	local playerID = Spring.GetMyPlayerID()
	local _, _, spec = Spring.GetPlayerInfo(playerID, false)

	if spec then
		return true
	end

	return false
end

local function setReplaySpeed (speed, i)
	local s = Spring.GetGameSpeed()
	if (speed > s) then	--speedup
		Spring.SendCommands ("setminspeed " .. speed)
		Spring.SendCommands ("setminspeed " ..0.1)
	else	--slowdown
		Spring.SendCommands ("setmaxspeed " .. speed)
		Spring.SendCommands ("setmaxspeed " .. 3000.0)
	end
end

function widget:Initialize()
	if (not IsSpectator()) then
		Spring.Echo("<Replay Speed> Not spectating. Widget removed.")
		widgetHandler:RemoveWidget()
		return
	end
	if (not Spring.IsReplay()) then
		Spring.Echo("<Replay Speed> Not a replay. Widget removed.")
		widgetHandler:RemoveWidget()
		return
	end
	Spring.Echo("<Replay Speed> We appear to be in a replay/spectator, maxing out game speed.")
	setReplaySpeed(3000.0)
	widgetHandler:RemoveWidget()
end
