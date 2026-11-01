--!nonstrict
-- Context action menu: a floating parchment popup over the board, shown when a tile
-- is selected. Rebuilds its buttons only when the tile's relevant state changes.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local IceKing = ReplicatedStorage:WaitForChild("IceKing")
local Theme = require(IceKing.Theme)

local util = require(script.Parent.util)

local TileMenu = {}
TileMenu.__index = TileMenu

local function findPondJob(snapshot, rx, ry, me)
	for _, job in snapshot.ponds do
		if job.pondX == rx and job.pondY == ry and job.ownerId == me then
			if job.status == "ACTIVE" or job.status == "CLAIMABLE" then
				return job
			end
		end
	end
	return nil
end

local function findFactoryJob(snapshot, rx, ry)
	for _, job in snapshot.factoryJobs do
		if job.x == rx and job.y == ry and (job.status == "ACTIVE" or job.status == "COMPLETE") then
			return job
		end
	end
	return nil
end

function TileMenu.new(parent: Instance, onSubmit: (any) -> ()): any
	local self = setmetatable({}, TileMenu)
	self.onSubmit = onSubmit
	self.signature = nil

	local root = util.create("Frame", {
		Name = "TileMenu",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -8),
		Size = UDim2.new(0, 262, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		BackgroundColor3 = Theme.color("uiPanel"),
		BorderSizePixel = 0,
		Visible = false,
		ZIndex = 25,
		Parent = parent,
	}, {
		util.corner(10),
		util.stroke(Theme.color("uiBorder"), 2),
		util.padding(10),
		util.create(
			"UIListLayout",
			{ Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }
		),
	})
	self.root = root

	self.title = util.create("TextLabel", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 20),
		Font = Enum.Font.GothamBold,
		TextScaled = true,
		TextColor3 = Theme.color("uiBorder"),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = "Actions",
		LayoutOrder = 1,
		Parent = root,
	}, { util.fitText(14) })

	self.buttonArea = util.create("Frame", {
		BackgroundTransparency = 1,
		Size = UDim2.new(1, 0, 0, 0),
		AutomaticSize = Enum.AutomaticSize.Y,
		LayoutOrder = 2,
		Parent = root,
	}, {
		util.create(
			"UIListLayout",
			{ Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }
		),
	})

	return self
end

local function clearChildren(frame)
	for _, child in frame:GetChildren() do
		if child:IsA("GuiObject") then
			child:Destroy()
		end
	end
end

function TileMenu.addButton(self: any, text: string, enabled: boolean, action: any, order: number)
	local button = util.create("TextButton", {
		Size = UDim2.new(1, 0, 0, 30),
		BackgroundColor3 = if enabled then Color3.fromHex("#2E7D46") else Color3.fromHex("#B9AC8C"),
		Font = Enum.Font.GothamMedium,
		TextScaled = true,
		TextColor3 = if enabled then Color3.new(1, 1, 1) else Color3.fromHex("#6E6650"),
		Text = text,
		AutoButtonColor = enabled,
		BorderSizePixel = 0,
		LayoutOrder = order,
		Parent = self.buttonArea,
	}, {
		util.corner(8),
		util.create("UIPadding", {
			PaddingLeft = UDim.new(0, 8),
			PaddingRight = UDim.new(0, 8),
			PaddingTop = UDim.new(0, 6),
			PaddingBottom = UDim.new(0, 6),
		}),
		util.fitText(13),
	})
	if enabled and action then
		button.Activated:Connect(function()
			self.onSubmit(action)
		end)
	end
end

function TileMenu.addNote(self: any, text: string, order: number)
	util.create("TextLabel", {
		Size = UDim2.new(1, 0, 0, 26),
		BackgroundTransparency = 1,
		Font = Enum.Font.Gotham,
		TextSize = 13,
		TextColor3 = Theme.color("bodyText"),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextWrapped = true,
		Text = text,
		LayoutOrder = order,
		Parent = self.buttonArea,
	})
end

