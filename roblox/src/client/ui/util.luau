--!nonstrict
-- Tiny declarative instance builder used across the UI.

local util = {}

function util.create(className: string, props: { [string]: any }, children: { Instance }?): Instance
	local inst = Instance.new(className)
	local parent = props.Parent
	for key, value in props do
		if key ~= "Parent" then
			inst[key] = value
		end
	end
	if children then
		for _, child in children do
			child.Parent = inst
		end
	end
	inst.Parent = parent
	return inst
end

function util.corner(radius: number?): Instance
	return util.create("UICorner", { CornerRadius = UDim.new(0, radius or 10) })
end

function util.padding(px: number): Instance
	local p = UDim.new(0, px)
	return util.create("UIPadding", {
		PaddingTop = p,
		PaddingBottom = p,
		PaddingLeft = p,
		PaddingRight = p,
	})
end

-- Caps a TextScaled label at its normal size, so text shrinks to fit its box instead of
-- spilling out (some devices, e.g. iPad, render text larger than the box expects).
function util.fitText(maxSize: number): Instance
	return util.create("UITextSizeConstraint", { MaxTextSize = maxSize, MinTextSize = 6 })
end

-- How far the world looks into summer: 0 = full winter, 1 = full summer. Follows the
-- engine's transition window at the end of each season, so it moves smoothly and
-- matches the logic season exactly at the flip.
function util.summerAmount(season: any): number
	local progress = season.transitionProgress or 0
	if season.logicSeason == "WINTER" then
		return progress
	end
	return 1 - progress
end

function util.stroke(color: Color3, thickness: number): Instance
	return util.create("UIStroke", {
		Color = color,
		Thickness = thickness,
		ApplyStrokeMode = Enum.ApplyStrokeMode.Border,
	})
end

return util
