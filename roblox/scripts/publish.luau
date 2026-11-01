--!nocheck
-- Tests, builds and publishes the game to its Roblox place via Open Cloud, so players get
-- the new version. Run from the roblox/ directory:
--
--   lune run scripts/publish.luau              -- test, build, publish (new servers get it)
--   lune run scripts/publish.luau --restart    -- ...and restart running servers onto it
--   lune run scripts/publish.luau --save-only  -- save a version without publishing it
--   lune run scripts/publish.luau --dry-run    -- test and build only, upload nothing
--
-- Needs ROBLOX_API_KEY, ROBLOX_UNIVERSE_ID and ROBLOX_PLACE_ID, either exported in the
-- shell or in roblox/.env (git-ignored). The first publish is done once from Studio;
-- see "Publishing" in README.md for where to find the ids and which key permissions to add.

local fs = require("@lune/fs")
local net = require("@lune/net")
local process = require("@lune/process")
local serde = require("@lune/serde")
local stdio = require("@lune/stdio")

local loadEnv = require("./lib/env")

local API_URL = process.env.ICEKING_PLACES_API_URL or "https://apis.roblox.com"
local PLACE_FILE = "iceking.rbxl"

local function fail(message)
	stdio.ewrite("error: " .. message .. "\n")
	process.exit(1)
end

local function run(program, args)
	print(`\n> {program} {table.concat(args, " ")}`)
	local result = process.exec(program, args, { stdio = "inherit" })
	if not result.ok then
		fail(`{program} {table.concat(args, " ")} failed (exit code {result.code})`)
	end
end

local function describeHttpError(response, permission)
	local hint = ""
	if response.statusCode == 401 or response.statusCode == 403 then
		hint = `\nCheck the API key: it needs {permission} for this experience, and its IP`
			.. " allowlist must include this machine (or 0.0.0.0/0)."
	elseif response.statusCode == 404 then
		hint =
			"\nCheck ROBLOX_UNIVERSE_ID and ROBLOX_PLACE_ID: the place must belong to the experience."
	end
	return `HTTP {response.statusCode} {response.statusMessage}: {response.body}{hint}`
end

local function requireIds(env)
	for _, key in { "ROBLOX_API_KEY", "ROBLOX_UNIVERSE_ID", "ROBLOX_PLACE_ID" } do
		if not env[key] or env[key] == "" then
			fail(`set {key} (in your shell or roblox/.env); see "Publishing" in README.md`)
		end
	end
	for _, key in { "ROBLOX_UNIVERSE_ID", "ROBLOX_PLACE_ID" } do
		if not string.match(env[key], "^%d+$") then
			fail(`{key} should be a number, got "{env[key]}"`)
		end
	end
end

local function uploadPlace(env, placeBytes, versionType)
	local response = net.request({
		url = `{API_URL}/universes/v1/{env.ROBLOX_UNIVERSE_ID}/places/{env.ROBLOX_PLACE_ID}/versions?versionType={versionType}`,
		method = "POST",
		headers = {
			["x-api-key"] = env.ROBLOX_API_KEY,
			["content-type"] = "application/octet-stream",
		},
		body = placeBytes,
	})
	if not response.ok then
		fail(
			"uploading the place failed: "
				.. describeHttpError(response, 'the "universe-places" Write permission')
		)
	end
	return serde.decode("json", response.body).versionNumber
end

local function restartServers(env)
	local response = net.request({
		url = `{API_URL}/cloud/v2/universes/{env.ROBLOX_UNIVERSE_ID}:restartServers`,
		method = "POST",
		headers = {
			["x-api-key"] = env.ROBLOX_API_KEY,
			["content-type"] = "application/json",
		},
		body = "{}",
	})
	if not response.ok then
		fail(
			"published, but restarting servers failed: "
				.. describeHttpError(response, 'the "universe" Write permission')
				.. "\nRestart them from the Creator Dashboard instead, or leave them to pick up the update as they close."
		)
	end
end

local function main()
	local isDryRun = table.find(process.args, "--dry-run") ~= nil
	local isSaveOnly = table.find(process.args, "--save-only") ~= nil
	local shouldRestart = table.find(process.args, "--restart") ~= nil

	if not fs.isFile("default.project.json") then
		fail("run this from the roblox/ directory: lune run scripts/publish.luau")
	end
	if isSaveOnly and shouldRestart then
		fail("--restart only applies to a published version; drop --save-only or --restart")
	end

	-- Check the config before the slow steps, so a missing id fails fast.
	local env = loadEnv({ "ROBLOX_API_KEY", "ROBLOX_UNIVERSE_ID", "ROBLOX_PLACE_ID" })
	if not isDryRun then
		requireIds(env)
	end

	run("lune", { "run", "tests" })
	run("rojo", { "build", "--output", PLACE_FILE })

	local placeBytes = fs.readFile(PLACE_FILE)
	local sizeKb = math.ceil(#placeBytes / 1024)
	if isDryRun then
		print(`\nDry run: built {PLACE_FILE} ({sizeKb} KB). Nothing was uploaded.`)
		return
	end

	local versionType = if isSaveOnly then "Saved" else "Published"
	print(`\nUploading {PLACE_FILE} ({sizeKb} KB) as a {string.lower(versionType)} version...`)
	local version = uploadPlace(env, placeBytes, versionType)
	if isSaveOnly then
		print(`Saved version {version}. Players won't see it until it is published.`)
		return
	end
	print(`Published version {version}. New servers start on it.`)

	if shouldRestart then
		restartServers(env)
		print("Restarting running servers; players there are moved onto the new version.")
	else
		print(
			"Servers already running keep the old version until they close (use --restart to move them now)."
		)
	end
end

main()
