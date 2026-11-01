--!strict
-- Server bootstrap: wires remotes to the match service and runs the tick loop.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

-- This is a UI-only 2D game: don't spawn a 3D character. Otherwise the character
-- falls into the void with no baseplate and respawns every few seconds, which shows
-- Roblox's red "taking damage" vignette.
Players.CharacterAutoLoads = false

local IceKing = ReplicatedStorage:WaitForChild("IceKing")
local Remotes = require(IceKing.Remotes)
local MatchService = require(script.Parent.MatchService)

Remotes.event("StartMatch").OnServerEvent:Connect(function(player, mode)
	MatchService.start(player, if mode == "DEV_FAST" then "DEV_FAST" else "PROD")
end)

Remotes.event("FindMatch").OnServerEvent:Connect(function(player, mode)
	MatchService.findMatch(player, if mode == "DEV_FAST" then "DEV_FAST" else "PROD")
end)

Remotes.event("CancelFindMatch").OnServerEvent:Connect(function(player)
	MatchService.cancelFind(player)
end)

Remotes.event("SubmitAction").OnServerEvent:Connect(function(player, action)
	MatchService.handleAction(player, action)
end)

Remotes.event("DebugGiveIce").OnServerEvent:Connect(function(player)
	MatchService.debugGiveIce(player, 100)
end)

Players.PlayerRemoving:Connect(function(player)
	MatchService.remove(player)
end)

RunService.Heartbeat:Connect(function(dt)
	MatchService.step(dt)
end)
