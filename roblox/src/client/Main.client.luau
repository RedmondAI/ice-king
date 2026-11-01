--!nonstrict
-- Client bootstrap: builds the UI (board + parchment rail, matching the old game),
-- starts matches, and renders replicated snapshots.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local StarterGui = game:GetService("StarterGui")

pcall(function()
	StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.All, false)
end)

local IceKing = ReplicatedStorage:WaitForChild("IceKing")
local Remotes = require(IceKing.Remotes)
local Theme = require(IceKing.Theme)

local uiFolder = script.Parent:WaitForChild("ui")
local util = require(uiFolder:WaitForChild("util"))
local Board = require(uiFolder:WaitForChild("Board"))
local Minimap = require(uiFolder:WaitForChild("Minimap"))
local Panel = require(uiFolder:WaitForChild("Panel"))
local StatsPanel = require(uiFolder:WaitForChild("StatsPanel"))
local StatusBar = require(uiFolder:WaitForChild("StatusBar"))
local TileMenu = require(uiFolder:WaitForChild("TileMenu"))
local Toast = require(uiFolder:WaitForChild("Toast"))
local EndScreen = require(uiFolder:WaitForChild("EndScreen"))
local Menu = require(uiFolder:WaitForChild("Menu"))
local SnowEffect = require(uiFolder:WaitForChild("SnowEffect"))
local Assets = require(uiFolder:WaitForChild("Assets"))

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local RAIL_WIDTH = 270

local INSTRUCTIONS = "Drag the board to look around; tap a tile for its actions.\n\n"
	.. "Winter: harvest ponds for ice, and keep it in fridges so it won't melt.\n"
	.. "Summer: sell ice ($2) and blue ice ($8) at your houses.\n\n"
	.. "Buy land, build factories and ponds, and finish with the most money."

local screen = util.create("ScreenGui", {
	Name = "IceKing",
	IgnoreGuiInset = false,
	ResetOnSpawn = false,
	ZIndexBehavior = Enum.ZIndexBehavior.Sibling,
	Parent = playerGui,
})

local gameRoot = util.create("Frame", {
	Name = "Game",
	Size = UDim2.fromScale(1, 1),
	BackgroundColor3 = Color3.fromHex("#1E3A5F"),
	BorderSizePixel = 0,
	Visible = false,
	ZIndex = 1,
	Parent = screen,
}, {
	util.create("UIGradient", {
		Rotation = 90,
		Color = ColorSequence.new(Color3.fromHex("#2E5A82"), Color3.fromHex("#112536")),
	}),
})

local boardArea = util.create("Frame", {
	Name = "BoardArea",
	Position = UDim2.new(0, 8, 0, 8),
	Size = UDim2.new(1, -(8 + 8 + RAIL_WIDTH + 8), 1, -52),
	BackgroundTransparency = 1,
	Parent = gameRoot,
})

if Assets.logo ~= "" then
	util.create("ImageLabel", {
		Name = "Logo",
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 6, 0, 6),
		Size = UDim2.fromOffset(200, 130),
		Image = Assets.logo,
		ScaleType = Enum.ScaleType.Fit,
		ZIndex = 15,
		Parent = boardArea,
	})
else
	util.create("TextLabel", {
		Name = "Logo",
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 6, 0, 6),
		Size = UDim2.new(0, 220, 0, 42),
		Font = Enum.Font.GothamBlack,
		TextSize = 34,
		TextColor3 = Color3.fromHex("#8FE9FF"),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = "Ice King",
		ZIndex = 15,
		Parent = boardArea,
	}, { util.stroke(Color3.fromHex("#0C2230"), 3) })
end

local rail = util.create("ScrollingFrame", {
	Name = "Rail",
	AnchorPoint = Vector2.new(1, 0),
	Position = UDim2.new(1, -8, 0, 8),
	Size = UDim2.new(0, RAIL_WIDTH, 1, -16),
	BackgroundTransparency = 1,
	BorderSizePixel = 0,
	ScrollBarThickness = 6,
	CanvasSize = UDim2.new(0, 0, 0, 0),
	AutomaticCanvasSize = Enum.AutomaticSize.Y,
	Parent = gameRoot,
}, {
	util.create(
		"UIListLayout",
		{ Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }
	),
})

