--!nonstrict
-- The board: a 10x10 world shown through a viewport you drag to pan. The viewport
-- fills its area; its shorter side shows ~2.5 tiles and the longer side shows more. Each tile
-- shows a colored OWNER BORDER (blue = you, red = rival) so everyone can see who owns
-- what, plus overlays for YOUR jobs: a harvest/craft progress bar, a "collect" badge
-- when output is ready, and a pulsing red border when ready ice is about to melt.
-- Selection is a single thin white border drawn on top of everything.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local IceKing = ReplicatedStorage:WaitForChild("IceKing")
local Theme = require(IceKing.Theme)

local util = require(script.Parent.util)
local Assets = require(script.Parent.Assets)

local PLAYABLE = 10
local VIEWPORT_TILES = 2.5
local DRAG_THRESHOLD = 6
local CELL = 1 / PLAYABLE
local PULSE_WINDOW_MS = 20000
-- A season jump bigger than this (e.g. the skip-summer vote) animates instead of snapping.
local SEASON_JUMP = 0.15
local SEASON_JUMP_SECONDS = 1.5
-- Blend levels between two season frames; finer than the eye can tell apart.
local FADE_STEPS = 32

local Board = {}
Board.__index = Board

local function makeCell(world, rx, ry, onBegin, onClick)
	local col, row = rx - 1, ry - 1
	local button = util.create("ImageButton", {
		Name = rx .. "," .. ry,
		Size = UDim2.fromScale(CELL, CELL),
		Position = UDim2.fromScale(col * CELL, row * CELL),
		BackgroundColor3 = Color3.fromHex("#4FA65B"),
		BorderSizePixel = 0,
		AutoButtonColor = false,
		ScaleType = Enum.ScaleType.Stretch,
		ResampleMode = Enum.ResamplerMode.Pixelated,
		ZIndex = 1,
		Parent = world,
	})

	-- The next season frame, faded in over the current one during transitions.
	local blend = util.create("ImageLabel", {
		Name = "Blend",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		ScaleType = Enum.ScaleType.Stretch,
		ResampleMode = Enum.ResamplerMode.Pixelated,
		Visible = false,
		ZIndex = 2,
		Parent = button,
	})

	local label = util.create("TextLabel", {
		Name = "Label",
		BackgroundTransparency = 1,
		Size = UDim2.fromScale(1, 1),
		Text = "",
		TextScaled = true,
		Font = Enum.Font.GothamBold,
		TextColor3 = Color3.fromHex("#20160C"),
		TextTransparency = 0.2,
		ZIndex = 3,
		Parent = button,
	})

	local progress = util.create("Frame", {
		Name = "Progress",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.fromScale(0.5, 0.95),
		Size = UDim2.fromScale(0.84, 0.12),
		BackgroundColor3 = Color3.fromHex("#0C1016"),
		BackgroundTransparency = 0.25,
		BorderSizePixel = 0,
		Visible = false,
		ZIndex = 4,
		Parent = button,
	}, {
		util.corner(3),
		util.create("Frame", {
			Name = "Fill",
			Size = UDim2.fromScale(0, 1),
			BackgroundColor3 = Color3.fromHex("#78D42B"),
			BorderSizePixel = 0,
			ZIndex = 4,
		}, { util.corner(3) }),
	})

	local collect = util.create("TextLabel", {
		Name = "Collect",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(0.9, 0.38),
		BackgroundColor3 = Color3.fromHex("#8FE9FF"),
		Font = Enum.Font.GothamBold,
		Text = "COLLECT",
		TextScaled = true,
		TextColor3 = Color3.fromHex("#0C2230"),
		Visible = false,
		ZIndex = 5,
		Parent = button,
	}, { util.corner(6) })

	-- Owner border (blue = you, red = rival). ZIndex above neighbours so all four
	-- sides draw on top rather than being clipped by adjacent tiles.
	local ownerBorder = util.create("Frame", {
		Name = "OwnerBorder",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(1, -6, 1, -6),
		BackgroundTransparency = 1,
		Visible = false,
		ZIndex = 6,
		Parent = button,
	}, { util.stroke(Color3.fromHex("#37A6FF"), 3) })

	local pulse = util.create("Frame", {
		Name = "Pulse",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.new(1, -6, 1, -6),
		BackgroundTransparency = 1,
		Visible = false,
		ZIndex = 8,
		Parent = button,
	}, { util.stroke(Color3.fromHex("#FF3B3B"), 3) })

	button.InputBegan:Connect(onBegin)
	button.Activated:Connect(function()
		onClick(rx, ry)
	end)

	return {
		button = button,
		blend = blend,
		label = label,
		progress = progress,
		progressFill = progress:FindFirstChild("Fill"),
		collect = collect,
		ownerBorder = ownerBorder,
		ownerStroke = ownerBorder:FindFirstChildWhichIsA("UIStroke"),
		pulse = pulse,
		pulseStroke = pulse:FindFirstChildWhichIsA("UIStroke"),
	}
