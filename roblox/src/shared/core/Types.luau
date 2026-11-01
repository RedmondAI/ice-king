--!strict
-- Shared type definitions for the Ice King game core.
-- Pure data types only (no Roblox APIs), so this module also loads cleanly under
-- the Lune test harness. Returns an empty table; the `export type`s are what
-- other modules consume via `require(...).TypeName` in type position.

export type Season = "SUMMER" | "WINTER"
export type PlayerColor = "BLUE" | "RED"
export type PlayerController = "HUMAN" | "BOT"
export type TileType = "GRASS" | "POND" | "HOUSE" | "FACTORY" | "TRAIN" | "FOREST" | "VOID"
export type TileSource = "MAP_GENERATED" | "PLAYER_BUILT"
export type CraftKind = "REFRIGERATOR" | "BLUE_ICE"
export type PondJobStatus = "ACTIVE" | "CLAIMABLE" | "CLAIMED"
export type FactoryJobStatus = "ACTIVE" | "COMPLETE" | "COLLECTED"

export type Coordinate = { x: number, y: number }

export type TileState = {
	x: number,
	y: number,
	type: TileType,
	source: TileSource,
	ownerId: string?,
	currentPrice: number,
}

export type PlayerState = {
	id: string,
	name: string,
	color: PlayerColor,
	controller: PlayerController,
	money: number,
	ice: number,
	blueIce: number,
	refrigerators: number,
	connected: boolean,
	ready: boolean,
}

-- Actions are kept as a single loose shape; the runtime validator (validate.luau)
-- enforces the per-type field requirements, mirroring the original's zod schema.
export type GameAction = {
	type: string,
	playerId: string,
	x: number?,
	y: number?,
	pondJobId: string?,
	quantity: number?,
}

export type BotPendingAction = {
	id: string,
	executeAtMs: number,
	action: GameAction,
}

export type BotControllerState = {
	playerId: string,
	profile: string,
	nextDecisionAtMs: number,
	pendingAction: BotPendingAction?,
}

export type FactoryCraftJob = {
	id: string,
	ownerId: string,
	x: number,
	y: number,
	kind: CraftKind,
	status: FactoryJobStatus,
	startedAtMs: number,
	completesAtMs: number,
	collectedAtMs: number?,
}

export type PondHarvestJob = {
	id: string,
	pondX: number,
	pondY: number,
	ownerId: string,
	status: PondJobStatus,
	harvestIceYield: number,
	createdAtMs: number,
	claimAtMs: number,
	claimedAtMs: number?,
}

export type TrainSaleState = {
	currentYear: number,
	usedByPlayerId: { [string]: number? },
}

export type SeasonState = {
	logicSeason: Season,
	cycleStartMs: number,
	cycleDurationMs: number,
	transitionDurationMs: number,
	transitionProgress: number,
	transitionKeyframeIndex: number,
	visualFromSeason: Season,
	visualToSeason: Season,
	seasonFlipCount: number,
}

export type MatchState = {
	startedAtMs: number,
	durationMs: number,
	paused: boolean,
	ended: boolean,
	winnerId: string?,
	overtime: boolean,
}

export type CameraState = {
	x: number,
	y: number,
	viewportTiles: number,
}

export type ReconnectState = {
	disconnectedPlayerId: string?,
	pausedAtMs: number?,
	timeoutAtMs: number?,
}

export type DebugEvent = {
	id: string,
	atMs: number,
	type: string,
	payload: { [string]: any },
}

export type GameState = {
	seed: string,
	nowMs: number,
	width: number,
	height: number,
	tiles: { TileState },
	players: { [string]: PlayerState },
	playerOrder: { string },
	teamByPlayerId: { [string]: string }?,
	summerSkipVotesByPlayerId: { [string]: boolean },
	bots: { [string]: BotControllerState },
	season: SeasonState,
	ponds: { PondHarvestJob },
	factoryJobs: { FactoryCraftJob },
	trainSales: TrainSaleState,
	cameraByPlayer: { [string]: CameraState },
	reconnect: ReconnectState,
	selectedTileByPlayer: { [string]: Coordinate? },
	actionLog: { DebugEvent },
	match: MatchState,
}

export type ActionResult = {
	ok: boolean,
	code: string,
	message: string,
	payload: { [string]: any }?,
}

export type NetWorthBreakdown = {
	playerId: string,
	value: number,
	money: number,
	iceValue: number,
	blueIceValue: number,
	refrigeratorValue: number,
	ownedTileValue: number,
}

return {}