local selectedTile = nil
local latestSnapshot = nil
local currentMode = "PROD"
local currentKind = "SOLO" -- "SOLO" (vs the bot) or "PVP" (vs another player)
local leftMatchId = nil -- the match we just left; its in-flight snapshots are ignored
local prevSeason = nil
local prevMyClaimable = 0

local board, minimap, statsPanel, otherStatsPanel, statusBar, tileMenu, toast, endScreen, menu

local function submit(action)
	Remotes.event("SubmitAction"):FireServer(action)
end

local function refreshSelectionUI()
	if latestSnapshot then
		board:update(latestSnapshot, selectedTile)
		tileMenu:update(latestSnapshot, selectedTile)
	end
end

board = Board.new(boardArea, function(rx, ry)
	if not latestSnapshot then
		return
	end
	if selectedTile and selectedTile.x == rx and selectedTile.y == ry then
		selectedTile = nil
	else
		selectedTile = { x = rx, y = ry }
	end
	refreshSelectionUI()
end, function()
	if minimap then
		minimap:setViewRect(board:getViewFraction())
	end
end)

minimap = Minimap.new(rail, function(fx, fy)
	board:panToFraction(fx, fy)
end)

local snow = SnowEffect.new(board.viewport, function()
	return board.worldPos
end)

local instructions = Panel.new(rail, "Instructions", { layoutOrder = 1, collapsed = true })
util.create("TextLabel", {
	BackgroundTransparency = 1,
	Size = UDim2.new(1, 0, 0, 0),
	AutomaticSize = Enum.AutomaticSize.Y,
	Font = Enum.Font.Gotham,
	TextSize = 12,
	TextColor3 = Theme.color("bodyText"),
	TextXAlignment = Enum.TextXAlignment.Left,
	TextWrapped = true,
	Text = INSTRUCTIONS,
	Parent = instructions.content,
})

statsPanel = StatsPanel.new(rail, "Stats", { layoutOrder = 2 })
otherStatsPanel = StatsPanel.new(rail, "Other User's Stats", { layoutOrder = 3 })

local skipSummerBtn = util.create("TextButton", {
	Name = "SkipSummer",
	Size = UDim2.new(1, 0, 0, 34),
	BackgroundColor3 = Color3.fromHex("#8FC8E6"),
	Font = Enum.Font.GothamBold,
	TextScaled = true,
	TextColor3 = Color3.fromHex("#0C2230"),
	Text = "Skip Summer",
	BorderSizePixel = 0,
	Visible = false,
	LayoutOrder = 4,
	Parent = rail,
}, { util.fitText(14), util.corner(8), util.stroke(Theme.color("uiBorder"), 2) })

local forfeitBtn = util.create("TextButton", {
	Name = "Forfeit",
	Size = UDim2.new(1, 0, 0, 30),
	BackgroundColor3 = Color3.fromHex("#8E2C2C"),
	Font = Enum.Font.GothamBold,
	TextScaled = true,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "Forfeit",
	BorderSizePixel = 0,
	LayoutOrder = 5,
	Parent = rail,
}, { util.fitText(13), util.corner(8) })

statusBar = StatusBar.new(boardArea)
tileMenu = TileMenu.new(boardArea, function(action)
	submit(action)
end)
toast = Toast.new(boardArea)

local function findOpponent(mode)
	currentMode = mode
	currentKind = "PVP"
	selectedTile = nil
	leftMatchId = latestSnapshot and latestSnapshot.matchId
	gameRoot.Visible = false
	menu:show()
	menu:setSearching(true, mode)
	Remotes.event("FindMatch"):FireServer(mode)
end

endScreen = EndScreen.new(screen, function()
	selectedTile = nil
	if currentKind == "PVP" then
		findOpponent(currentMode)
	else
		Remotes.event("StartMatch"):FireServer(currentMode)
	end
end)

menu = Menu.new(
	screen,
	function(mode)
		currentMode = mode
		currentKind = "SOLO"
		selectedTile = nil
		menu:hide()
		gameRoot.Visible = true
		Remotes.event("StartMatch"):FireServer(mode)
	end,
	findOpponent,
	function()
		Remotes.event("CancelFindMatch"):FireServer()
	end
)