function TileMenu.update(self: any, snapshot: any, selected: any)
	local tile = nil
	if selected then
		tile = snapshot.tiles[selected.y * snapshot.width + selected.x + 1]
	end

	if not selected or not tile or tile.type == "VOID" then
		self.root.Visible = false
		self.signature = "none"
		return
	end

	self.root.Visible = true

	local me = snapshot.humanId
	local player = snapshot.players[me]
	local econ = snapshot.economy
	local season = snapshot.season.logicSeason
	local job = findPondJob(snapshot, selected.x, selected.y, me)
	local jobStatus = job and job.status or "NONE"
	local factoryJob = findFactoryJob(snapshot, selected.x, selected.y)
	local factorySig = factoryJob and (factoryJob.status .. ":" .. tostring(factoryJob.kind))
		or "NONE"
	local msUntilSummer = (snapshot.season.cycleStartMs + snapshot.season.cycleDurationMs)
		- snapshot.nowMs
	local harvestBlocked = season == "WINTER"
		and msUntilSummer < (snapshot.pondHarvestDurationMs or 0)

	local signature = table.concat({
		selected.x,
		selected.y,
		tile.type,
		tostring(tile.ownerId),
		tile.currentPrice,
		season,
		player.money,
		player.ice,
		player.blueIce,
		jobStatus,
		factorySig,
		tostring(harvestBlocked),
		tostring(snapshot.trainSales.usedByPlayerId[me] == snapshot.trainSales.currentYear),
		tostring(snapshot.match.ended),
	}, "|")

	if signature == self.signature then
		return
	end
	self.signature = signature
	clearChildren(self.buttonArea)
	self.title.Text = string.format("%s  (%d, %d)", tile.type, selected.x, selected.y)

	if snapshot.match.ended then
		self:addNote("The match has ended.", 1)
		return
	end

	local order = 0
	local function nextOrder()
		order += 1
		return order
	end

	if tile.ownerId == nil then
		self:addButton(
			string.format("Buy Tile ($%dc)", econ.buyUnownedTileCost),
			player.money >= econ.buyUnownedTileCost,
			{ type = "tile.buy", x = selected.x, y = selected.y },
			nextOrder()
		)
	elseif tile.ownerId ~= me then
		local cost = tile.currentPrice + econ.buyoutTransferFee
		self:addButton(
			string.format("Buy Out Rival ($%dc)", cost),
			player.money >= cost,
			{ type = "tile.buyFromPlayer", x = selected.x, y = selected.y },
			nextOrder()
		)
	else
		if tile.type == "GRASS" or tile.type == "FOREST" then
			self:addButton(
				string.format(
					"Build Factory (%d ice + $%dc)",
					econ.buildFactoryIceCost,
					econ.buildFactoryMoneyCost
				),
				player.ice >= econ.buildFactoryIceCost
					and player.money >= econ.buildFactoryMoneyCost,
				{ type = "tile.buildFactory", x = selected.x, y = selected.y },
				nextOrder()
			)
			self:addButton(
				string.format(
					"Build Pond (%d ice + $%dc)",
					econ.buildManMadePondIceCost,
					econ.buildManMadePondMoneyCost
				),
				player.ice >= econ.buildManMadePondIceCost
					and player.money >= econ.buildManMadePondMoneyCost,
				{ type = "tile.buildManMadePond", x = selected.x, y = selected.y },
				nextOrder()
			)
		elseif tile.type == "POND" then
			if jobStatus == "CLAIMABLE" then
				self:addButton(
					"Collect Ice (+1)",
					true,
					{ type = "pond.harvest.claim", pondJobId = job.id },
					nextOrder()
				)
			elseif jobStatus == "ACTIVE" then
				self:addNote("Harvest in progress...", nextOrder())
			elseif season == "WINTER" then
				if harvestBlocked then
					self:addNote("Summer is coming soon - can't harvest now.", nextOrder())
				else
					self:addButton(
						string.format("Harvest Ice ($%dc, 1:00)", econ.pondHarvestCost),
						player.money >= econ.pondHarvestCost,
						{ type = "pond.harvest.start", x = selected.x, y = selected.y },
						nextOrder()
					)
				end
			else
				self:addNote("Ponds can only be harvested in winter.", nextOrder())
			end
		elseif tile.type == "HOUSE" then
			if season == "SUMMER" then
				self:addButton(
					string.format("Sell 1 Ice ($%dc)", econ.houseSellIcePrice),
					player.ice >= 1,
					{
						type = "structure.house.sellIce",
						x = selected.x,
						y = selected.y,
						quantity = 1,
					},
					nextOrder()
				)
				self:addButton(string.format("Sell All Ice (%d)", player.ice), player.ice >= 1, {
					type = "structure.house.sellIce",
					x = selected.x,
					y = selected.y,
					quantity = math.max(1, player.ice),
				}, nextOrder())
				self:addButton(
					string.format("Sell 1 Blue Ice ($%dc)", econ.houseSellBlueIcePrice),
					player.blueIce >= 1,
					{
						type = "structure.house.sellBlueIce",
						x = selected.x,
						y = selected.y,
						quantity = 1,
					},
					nextOrder()
				)
			else
				self:addNote("Ice can only be sold in summer.", nextOrder())
			end
		elseif tile.type == "FACTORY" then
			if factoryJob and factoryJob.status == "COMPLETE" then
				local itemName = if factoryJob.kind == "BLUE_ICE"
					then "Blue Ice"
					else "Refrigerator"
				self:addButton(
					"Collect " .. itemName,
					true,
					{ type = "structure.factory.collect", x = selected.x, y = selected.y },
					nextOrder()
				)
			elseif factoryJob and factoryJob.status == "ACTIVE" then
				self:addNote("Factory is crafting...", nextOrder())
			else
				local canCraft = player.ice >= econ.factoryCraftIceCost
					and player.money >= econ.factoryCraftMoneyCost
				self:addButton(
					string.format(
						"Craft Refrigerator (%d ice + $%dc)",
						econ.factoryCraftIceCost,
						econ.factoryCraftMoneyCost
					),
					canCraft,
					{ type = "structure.factory.craftRefrigerator", x = selected.x, y = selected.y },
					nextOrder()
				)
				self:addButton(
					string.format(
						"Craft Blue Ice (%d ice + $%dc)",
						econ.factoryCraftIceCost,
						econ.factoryCraftMoneyCost
					),
					canCraft,
					{ type = "structure.factory.craftBlueIce", x = selected.x, y = selected.y },
					nextOrder()
				)
			end
		elseif tile.type == "TRAIN" then
			local used = snapshot.trainSales.usedByPlayerId[me] == snapshot.trainSales.currentYear
			self:addButton(
				string.format(
					"Sell Shipment (%d ice -> $%dc)",
					econ.trainShipmentIceCost,
					econ.trainShipmentMoneyGain
				),
				not used and player.ice >= econ.trainShipmentIceCost,
				{ type = "structure.train.sellAnnualShipment", x = selected.x, y = selected.y },
				nextOrder()
			)
			if used then
				self:addNote("Shipment already sold this year.", nextOrder())
			end
		end
	end
end

return TileMenu
