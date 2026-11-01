--!nonstrict
-- Top-of-rail minimap: the whole 10x10 board with ownership tints and a box showing
-- the current viewport. Click or drag on it to pan the main board.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local IceKing = ReplicatedStorage:WaitForChild("IceKing")
local Theme = require(IceKing.Theme)

local util = require(script.Parent.util)
local Assets = require(script.Parent.Assets)

local PLAYABLE = 10

local Minimap = {}
Minimap.__index = Minimap

function Minimap.new(parent: Instance, onNavigate: (number, number) -> ()): any
	local self = setmetatable({}, Minimap)
	self.cells = {}
	self.pressing = false

	local root = util.create("Frame", {
		Name = "Minimap",
		Size = UDim2.new(1, 0, 0, 0),
		BackgroundColor3 = Theme.color("uiPanel"),
		BorderSizePixel = 0,
		LayoutOrder = 0,
		Parent = parent,
	}, {
		util.create("UIAspectRatioConstraint", { AspectRatio = 1 }),
		util.corner(8),
		util.stroke(Theme.color("uiBorder"), 2),
		util.padding(6),
	})
	self.root = root

	local grid = util.create("Frame", {
		Name = "Grid",
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromHex("#0C1016"),
		BorderSizePixel = 0,
		ClipsDescendants = true,
		Parent = root,
	})
	self.grid = grid

	for ry = 1, PLAYABLE do
		for rx = 1, PLAYABLE do
			self.cells[rx .. "," .. ry] = util.create("Frame", {
				Size = UDim2.fromScale(1 / PLAYABLE, 1 / PLAYABLE),
				Position = UDim2.fromScale((rx - 1) / PLAYABLE, (ry - 1) / PLAYABLE),
				BackgroundColor3 = Color3.fromHex("#4FA65B"),
				BorderSizePixel = 0,
				Parent = grid,
			})
		end
	end

	self.viewRect = util.create("Frame", {
		Name = "ViewRect",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(0.5, 0.5),
		Position = UDim2.fromScale(0.25, 0.25),
		ZIndex = 5,
		Parent = grid,
	}, { util.stroke(Color3.fromHex("#FF4242"), 2) })

	local function navigateTo(inputPos)
		local absPos = grid.AbsolutePosition
		local absSize = grid.AbsoluteSize
		if absSize.X <= 0 or absSize.Y <= 0 then
			return
		end
		local fx = math.clamp((inputPos.X - absPos.X) / absSize.X, 0, 1)
		local fy = math.clamp((inputPos.Y - absPos.Y) / absSize.Y, 0, 1)
		onNavigate(fx, fy)
	end

	root.InputBegan:Connect(function(input)
		if
			input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
		then
			self.pressing = true
			navigateTo(input.Position)
		end
	end)
	UserInputService.InputChanged:Connect(function(input)
		if not self.pressing then
			return
		end
		if
			input.UserInputType == Enum.UserInputType.MouseMovement
			or input.UserInputType == Enum.UserInputType.Touch
		then
			navigateTo(input.Position)
		end
	end)
	UserInputService.InputEnded:Connect(function(input)
		if
			input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
		then
			self.pressing = false
		end
	end)

	return self
end

function Minimap.update(self: any, snapshot: any)
	local width = snapshot.width
	for ry = 1, PLAYABLE do
		for rx = 1, PLAYABLE do
			local tile = snapshot.tiles[ry * width + rx + 1]
			local cell = self.cells[rx .. "," .. ry]
			if tile and cell then
				if tile.ownerId == snapshot.humanId then
					cell.BackgroundColor3 = Theme.color("ownershipBlue")
				elseif tile.ownerId ~= nil then
					cell.BackgroundColor3 = Theme.color("ownershipRed")
				else
					local visual = Assets.tileVisual[tile.type] or Assets.tileVisual.GRASS
					cell.BackgroundColor3 = visual.summer
				end
			end
		end
	end
end

function Minimap.setViewRect(self: any, frac: any)
	self.viewRect.Position = UDim2.fromScale(frac.x, frac.y)
	self.viewRect.Size = UDim2.fromScale(frac.w, frac.h)
end

return Minimap
