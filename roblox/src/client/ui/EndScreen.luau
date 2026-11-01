--!nonstrict
-- Full-screen result overlay shown when the match ends.

local util = require(script.Parent.util)

local EndScreen = {}
EndScreen.__index = EndScreen

function EndScreen.new(parent: Instance, onPlayAgain: () -> ()): any
	local self = setmetatable({}, EndScreen)

	local root = util.create("Frame", {
		Name = "EndScreen",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.45,
		BorderSizePixel = 0,
		Visible = false,
		ZIndex = 50,
		Parent = parent,
	})
	self.root = root

	local card = util.create("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(0, 320, 0, 240),
		BackgroundColor3 = Color3.fromHex("#16202E"),
		BorderSizePixel = 0,
		ZIndex = 51,
		Parent = root,
	}, {
		util.corner(16),
		util.stroke(Color3.fromHex("#2C3A4F"), 1),
		util.padding(18),
	})

	self.titleLabel = util.create("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 48),
		Font = Enum.Font.GothamBold,
		TextSize = 32,
		TextColor3 = Color3.fromHex("#FFE066"),
		Text = "",
		ZIndex = 52,
		Parent = card,
	})

	self.detailLabel = util.create("TextLabel", {
		BackgroundTransparency = 1,
		Position = UDim2.new(0, 0, 0, 60),
		Size = UDim2.new(1, 0, 0, 100),
		Font = Enum.Font.GothamMedium,
		TextSize = 16,
		TextColor3 = Color3.fromHex("#CFE8FF"),
		TextWrapped = true,
		Text = "",
		ZIndex = 52,
		Parent = card,
	})

	local playAgain = util.create("TextButton", {
		Name = "PlayAgain",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, 0),
		Size = UDim2.new(1, 0, 0, 40),
		BackgroundColor3 = Color3.fromHex("#2E7D46"),
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		TextColor3 = Color3.new(1, 1, 1),
		Text = "Play Again",
		BorderSizePixel = 0,
		ZIndex = 52,
		Parent = card,
	}, { util.corner(10) })

	self.playAgainButton = playAgain

	playAgain.Activated:Connect(function()
		self.root.Visible = false
		onPlayAgain()
	end)

	return self
end

function EndScreen.update(self: any, snapshot: any)
	if not snapshot.match.ended then
		self.root.Visible = false
		return
	end

	local me = snapshot.humanId
	local winnerId = snapshot.match.winnerId
	local title, color
	if winnerId == me then
		title, color = "Victory!", Color3.fromHex("#B6F09B")
	elseif winnerId == nil then
		title, color = "Draw", Color3.fromHex("#FFE066")
	else
		title, color = "Defeat", Color3.fromHex("#F56A6A")
	end
	self.titleLabel.Text = title
	self.titleLabel.TextColor3 = color

	local player = snapshot.players[me]
	local rivalId
	for _, id in snapshot.playerOrder do
		if id ~= me then
			rivalId = id
			break
		end
	end
	local rival = rivalId and snapshot.players[rivalId]
	local netValue = 0
	for _, entry in snapshot.netWorth do
		if entry.playerId == me then
			netValue = entry.value
			break
		end
	end
	local detail = string.format("Final money: $%dc\nNet worth: %d", player.money, netValue)
	if snapshot.matchKind == "PVP" and rival then
		detail ..= string.format("\n%s's money: $%dc", rival.name, rival.money)
	end
	if snapshot.opponentLeft then
		detail ..= "\n\nYour opponent left the match."
	else
		detail ..= "\n\nWinner is decided by money."
	end
	self.detailLabel.Text = detail
	self.playAgainButton.Text = if snapshot.matchKind == "PVP"
		then "Find New Opponent"
		else "Play Again"

	self.root.Visible = true
end

return EndScreen
