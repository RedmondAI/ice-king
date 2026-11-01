--!nonstrict
-- Art manifest. Tiles fall back to flat colors + a letter until sheet IDs are filled
-- in below. `lune run scripts/upload-art.luau` uploads the PNGs in art/ and writes the
-- "rbxassetid://<id>" values here (see art/README.md) — no other code changes needed.

local Assets = {}

-- Flat placeholder visuals (summer / winter) + an optional structure letter.
Assets.tileVisual = {
	GRASS = { summer = Color3.fromHex("#4FA65B"), winter = Color3.fromHex("#CFE8FF"), label = "" },
	FOREST = { summer = Color3.fromHex("#2F7D2D"), winter = Color3.fromHex("#8FB79A"), label = "" },
	POND = { summer = Color3.fromHex("#2F8FD6"), winter = Color3.fromHex("#8FE9FF"), label = "" },
	HOUSE = { summer = Color3.fromHex("#E0A75A"), winter = Color3.fromHex("#E7C590"), label = "H" },
	FACTORY = {
		summer = Color3.fromHex("#C27A3E"),
		winter = Color3.fromHex("#B08A6A"),
		label = "Fa",
	},
	TRAIN = { summer = Color3.fromHex("#9C74B0"), winter = Color3.fromHex("#B8A0CC"), label = "T" },
	VOID = { summer = Color3.fromHex("#0C1016"), winter = Color3.fromHex("#0C1016"), label = "" },
}

-- Tile sheets: one image per tile type holding the whole season change as 9 frames of
-- SHEET_FRAME_SIZE px in a 3x3 grid (row-major). Frame 0 is full winter, frame 8 full
-- summer; the board steps through them during the season transition. Any type left out
-- keeps its flat placeholder.
Assets.SHEET_FRAMES = 9
Assets.SHEET_COLUMNS = 3
Assets.SHEET_FRAME_SIZE = 256
Assets.tileSheets = {
	GRASS = "rbxassetid://91038405858540",
	FOREST = "rbxassetid://120120159718998",
	POND = "rbxassetid://124590062330038",
	HOUSE = "rbxassetid://110540256431523",
	FACTORY = "rbxassetid://92063725929912",
	TRAIN = "rbxassetid://96029158938368",
}

-- Standalone images (leave "" to use styled text/background fallbacks).
Assets.logo = "rbxassetid://107990399551398" -- art/ui/ice-king-logo.png
Assets.splash = "rbxassetid://93886878927362" -- art/ui/splash-ice-king.png

return Assets