end

function Board.new(parent: Instance, onTileClicked: (number, number) -> (), onPan: (() -> ())?): any
	local self = setmetatable({}, Board)
	self.cells = {}
	self.onPan = onPan
	self.pulsing = {}
	-- World size and pan offset, both in fractions of the viewport (per axis).
	self.worldScale = Vector2.new(PLAYABLE / VIEWPORT_TILES, PLAYABLE / VIEWPORT_TILES)
	self.worldPos = -(self.worldScale - Vector2.one) / 2
	self.pressing = false
	self.isDragging = false
	self.dragStart = Vector3.zero
	self.worldStart = self.worldPos
	self.shownSummer = nil -- season look currently drawn (0 = winter, 1 = summer)
	self.targetSummer = 1
	self.isSeasonAnimating = false

	local viewport = util.create("Frame", {
		Name = "Viewport",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.5),
		Size = UDim2.fromScale(1, 1),
		BackgroundColor3 = Color3.fromHex("#0C1016"),
		BorderSizePixel = 0,
		ClipsDescendants = true,
		Parent = parent,
	}, {
		util.corner(12),
	})
	self.viewport = viewport

	local world = util.create("Frame", {
		Name = "World",
		Size = UDim2.fromScale(self.worldScale.X, self.worldScale.Y),
		Position = UDim2.fromScale(self.worldPos.X, self.worldPos.Y),
		BackgroundColor3 = Color3.fromHex("#1A2230"),
		BorderSizePixel = 0,
		Parent = viewport,
	})
	self.world = world

	self.selection = util.create("Frame", {
		Name = "Selection",
		BackgroundTransparency = 1,
		Size = UDim2.new(CELL, -6, CELL, -6),
		Visible = false,
		ZIndex = 10,
		Parent = world,
	}, { util.stroke(Color3.fromHex("#FFFFFF"), 2) })

	local function beginPress(input)
		if
			input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
		then
			self.pressing = true
			self.isDragging = false
			self.dragStart = input.Position
			self.worldStart = self.worldPos
		end
	end

	local function handleClick(rx, ry)
		if self.isDragging then
			self.isDragging = false
			return
		end
		onTileClicked(rx, ry)
	end

	UserInputService.InputChanged:Connect(function(input)
		if not self.pressing then
			return
		end
		if
			input.UserInputType ~= Enum.UserInputType.MouseMovement
			and input.UserInputType ~= Enum.UserInputType.Touch
		then
			return
		end
		local delta = input.Position - self.dragStart
		if math.abs(delta.X) + math.abs(delta.Y) > DRAG_THRESHOLD then
			self.isDragging = true
		end
		local size = viewport.AbsoluteSize
		if size.X <= 0 or size.Y <= 0 then
			return
		end
		self:setWorldPos(self.worldStart + Vector2.new(delta.X / size.X, delta.Y / size.Y))
	end)

	viewport:GetPropertyChangedSignal("AbsoluteSize"):Connect(function()
		self:layout()
	end)
	self:layout()

	UserInputService.InputEnded:Connect(function(input)
		if
			input.UserInputType == Enum.UserInputType.MouseButton1
			or input.UserInputType == Enum.UserInputType.Touch
		then
			self.pressing = false
		end
	end)

	for ry = 1, PLAYABLE do
		for rx = 1, PLAYABLE do
			self.cells[rx .. "," .. ry] = makeCell(world, rx, ry, beginPress, handleClick)
		end
	end

	RunService.Heartbeat:Connect(function(dt)
		if self.isSeasonAnimating then
			local step = dt / SEASON_JUMP_SECONDS
			local diff = self.targetSummer - self.shownSummer
			if math.abs(diff) <= step then
				self.shownSummer = self.targetSummer
				self.isSeasonAnimating = false
			else
				self.shownSummer += math.sign(diff) * step
			end
			self:renderSeason()
		end
		if #self.pulsing == 0 then
			return
		end
		local alpha = 0.2 + 0.55 * (0.5 + 0.5 * math.sin(os.clock() * 7))
		for _, stroke in self.pulsing do
			stroke.Transparency = alpha
		end
	end)

	return self
