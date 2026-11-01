--!nonstrict
-- Transient feedback message shown at the top of the board after an action, clear of
-- the tile menu at the bottom.

local util = require(script.Parent.util)

local Toast = {}
Toast.__index = Toast

function Toast.new(parent: Instance): any
	local self = setmetatable({}, Toast)
	self.token = 0

	self.label = util.create("TextLabel", {
		Name = "Toast",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 12),
		Size = UDim2.new(0.9, 0, 0, 34),
		BackgroundColor3 = Color3.fromHex("#2E7D46"),
		BackgroundTransparency = 0.05,
		Font = Enum.Font.GothamMedium,
		TextScaled = true,
		TextColor3 = Color3.new(1, 1, 1),
		Text = "",
		Visible = false,
		ZIndex = 40,
		Parent = parent,
	}, {
		util.corner(10),
		util.create("UISizeConstraint", { MaxSize = Vector2.new(380, 34) }),
		util.create("UIPadding", {
			PaddingLeft = UDim.new(0, 10),
			PaddingRight = UDim.new(0, 10),
			PaddingTop = UDim.new(0, 6),
			PaddingBottom = UDim.new(0, 6),
		}),
		util.fitText(14),
	})

	return self
end

function Toast.show(self: any, message: string, ok: boolean)
	self.token += 1
	local myToken = self.token

	self.label.Text = message
	self.label.BackgroundColor3 = if ok
		then Color3.fromHex("#2E7D46")
		else Color3.fromHex("#8E2C2C")
	self.label.Visible = true

	task.delay(2.4, function()
		if self.token == myToken then
			self.label.Visible = false
		end
	end)
end

return Toast
