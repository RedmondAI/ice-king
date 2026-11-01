--!strict
-- Shared remote-event registry. Required on the server (creates the events) and
-- on the client (waits for them).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Remotes = {}

local FOLDER_NAME = "IceKingRemotes"
local REMOTE_NAMES = {
	"StartMatch", -- client -> server: request a new solo match (payload: "PROD" | "DEV_FAST")
	"FindMatch", -- client -> server: join the two-player queue (payload: "PROD" | "DEV_FAST")
	"CancelFindMatch", -- client -> server: leave the two-player queue
	"MatchmakingStatus", -- server -> client: { status = "SEARCHING" | "IDLE", mode }
	"SubmitAction", -- client -> server: a GameAction (playerId is forced server-side)
	"StateUpdate", -- server -> client: replicated snapshot
	"ActionFeedback", -- server -> client: { ok, code, message } after an action
	"DebugGiveIce", -- client -> server: testing cheat, grants ice to the caller
}

local folder: Folder

if RunService:IsServer() then
	folder = ReplicatedStorage:FindFirstChild(FOLDER_NAME) :: Folder
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = FOLDER_NAME
		folder.Parent = ReplicatedStorage
	end
	for _, name in REMOTE_NAMES do
		if not folder:FindFirstChild(name) then
			local event = Instance.new("RemoteEvent")
			event.Name = name
			event.Parent = folder
		end
	end
else
	folder = ReplicatedStorage:WaitForChild(FOLDER_NAME) :: Folder
end

function Remotes.event(name: string): RemoteEvent
	return folder:WaitForChild(name) :: RemoteEvent
end

return Remotes