end

-- Moves the world (in viewport fractions), clamped so it always covers the viewport.
function Board.setWorldPos(self: any, pos: Vector2)
	local minPos = Vector2.one - self.worldScale
	local newX = math.clamp(pos.X, math.min(minPos.X, 0), 0)
	local newY = math.clamp(pos.Y, math.min(minPos.Y, 0), 0)
	self.worldPos = Vector2.new(newX, newY)
	self.world.Position = UDim2.fromScale(newX, newY)
	if self.onPan then
		self.onPan()
	end
end

-- Re-sizes the world for the viewport's current shape, keeping tiles square: the
-- shorter side shows VIEWPORT_TILES tiles, but the world always spans the longer side.
function Board.layout(self: any)
	local size = self.viewport.AbsoluteSize
	if size.X <= 0 or size.Y <= 0 then
		return
	end
	local view = self:getViewFraction()
	local centerX, centerY = view.x + view.w / 2, view.y + view.h / 2
	local tilePx =
		math.max(math.min(size.X, size.Y) / VIEWPORT_TILES, math.max(size.X, size.Y) / PLAYABLE)
	local worldPx = tilePx * PLAYABLE
	self.worldScale = Vector2.new(worldPx / size.X, worldPx / size.Y)
	self.world.Size = UDim2.fromScale(self.worldScale.X, self.worldScale.Y)
	self:panToFraction(centerX, centerY)
end

-- The visible part of the world, as fractions of the whole map.
function Board.getViewFraction(self: any)
	return {
		x = -self.worldPos.X / self.worldScale.X,
		y = -self.worldPos.Y / self.worldScale.Y,
		w = 1 / self.worldScale.X,
		h = 1 / self.worldScale.Y,
	}
end

function Board.panToFraction(self: any, cx: number, cy: number)
	local w, h = 1 / self.worldScale.X, 1 / self.worldScale.Y
	local leftX = math.clamp(cx - w / 2, 0, math.max(1 - w, 0))
	local topY = math.clamp(cy - h / 2, 0, math.max(1 - h, 0))
	self:setWorldPos(Vector2.new(-leftX * self.worldScale.X, -topY * self.worldScale.Y))
end

local function clamp01(value: number): number
	if value < 0 then
		return 0
	elseif value > 1 then
		return 1
	end
	return value
end

local function sheetFrameOffset(frame: number): Vector2
	local size = Assets.SHEET_FRAME_SIZE
	local column = frame % Assets.SHEET_COLUMNS
	local row = frame // Assets.SHEET_COLUMNS
	return Vector2.new(column * size, row * size)
end

