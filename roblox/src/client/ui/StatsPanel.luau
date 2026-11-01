--!nonstrict
-- A collapsible stats panel (used for both "Stats" and "Other User's Stats"),
-- matching the field list from the old game.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local IceKing = ReplicatedStorage:WaitForChild("IceKing")
local Theme = require(IceKing.Theme)

local util = require(script.Parent.util)
local Panel = require(script.Parent.Panel)

local StatsPanel = {}
StatsPanel.__index = StatsPanel

local FIELDS = {
	"money",
	"ice",
	"blueIce",
	"refrigerators",
	"refrigerated",
	"unrefrigerated",
	"season",
	"trainWindow",
}

function StatsPanel.new(parent: Instance, title: string, opts: any): any
	local self = setmetatable({}, StatsPanel)
	self.panel = Panel.new(parent, title, opts)
	self.rows = {}

	for index, key in FIELDS do
		local row = util.create("Frame", {
			BackgroundTransparency = 1,
			Size = UDim2.new(1, 0, 0, 17),
			LayoutOrder = index,
			Parent = self.panel.content,
		})
		util.create("TextLabel", {
			BackgroundTransparency = 1,
			Size = UDim2.new(0.55, 0, 1, 0),
			Font = Enum.Font.Gotham,
			TextScaled = true,
			TextColor3 = Theme.color("bodyText"),
			TextXAlignment = Enum.TextXAlignment.Left,
			Text = key,
			Parent = row,
		}, { util.fitText(13) })
		self.rows[key] = util.create("TextLabel", {
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.new(1, 0, 0, 0),
			Size = UDim2.new(0.45, 0, 1, 0),
			BackgroundTransparency = 1,
			Font = Enum.Font.GothamBold,
			TextScaled = true,
			TextColor3 = Theme.color("bodyText"),
			TextXAlignment = Enum.TextXAlignment.Right,
			Text = "-",
			Parent = row,
		}, { util.fitText(13) })
	end

	return self
end

function StatsPanel.update(self: any, playerId: string, snapshot: any)
	local player = playerId and snapshot.players[playerId]
	local rows = self.rows
	if not player then
		for _, label in rows do
			label.Text = "-"
		end
		return
	end

	local capacity = player.refrigerators * snapshot.economy.refrigeratorStoragePerUnit
	local safe = math.min(player.ice, capacity)
	local unprotected = math.max(player.ice - capacity, 0)
	local year = snapshot.trainSales.currentYear
	local trainUsed = snapshot.trainSales.usedByPlayerId[playerId] == year

	rows.money.Text = string.format("$%dc", player.money)
	rows.ice.Text = tostring(player.ice)
	rows.blueIce.Text = tostring(player.blueIce)
	rows.refrigerators.Text = tostring(player.refrigerators)
	rows.refrigerated.Text = string.format("%d/%d", safe, capacity)
	rows.unrefrigerated.Text = tostring(unprotected)
	rows.season.Text = string.format(
		"%s kf:%d",
		snapshot.season.logicSeason,
		snapshot.season.transitionKeyframeIndex
	)
	rows.trainWindow.Text =
		string.format("Year %d: %s", year, if trainUsed then "Used" else "Ready")
end

return StatsPanel
