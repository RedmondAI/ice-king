--!nonstrict
-- Bottom-center status bar: "SUMMER | Next flip in 3:06 | Visual transition 0%".

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local IceKing = ReplicatedStorage:WaitForChild("IceKing")
local Theme = require(IceKing.Theme)

local util = require(script.Parent.util)

local StatusBar = {}
StatusBar.__index = StatusBar

local function fmtTime(seconds: number): string
	local total = math.max(0, math.floor(seconds))
	return string.format("%d:%02d", math.floor(total / 60), total % 60)
end

function StatusBar.new(parent: Instance): any
	local self = setmetatable({}, StatusBar)

	self.label = util.create("TextLabel", {
		Name = "StatusBar",
		AnchorPoint = Vector2.new(0.5, 1),
		-- Sits in the strip just below the board, centered under it (clear of the rail).
		Position = UDim2.new(0.5, 0, 1, 36),
		Size = UDim2.new(0.9, 0, 0, 28),
		BackgroundColor3 = Theme.color("uiPanel"),
		Font = Enum.Font.GothamMedium,
		TextScaled = true,
		TextColor3 = Theme.color("bodyText"),
		Text = "",
		ZIndex = 20,
		Parent = parent,
	}, {
		util.corner(8),
		util.stroke(Theme.color("uiBorder"), 2),
		util.create("UISizeConstraint", { MaxSize = Vector2.new(400, 28) }),
		util.create("UIPadding", {
			PaddingLeft = UDim.new(0, 10),
			PaddingRight = UDim.new(0, 10),
			PaddingTop = UDim.new(0, 5),
			PaddingBottom = UDim.new(0, 5),
		}),
		util.fitText(13),
	})

	return self
end

function StatusBar.update(self: any, snapshot: any)
	local season = snapshot.season
	local toFlip = ((season.cycleStartMs + season.cycleDurationMs) - snapshot.nowMs) / 1000
	self.label.Text = string.format(
		"%s  |  Next flip in %s  |  Visual transition %d%%",
		season.logicSeason,
		fmtTime(toFlip),
		math.floor(season.transitionProgress * 100 + 0.5)
	)
end

return StatusBar