-- Draws every tile at the current season look: the two nearest sheet frames, with the
-- later one faded in by how far between them we are. Placeholder tiles blend colors.
function Board.renderSeason(self: any)
	local summer = clamp01(self.shownSummer or 1)
	local position = summer * (Assets.SHEET_FRAMES - 1)
	local frameA = math.floor(position)
	local frameB = math.min(frameA + 1, Assets.SHEET_FRAMES - 1)
	-- Quantised so tiles are only touched when the blend visibly changes.
	local fade = math.floor((position - frameA) * FADE_STEPS + 0.5) / FADE_STEPS
	local offsetA, offsetB = sheetFrameOffset(frameA), sheetFrameOffset(frameB)
	local frameSize = Vector2.new(Assets.SHEET_FRAME_SIZE, Assets.SHEET_FRAME_SIZE)
	local seasonKey = string.format("%d:%d:%d", frameA, frameB, fade * FADE_STEPS)

	for _, cell in self.cells do
		-- Skip tiles already drawn with this sheet/placeholder at this season look.
		local renderKey = (cell.sheet or tostring(cell.visual)) .. "|" .. seasonKey
		if cell.renderKey == renderKey then
			continue
		end
		cell.renderKey = renderKey
		if cell.sheet then
			cell.button.Image = cell.sheet
			cell.button.ImageRectSize = frameSize
			cell.button.ImageRectOffset = offsetA
			cell.button.BackgroundTransparency = 1
			local isBlending = fade > 0.02 and frameB ~= frameA
			cell.blend.Visible = isBlending
			if isBlending then
				cell.blend.Image = cell.sheet
				cell.blend.ImageRectSize = frameSize
				cell.blend.ImageRectOffset = offsetB
				cell.blend.ImageTransparency = 1 - fade
			end
		elseif cell.visual then
			cell.button.Image = ""
			cell.button.BackgroundTransparency = 0
			cell.button.BackgroundColor3 = cell.visual.winter:Lerp(cell.visual.summer, summer)
			cell.blend.Visible = false
		end
	end
end

