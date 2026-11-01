--!nonstrict
-- Reusable collapsible parchment panel (header with a title + collapse arrow, and
-- a content area that grows with its children). Matches the old game's cream panels.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local IceKing = ReplicatedStorage:WaitForChild("IceKing")
local Theme = require(IceKing.Theme)

local util = require(script.Parent.util)

local Panel = {}
Panel.__index = Panel

function Panel.new(parent: Instance, title: string, opts: any): any
	opts = opts or {}
	local self = setmetatable({}, Panel)
	self.collapsed = opts.collapsed == true

	local root = util.create("Frame", {
		Name = title,
		Size = UDim2.new(1, 0, 0, 30),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.color("uiPanel"),
		BorderSizePixel = 0,
		LayoutOrder = opts.layoutOrder or 1,
		Parent = parent,
	}, {
		util.corner(8),
		util.stroke(Theme.color("uiBorder"), 2),
		util.create("UIListLayout", { SortOrder = Enum.SortOrder.LayoutOrder }),
	})
	self.root = root

	local header = util.create("TextButton", {
		Name = "Header",
		Size = UDim2.new(1, 0, 0, 30),
		BackgroundColor3 = Theme.color("uiPanel"),
		AutoButtonColor = true,
		Text = "",
		BorderSizePixel = 0,
		LayoutOrder = 1,
		Parent = root,
	}, { util.corner(8) })

	util.create("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, -36, 1, -12),
		Position = UDim2.new(0, 10, 0, 6),
		Font = Enum.Font.GothamBold,
		TextScaled = true,
		TextColor3 = Theme.color("uiBorder"),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = title,
		Parent = header,
	}, { util.fitText(14) })

	local arrow = util.create("TextLabel", {
		Name = "Arrow",
		BackgroundTransparency = 1,
		AnchorPoint = Vector2.new(1, 0.5),
		Position = UDim2.new(1, -10, 0.5, 0),
		Size = UDim2.new(0, 18, 1, 0),
		Font = Enum.Font.GothamBold,
		TextSize = 12,
		TextColor3 = Theme.color("uiBorder"),
		Text = "v",
		Parent = header,
	})

	local content = util.create("Frame", {
		Name = "Content",
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundTransparency = 1,
		LayoutOrder = 2,
		Parent = root,
	}, {
		util.create(
			"UIListLayout",
			{ Padding = UDim.new(0, 3), SortOrder = Enum.SortOrder.LayoutOrder }
		),
		util.create("UIPadding", {
			PaddingLeft = UDim.new(0, 10),
			PaddingRight = UDim.new(0, 10),
			PaddingTop = UDim.new(0, 2),
			PaddingBottom = UDim.new(0, 8),
		}),
	})
	self.content = content

	local function apply()
		content.Visible = not self.collapsed
		arrow.Text = if self.collapsed then ">" else "v"
	end
	header.Activated:Connect(function()
		self.collapsed = not self.collapsed
		apply()
	end)
	apply()

	return self
end

return Panel
