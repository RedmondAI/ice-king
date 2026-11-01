--!strict
-- Season clock + transition. Ported from packages/game-core/src/systems/seasonSystem.ts.

local Helpers = require(script.Parent.Parent.Helpers)
local Types = require(script.Parent.Parent.Types)

type GameState = Types.GameState
type Season = Types.Season

local SeasonSystem = {}

export type SeasonFlip = { from: Season, to: Season }
export type SeasonUpdateResult = { flips: { SeasonFlip } }

function SeasonSystem.updateSeasonClock(state: GameState, nowMs: number): SeasonUpdateResult
	local flips: { SeasonFlip } = {}
	local season = state.season

	while nowMs >= season.cycleStartMs + season.cycleDurationMs do
		local from = season.logicSeason
		local to = Helpers.oppositeSeason(from)
		season.logicSeason = to
		season.cycleStartMs += season.cycleDurationMs
		season.seasonFlipCount += 1
		season.visualFromSeason = to
		season.visualToSeason = Helpers.oppositeSeason(to)
		table.insert(flips, { from = from, to = to })
	end

	local elapsedInCycle = nowMs - season.cycleStartMs
	local transitionStart = math.max(0, season.cycleDurationMs - season.transitionDurationMs)

	if elapsedInCycle >= transitionStart then
		season.transitionProgress = Helpers.clamp(
			(elapsedInCycle - transitionStart) / math.max(1, season.transitionDurationMs),
			0,
			1
		)
	else
		season.transitionProgress = 0
	end

	season.transitionKeyframeIndex =
		math.min(8, math.max(0, math.round(season.transitionProgress * 8)))
	season.visualFromSeason = season.logicSeason
	season.visualToSeason = Helpers.oppositeSeason(season.logicSeason)

	return { flips = flips }
end

function SeasonSystem.forceSeasonFlip(state: GameState, to: Season): SeasonFlip?
	local season = state.season
	local from = season.logicSeason
	if from == to then
		return nil
	end

	season.logicSeason = to
	season.cycleStartMs = state.nowMs
	season.seasonFlipCount += 1
	season.transitionProgress = 0
	season.transitionKeyframeIndex = 0
	season.visualFromSeason = to
	season.visualToSeason = Helpers.oppositeSeason(to)

	return { from = from, to = to }
end

return SeasonSystem