-- Celebrates a tile the player just bought, right on the tile: a blue flash, a ring
-- that expands out of the tile, and a word that floats up and fades. Replaces the
-- old bottom-of-screen toast, which covered the tile menu's buttons.
function Board.playPurchase(self: any, rx: number, ry: number, isBuyout: boolean)
	if rx < 1 or rx > PLAYABLE or ry < 1 or ry > PLAYABLE then
		return
	end
	local blue = Theme.color("ownershipBlue")
	local centerX, centerY = (rx - 0.5) * CELL, (ry - 0.5) * CELL

	local flash = util.create("Frame", {
		Name = "PurchaseFlash",
		Position = UDim2.fromScale((rx - 1) * CELL, (ry - 1) * CELL),
		Size = UDim2.fromScale(CELL, CELL),
		BackgroundColor3 = blue,
		BackgroundTransparency = 0.2,
		BorderSizePixel = 0,
		ZIndex = 11,
		Parent = self.world,
	})

	local ring = util.create("Frame", {
		Name = "PurchaseRing",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(centerX, centerY),
		Size = UDim2.fromScale(CELL, CELL),
		BackgroundTransparency = 1,
		ZIndex = 11,
		Parent = self.world,
	}, { util.stroke(blue, 5) })

	local wordStroke = util.create("UIStroke", { Color = Color3.fromHex("#0C2230"), Thickness = 2 })
	local word = util.create("TextLabel", {
		Name = "PurchaseWord",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(centerX, centerY),
		Size = UDim2.fromScale(CELL * 0.9, CELL * 0.26),
		BackgroundTransparency = 1,
		Font = Enum.Font.GothamBlack,
		TextScaled = true,
		TextColor3 = Theme.color("highlightYellow"),
		Text = if isBuyout then "TAKEN!" else "YOURS!",
		ZIndex = 12,
		Parent = self.world,
	}, { wordStroke })

	local quick = TweenInfo.new(0.7, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local rise = TweenInfo.new(1.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	local fadeLate =
		TweenInfo.new(0.5, Enum.EasingStyle.Linear, Enum.EasingDirection.Out, 0, false, 0.7)

	TweenService:Create(flash, quick, { BackgroundTransparency = 1 }):Play()
	TweenService:Create(ring, quick, { Size = UDim2.fromScale(CELL * 1.35, CELL * 1.35) }):Play()
	TweenService:Create(ring:FindFirstChildWhichIsA("UIStroke"), quick, { Transparency = 1 }):Play()
	TweenService:Create(word, rise, { Position = UDim2.fromScale(centerX, centerY - CELL * 0.4) })
		:Play()
	TweenService:Create(word, fadeLate, { TextTransparency = 1 }):Play()
	TweenService:Create(wordStroke, fadeLate, { Transparency = 1 }):Play()

	task.delay(1.3, function()
		flash:Destroy()
		ring:Destroy()
		word:Destroy()
	end)
end

function Board.update(self: any, snapshot: any, selected: any)
	local width = snapshot.width
	local me = snapshot.humanId
	local isWinter = snapshot.season.logicSeason == "WINTER"
	local msToSummer = (snapshot.season.cycleStartMs + snapshot.season.cycleDurationMs)
		- snapshot.nowMs
	local pulseWindow = isWinter and msToSummer < PULSE_WINDOW_MS

	local pondByTile, factoryActive, factoryComplete = {}, {}, {}
	for _, job in snapshot.ponds do
		if job.status == "ACTIVE" or job.status == "CLAIMABLE" then
			pondByTile[job.pondX .. "," .. job.pondY] = job
		end
	end
	for _, job in snapshot.factoryJobs do
		if job.status == "ACTIVE" then
			factoryActive[job.x .. "," .. job.y] = job
		elseif job.status == "COMPLETE" then
			factoryComplete[job.x .. "," .. job.y] = job
		end
	end

	local newPulsing = {}

	for ry = 1, PLAYABLE do
		for rx = 1, PLAYABLE do
			local tile = snapshot.tiles[ry * width + rx + 1]
			local cell = self.cells[rx .. "," .. ry]
			if tile and cell then
				local key = rx .. "," .. ry
				-- Remember what to draw; renderSeason() picks the season frame below.
				cell.visual = Assets.tileVisual[tile.type] or Assets.tileVisual.GRASS
				cell.sheet = Assets.tileSheets[tile.type]
				cell.label.Text = if cell.sheet then "" else (cell.visual.label or "")

				-- Owner border, visible to everyone.
				if tile.ownerId == me then
					cell.ownerBorder.Visible = true
					cell.ownerStroke.Color = Theme.color("ownershipBlue")
				elseif tile.ownerId ~= nil then
					cell.ownerBorder.Visible = true
					cell.ownerStroke.Color = Theme.color("ownershipRed")
				else
					cell.ownerBorder.Visible = false
				end

				-- Job overlays are shown only for the viewing player's own jobs.
				local pondJob = pondByTile[key]
				local minePond = pondJob ~= nil and pondJob.ownerId == me
				local fActive = factoryActive[key]
				local mineFactoryActive = fActive ~= nil and fActive.ownerId == me
				local fComplete = factoryComplete[key]
				local mineFactoryComplete = fComplete ~= nil and fComplete.ownerId == me

				local showCollect = (minePond and pondJob.status == "CLAIMABLE")
					or mineFactoryComplete
				local shouldPulse = minePond and pondJob.status == "CLAIMABLE" and pulseWindow
				cell.collect.Visible = showCollect
				cell.pulse.Visible = shouldPulse
				if shouldPulse then
					table.insert(newPulsing, cell.pulseStroke)
				end

				local progressValue = nil
				if minePond and pondJob.status == "ACTIVE" then
					progressValue = (snapshot.nowMs - pondJob.createdAtMs)
						/ math.max(1, pondJob.claimAtMs - pondJob.createdAtMs)
				elseif mineFactoryActive then
					progressValue = (snapshot.nowMs - fActive.startedAtMs)
						/ math.max(1, fActive.completesAtMs - fActive.startedAtMs)
				end
				if progressValue ~= nil and not showCollect then
					cell.progress.Visible = true
					cell.progressFill.Size = UDim2.fromScale(clamp01(progressValue), 1)
				else
					cell.progress.Visible = false
				end
			end
		end
	end

	self.pulsing = newPulsing

	-- Follow the engine's transition smoothly; animate big jumps (forced season flips).
	self.targetSummer = util.summerAmount(snapshot.season)
	local isFirstUpdate = self.shownSummer == nil
	if not isFirstUpdate and math.abs(self.targetSummer - self.shownSummer) > SEASON_JUMP then
		self.isSeasonAnimating = true
	elseif isFirstUpdate or not self.isSeasonAnimating then
		self.shownSummer = self.targetSummer
	end
	self:renderSeason()

	if
		selected
		and selected.x >= 1
		and selected.x <= PLAYABLE
		and selected.y >= 1
		and selected.y <= PLAYABLE
	then
		self.selection.Visible = true
		self.selection.Position = UDim2.new((selected.x - 1) * CELL, 3, (selected.y - 1) * CELL, 3)
	else
		self.selection.Visible = false
	end
end

return Board