Remotes.event("MatchmakingStatus").OnClientEvent:Connect(function(status)
	if status and status.status == "SEARCHING" then
		menu:setSearching(true, status.mode)
	else
		menu:setSearching(false)
	end
end)

skipSummerBtn.Activated:Connect(function()
	submit({ type = "season.skipSummerVote" })
end)
forfeitBtn.Activated:Connect(function()
	submit({ type = "player.forfeit" })
end)

-- Temporary testing button: grants 100 ice. Remove before publishing.
local testIceBtn = util.create("TextButton", {
	Name = "TestIce",
	Size = UDim2.new(1, 0, 0, 28),
	BackgroundColor3 = Color3.fromHex("#6B4FA0"),
	Font = Enum.Font.GothamBold,
	TextScaled = true,
	TextColor3 = Color3.new(1, 1, 1),
	Text = "TEST: +100 Ice",
	BorderSizePixel = 0,
	LayoutOrder = 6,
	Parent = rail,
}, { util.fitText(12), util.corner(8) })
testIceBtn.Activated:Connect(function()
	Remotes.event("DebugGiveIce"):FireServer()
end)

minimap:setViewRect(board:getViewFraction())

Remotes.event("StateUpdate").OnClientEvent:Connect(function(snapshot)
	-- A two-player match starts from the menu once the server pairs us up.
	if snapshot.matchId == leftMatchId then
		return
	end
	if not gameRoot.Visible then
		currentKind = snapshot.matchKind or currentKind
		prevSeason = nil
		prevMyClaimable = 0
		menu:hide()
		gameRoot.Visible = true
	end
	latestSnapshot = snapshot
	local me = snapshot.humanId
	local rivalId
	for _, id in snapshot.playerOrder do
		if id ~= me then
			rivalId = id
			break
		end
	end

	-- Warn when ready-to-collect ice melts because it wasn't collected before summer.
	local myClaimable = 0
	for _, job in snapshot.ponds do
		if job.ownerId == me and job.status == "CLAIMABLE" then
			myClaimable += 1
		end
	end
	if
		prevSeason == "WINTER"
		and snapshot.season.logicSeason == "SUMMER"
		and prevMyClaimable > 0
	then
		toast:show(
			string.format("You lost %d ice - collect harvests before summer!", prevMyClaimable),
			false
		)
	end
	prevSeason = snapshot.season.logicSeason
	prevMyClaimable = myClaimable

	board:update(snapshot, selectedTile)
	minimap:update(snapshot)
	snow:update(snapshot)
	minimap:setViewRect(board:getViewFraction())
	statsPanel:update(me, snapshot)
	otherStatsPanel:update(rivalId, snapshot)
	statusBar:update(snapshot)
	tileMenu:update(snapshot, selectedTile)
	endScreen:update(snapshot)

	local ended = snapshot.match.ended
	skipSummerBtn.Visible = (snapshot.season.logicSeason == "SUMMER") and not ended
	-- Both players have to vote in a two-player match, so show who's still pending.
	local votes = snapshot.summerSkipVotes or {}
	if snapshot.matchKind == "PVP" and votes[me] then
		skipSummerBtn.Text = "Waiting for opponent to skip..."
	elseif snapshot.matchKind == "PVP" and rivalId and votes[rivalId] then
		skipSummerBtn.Text = "Skip Summer (opponent voted)"
	else
		skipSummerBtn.Text = "Skip Summer"
	end
	forfeitBtn.Visible = not ended
end)

Remotes.event("ActionFeedback").OnClientEvent:Connect(function(feedback)
	if not feedback then
		return
	end
	local isPurchase = feedback.actionType == "tile.buy"
		or feedback.actionType == "tile.buyFromPlayer"
	if feedback.ok and isPurchase and feedback.x and feedback.y then
		board:playPurchase(feedback.x, feedback.y, feedback.actionType == "tile.buyFromPlayer")
		return
	end
	if feedback.message then
		toast:show(feedback.message, feedback.ok == true)
	end
end)
