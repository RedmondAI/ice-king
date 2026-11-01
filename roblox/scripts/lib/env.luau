--!nocheck
-- Reads KEY=value lines from roblox/.env (git-ignored). For the listed keys, variables
-- exported in the shell take priority over the file.

local fs = require("@lune/fs")
local process = require("@lune/process")

local function loadEnv(keys: { string })
	local env = {}
	if fs.isFile(".env") then
		for line in string.gmatch(fs.readFile(".env"), "[^\r\n]+") do
			local key, value = string.match(line, "^%s*([%w_]+)%s*=%s*(.-)%s*$")
			if key and string.sub(line, 1, 1) ~= "#" then
				env[key] = string.gsub(value, "^[\"'](.*)[\"']$", "%1")
			end
		end
	end
	for _, key in keys do
		if process.env[key] and process.env[key] ~= "" then
			env[key] = process.env[key]
		end
	end
	return env
end

return loadEnv
