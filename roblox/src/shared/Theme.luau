--!strict
-- Unified theme palette + season-tint math. One source of truth for colors,
-- fixing the original's split between themePalette and the hardcoded
-- renderer/minimap colors. Ported from packages/theme-default/src/index.ts.
--
-- `Theme.color` returns a Color3 and is Roblox-only (not used by the core/tests).

local Theme = {}

Theme.id = "default-snes-vivid"
Theme.displayName = "SNES Vivid Cozy"

Theme.palette = {
	grassBase = "#2ECC40",
	grassHighlight = "#7EFF3F",
	dirtPath = "#C47F17",
	dirtWarmEdge = "#E06D10",
	waterCerulean = "#1E90FF",
	waterTurquoise = "#00D4AA",
	treeShadow = "#1A7A2E",
	treeHighlight = "#76D726",
	trunkDark = "#5C3317",
	trunkHighlight = "#B5651D",
	rockSlate = "#5A6E82",
	rockLavenderShadow = "#9B7FC4",
	shadowPurple = "#3D1F56",
	shadowTeal = "#0D4F4F",
	warmGold = "#FFE066",
	warmPink = "#FFB6C1",
	bodyText = "#3E2723",
	snowBase = "#CFE8FF",
	snowShade = "#A9C6EA",
	iceBase = "#8FE9FF",
	iceCrack = "#4E92D4",
	uiPanel = "#F6E7C8",
	uiBorder = "#6B4F2A",
	ownershipBlue = "#37A6FF",
	ownershipRed = "#F56A6A",
	highlightYellow = "#F8E36B",
}

Theme.SEASON_KEYFRAME_SECONDS = { 0, 7.5, 15, 22.5, 30, 37.5, 45, 52.5, 60 }

function Theme.color(token: string): Color3
	local hex = Theme.palette[token]
	if not hex then
		error("Unknown theme color token: " .. tostring(token))
	end
	return Color3.fromHex(hex)
end

export type SeasonBlend = {
	grassShift: number,
	snowCoverage: number,
	waterFreeze: number,
	treeDesaturation: number,
}

function Theme.seasonTintBlend(from: string, progress: number): SeasonBlend
	local clamped = math.max(0, math.min(1, progress))
	if from == "SUMMER" then
		return {
			grassShift = -0.45 * clamped,
			snowCoverage = clamped,
			waterFreeze = clamped,
			treeDesaturation = clamped * 0.7,
		}
	end
	return {
		grassShift = 0.45 * clamped,
		snowCoverage = 1 - clamped,
		waterFreeze = 1 - clamped,
		treeDesaturation = (1 - clamped) * 0.7,
	}
end

return Theme
