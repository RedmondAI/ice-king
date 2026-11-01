--!nonstrict
-- Splash / start screen. Uses the uploaded hero + logo images when their ids are set
-- in Assets; otherwise falls back to a styled gradient + "ICE KING" text.

local util = require(script.Parent.util)
local Assets = require(script.Parent.Assets)

local Menu = {}
Menu.__index = Menu

local HOW_TO = "Harvest ice from ponds in winter, keep it refrigerated, then sell it at houses in summer. "
	.. "Buy land, build factories and ponds, and finish with the most money."

function Menu.new(
	parent: Instance,
	onStart: (string) -> (),
	onFindMatch: (string) -> (),
	onCancelFind: () -> ()
): any
	local self = setmetatable({}, Menu)
	self.fast = false

	local root = util.create("Frame", {
		Name = "Menu",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromHex("#0E1620"),
		BorderSizePixel = 0,
		ZIndex = 100,
		Parent = parent,
	})
	self.root = root

	-- Background: hero image if available, else a blue gradient.
	if Assets.splash ~= "" then
		util.create("ImageLabel", {
			Name = "Hero",
			Size = UDim2.fromScale(1, 1),
			BackgroundTransparency = 1,
			Image = Assets.splash,
			ScaleType = Enum.ScaleType.Crop,
			ZIndex = 100,
			Parent = root,
		})
	else
		util.create("Frame", {
			Name = "Backdrop",
			Size = UDim2.fromScale(1, 1),
			BackgroundColor3 = Color3.fromHex("#13293D"),
			BorderSizePixel = 0,
			ZIndex = 100,
			Parent = root,
		}, {
			util.create("UIGradient", {
				Rotation = 90,
				Color = ColorSequence.new(Color3.fromHex("#2E5A82"), Color3.fromHex("#0E1620")),
			}),
		})
	end

	util.create("Frame", {
		Name = "Scrim",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.new(0, 0, 0),
		BackgroundTransparency = 0.45,
		BorderSizePixel = 0,
		ZIndex = 101,
		Parent = root,
	})

	-- Logo: image if available, else styled text.
	if Assets.logo ~= "" then
		util.create("ImageLabel", {
			Name = "Logo",
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, 50),
			Size = UDim2.fromOffset(340, 220),
			BackgroundTransparency = 1,
			Image = Assets.logo,
			ScaleType = Enum.ScaleType.Fit,
			ZIndex = 103,
			Parent = root,
		})
	else
		util.create("TextLabel", {
			Name = "Logo",
			AnchorPoint = Vector2.new(0.5, 0),
			Position = UDim2.new(0.5, 0, 0, 80),
			Size = UDim2.new(0, 400, 0, 70),
			BackgroundTransparency = 1,
			Font = Enum.Font.GothamBlack,
			TextSize = 56,
			TextColor3 = Color3.fromHex("#8FE9FF"),
			Text = "ICE KING",
			ZIndex = 103,
			Parent = root,
		}, { util.stroke(Color3.fromHex("#0C2230"), 3) })
	end

	local card = util.create("Frame", {
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.62),
		Size = UDim2.fromOffset(380, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Color3.fromHex("#16202E"),
		BackgroundTransparency = 0.1,
		BorderSizePixel = 0,
		ZIndex = 102,
		Parent = root,
	}, {
		util.corner(18),
		util.stroke(Color3.fromHex("#2C3A4F"), 1),
		util.padding(22),
		util.create("UIListLayout", {
			Padding = UDim.new(0, 14),
			HorizontalAlignment = Enum.HorizontalAlignment.Center,
			SortOrder = Enum.SortOrder.LayoutOrder,
		}),
	})

	util.create("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 96),
		Font = Enum.Font.Gotham,
		TextSize = 14,
		TextColor3 = Color3.fromHex("#CFE8FF"),
		TextWrapped = true,
		Text = HOW_TO,
		LayoutOrder = 1,
		ZIndex = 103,
		Parent = card,
	})

	local fastToggle = util.create("TextButton", {
		Size = UDim2.new(1, 0, 0, 36),
		BackgroundColor3 = Color3.fromHex("#2A3342"),
		Font = Enum.Font.GothamMedium,
		TextSize = 14,
		TextColor3 = Color3.new(1, 1, 1),
		Text = "Fast mode: OFF",
		BorderSizePixel = 0,
		LayoutOrder = 2,
		ZIndex = 103,
		Parent = card,
	}, { util.corner(10) })

	local playButton = util.create("TextButton", {
		Size = UDim2.new(1, 0, 0, 50),
		BackgroundColor3 = Color3.fromHex("#2E7D46"),
		Font = Enum.Font.GothamBold,
		TextSize = 18,
		TextColor3 = Color3.new(1, 1, 1),
		Text = "Play vs Computer",
		BorderSizePixel = 0,
		LayoutOrder = 3,
		ZIndex = 103,
		Parent = card,
	}, { util.corner(12) })

	local versusButton = util.create("TextButton", {
		Size = UDim2.new(1, 0, 0, 50),
		BackgroundColor3 = Color3.fromHex("#2F6FA8"),
		Font = Enum.Font.GothamBold,
		TextSize = 18,
		TextColor3 = Color3.new(1, 1, 1),
		Text = "Play vs Player",
		BorderSizePixel = 0,
		LayoutOrder = 4,
		ZIndex = 103,
		Parent = card,
	}, { util.corner(12) })

	-- Shown in place of the buttons while waiting in the two-player queue.
	local searchLabel = util.create("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 44),
		Font = Enum.Font.GothamMedium,
		TextSize = 16,
		TextColor3 = Color3.fromHex("#CFE8FF"),
		TextWrapped = true,
		Text = "",
		Visible = false,
		LayoutOrder = 5,
		ZIndex = 103,
		Parent = card,
	})

	local cancelButton = util.create("TextButton", {
		Size = UDim2.new(1, 0, 0, 40),
		BackgroundColor3 = Color3.fromHex("#2A3342"),
		Font = Enum.Font.GothamBold,
		TextSize = 16,
		TextColor3 = Color3.new(1, 1, 1),
		Text = "Cancel",
		BorderSizePixel = 0,
		Visible = false,
		LayoutOrder = 6,
		ZIndex = 103,
		Parent = card,
	}, { util.corner(10) })

	self.fastToggle = fastToggle
	self.playButton = playButton
	self.versusButton = versusButton
	self.searchLabel = searchLabel
	self.cancelButton = cancelButton

	fastToggle.Activated:Connect(function()
		self.fast = not self.fast
		fastToggle.Text = if self.fast then "Fast mode: ON (8 min)" else "Fast mode: OFF"
	end)

	playButton.Activated:Connect(function()
		onStart(if self.fast then "DEV_FAST" else "PROD")
	end)

	versusButton.Activated:Connect(function()
		onFindMatch(if self.fast then "DEV_FAST" else "PROD")
	end)

	cancelButton.Activated:Connect(function()
		onCancelFind()
	end)

	return self
end

function Menu.show(self: any)
	self.root.Visible = true
end

function Menu.hide(self: any)
	self.root.Visible = false
end

-- Swaps the start buttons for a "waiting for an opponent" message + Cancel.
function Menu.setSearching(self: any, isSearching: boolean, mode: string?)
	self.fastToggle.Visible = not isSearching
	self.playButton.Visible = not isSearching
	self.versusButton.Visible = not isSearching
	self.searchLabel.Visible = isSearching
	self.cancelButton.Visible = isSearching
	self.searchLabel.Text = "Waiting for another player to join"
		.. (if mode == "DEV_FAST" then " (fast mode)..." else "...")
end

return Menu
