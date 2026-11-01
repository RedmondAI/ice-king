--!nonstrict
-- Falling-snow overlay for winter. Pure UI (no uploaded assets needed): a pool of
-- small white flakes that drift down, building up into winter and fading out in spring.
-- Each flake has a light drop shadow so it still reads against snowy tiles.

local RunService = game:GetService("RunService")

local util = require(script.Parent.util)

local FLAKE_COUNT = 48
local SHADOW_COLOR = Color3.fromHex("#2E3B55")
local FLAKE_OPACITY = 0.9 -- at full snowfall
local SHADOW_OPACITY = 0.22 -- at full snowfall
-- Shadow offset as a fraction of flake size (down-right, matching the tile shadows).
local SHADOW_OFFSET_X = 0.45
local SHADOW_OFFSET_Y = 0.6
-- Fall speed range; slower flakes cast their shadow farther away (up to this many
-- times the base offset for the slowest flake), as if floating higher above the ground.
local MIN_SPEED = 0.05
local MAX_SPEED = 0.13
local SLOW_SHADOW_DISTANCE = 1.8
-- Flakes wrap around a band slightly larger than the viewport so they enter and
-- leave fully off-screen.
local WRAP_MARGIN = 0.05
local WRAP_SPAN = 1 + WRAP_MARGIN * 2

local SnowEffect = {}
SnowEffect.__index = SnowEffect

local function wrap(value: number): number
	return (value + WRAP_MARGIN) % WRAP_SPAN - WRAP_MARGIN
end

-- getPanOffset returns the map's pan offset in viewport fractions; flakes shift by it
-- so the snow scrolls with the map instead of staying stuck to the screen.
function SnowEffect.new(parent: Instance, getPanOffset: (() -> Vector2)?): any
	local self = setmetatable({}, SnowEffect)
	self.intensity = 0
	self.shownIntensity = -1 -- forces the first transparency write
	self.target = 0
	self.flakes = {}

	local container = util.create("Frame", {
		Name = "Snow",
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		ClipsDescendants = true,
		Visible = false,
		ZIndex = 15,
		Parent = parent,
	})
	self.container = container

	for i = 1, FLAKE_COUNT do
		local size = 0.008 + math.random() * 0.01
		local speed = MIN_SPEED + math.random() * (MAX_SPEED - MIN_SPEED)
		local slowness = 1 - (speed - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)
		local distance = 1 + slowness * (SLOW_SHADOW_DISTANCE - 1)
		local shadow = util.create("Frame", {
			Size = UDim2.fromScale(size, size),
			-- Sized off the viewport height so flakes stay round on wide screens.
			SizeConstraint = Enum.SizeConstraint.RelativeYY,
			BackgroundColor3 = SHADOW_COLOR,
			BackgroundTransparency = 1,
			BorderSizePixel = 0,
			ZIndex = 14,
			Parent = container,
		}, { util.corner(50) })
		local inst = util.create("Frame", {
			Size = UDim2.fromScale(size, size),
			-- Sized off the viewport height so flakes stay round on wide screens.
			SizeConstraint = Enum.SizeConstraint.RelativeYY,
			Position = UDim2.fromScale(math.random(), math.random()),
			BackgroundColor3 = Color3.new(1, 1, 1),
			BackgroundTransparency = 0.3,
			BorderSizePixel = 0,
			ZIndex = 15,
			Parent = container,
		}, { util.corner(50) })
		self.flakes[i] = {
			inst = inst,
			shadow = shadow,
			shadowOffset = Vector2.new(size * SHADOW_OFFSET_X, size * SHADOW_OFFSET_Y) * distance,
			x = math.random(),
			y = math.random(),
			speed = speed,
			drift = (math.random() - 0.5) * 0.03,
			phase = math.random() * math.pi * 2,
		}
	end

	RunService.Heartbeat:Connect(function(dt)
		self.intensity += (self.target - self.intensity) * math.min(1, dt * 2)
		if self.intensity < 0.02 then
			if container.Visible then
				container.Visible = false
			end
			return
		end
		container.Visible = true
		-- Transparency only changes while snowfall builds up or eases off.
		local isFading = math.abs(self.intensity - self.shownIntensity) > 0.005
		if isFading then
			self.shownIntensity = self.intensity
		end
		local offset = if getPanOffset then getPanOffset() else Vector2.zero
		-- Flake sizes are in viewport heights; convert the shadow's X offset to widths.
		local area = container.AbsoluteSize
		local heightPerWidth = if area.X > 0 then area.Y / area.X else 1
		for _, flake in self.flakes do
			local previousY = wrap(flake.y + offset.Y)
			flake.y = (flake.y + flake.speed * dt) % WRAP_SPAN
			local py = wrap(flake.y + offset.Y)
			-- Fell off the bottom and re-entered at the top: pick a fresh column.
			if py < previousY then
				flake.x = math.random()
			end
			flake.phase += dt
			local px = wrap(flake.x + math.sin(flake.phase) * flake.drift + offset.X)
			flake.inst.Position = UDim2.fromScale(px, py)
			flake.shadow.Position = UDim2.fromScale(
				px + flake.shadowOffset.X * heightPerWidth,
				py + flake.shadowOffset.Y
			)
			if isFading then
				flake.inst.BackgroundTransparency = 1 - FLAKE_OPACITY * self.intensity
				flake.shadow.BackgroundTransparency = 1 - SHADOW_OPACITY * self.intensity
			end
		end
	end)

	return self
end

function SnowEffect.update(self: any, snapshot: any)
	-- Snowfall builds up with the autumn transition and eases off as spring arrives.
	self.target = 1 - util.summerAmount(snapshot.season)
end

return SnowEffect
