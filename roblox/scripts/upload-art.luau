--!nocheck
-- Uploads every image in art/ to Roblox via Open Cloud and writes the resulting ids into
-- src/client/ui/Assets.luau. Run from the roblox/ directory:
--
--   lune run scripts/upload-art.luau            -- upload new/changed images, update Assets.luau
--   lune run scripts/upload-art.luau --dry-run  -- show what would be uploaded, change nothing
--
-- Needs ROBLOX_API_KEY plus ROBLOX_USER_ID or ROBLOX_GROUP_ID, either exported in the shell
-- or in roblox/.env (git-ignored). See art/README.md for how to create the key.
--
-- Uploaded ids are recorded in art/uploads.json with each file's hash, so re-running only
-- uploads images that are new or have changed since the last run.

local fs = require("@lune/fs")
local net = require("@lune/net")
local process = require("@lune/process")
local serde = require("@lune/serde")
local stdio = require("@lune/stdio")
local task = require("@lune/task")

local loadEnv = require("./lib/env")

local API_URL = process.env.ICEKING_ASSETS_API_URL or "https://apis.roblox.com/assets/v1"
local ART_DIR = "art"
local LOCKFILE_PATH = "art/uploads.json"
local ASSETS_PATH = "src/client/ui/Assets.luau"

-- Which Assets.luau field each image fills. Each tile type has one season sheet,
-- made by scripts/generate-tiles.py.
local TILE_TYPES = { "GRASS", "FOREST", "POND", "HOUSE", "FACTORY", "TRAIN" }
local STANDALONE_IMAGES = {
	{ field = "logo", path = "ui/ice-king-logo.png" },
	{ field = "splash", path = "ui/splash-ice-king.png" },
}

local CONTENT_TYPES = {
	png = "image/png",
	jpg = "image/jpeg",
	jpeg = "image/jpeg",
	bmp = "image/bmp",
	tga = "image/tga",
}

local POLL_ATTEMPTS = 10

local function fail(message)
	stdio.ewrite("error: " .. message .. "\n")
	process.exit(1)
end

local function tilePath(tileType)
	return `tiles/{string.lower(tileType)}-transition-winter-to-summer-grid.png`
end

local function listImages()
	local images = {}
	for _, tileType in TILE_TYPES do
		table.insert(images, tilePath(tileType))
	end
	for _, image in STANDALONE_IMAGES do
		table.insert(images, image.path)
	end
	return images
end

local function creationContext(env)
	if env.ROBLOX_GROUP_ID and env.ROBLOX_GROUP_ID ~= "" then
		return { creator = { groupId = env.ROBLOX_GROUP_ID } }
	elseif env.ROBLOX_USER_ID and env.ROBLOX_USER_ID ~= "" then
		return { creator = { userId = env.ROBLOX_USER_ID } }
	end
	return nil
end

local function readLockfile()
	if not fs.isFile(LOCKFILE_PATH) then
		return {}
	end
	return serde.decode("json", fs.readFile(LOCKFILE_PATH))
end

local function writeLockfile(lock)
	-- Sorted keys keep the file diff-friendly.
	local paths = {}
	for path in lock do
		table.insert(paths, path)
	end
	table.sort(paths)
	local lines = {}
	for _, path in paths do
		local entry = lock[path]
		table.insert(
			lines,
			`  "{path}": \{ "assetId": "{entry.assetId}", "hash": "{entry.hash}" \}`
		)
	end
	fs.writeFile(LOCKFILE_PATH, "{\n" .. table.concat(lines, ",\n") .. "\n}\n")
end

local function describeHttpError(response)
	local hint = ""
	if response.statusCode == 401 or response.statusCode == 403 then
		hint = "\nCheck the API key: it needs the Assets API with Read + Write, the creator id must"
			.. " match the key's owner, and its IP allowlist must include this machine (or 0.0.0.0/0)."
	end
	return `HTTP {response.statusCode} {response.statusMessage}: {response.body}{hint}`
end

local function request(options)
	for attempt = 1, 5 do
		local response = net.request(options)
		if response.statusCode ~= 429 then
			return response
		end
		local wait = tonumber(response.headers["x-ratelimit-reset"]) or 2 ^ attempt
		print(`  rate limited, waiting {wait}s`)
		task.wait(wait)
	end
	return net.request(options)
end

local function buildMultipart(requestJson, fileName, contentType, fileBytes)
	local boundary = "IceKingBoundary" .. string.sub(serde.hash("sha256", fileBytes), 1, 24)
	local body = table.concat({
		`--{boundary}\r\n`,
		'Content-Disposition: form-data; name="request"\r\n',
		"Content-Type: application/json\r\n\r\n",
		requestJson,
		`\r\n--{boundary}\r\n`,
		`Content-Disposition: form-data; name="fileContent"; filename="{fileName}"\r\n`,
		`Content-Type: {contentType}\r\n\r\n`,
		fileBytes,
		`\r\n--{boundary}--\r\n`,
	})
	return body, `multipart/form-data; boundary={boundary}`
end

local function operationId(operation)
	return operation.operationId or string.match(operation.path or "", "^operations/(.+)$")
end

local function waitForOperation(apiKey, operation)
	local delay = 1
	for _ = 1, POLL_ATTEMPTS do
		if operation.done then
			if not operation.response or not operation.response.assetId then
				fail(
					"upload finished without an asset id: "
						.. serde.encode("json", operation, false)
				)
			end
			return operation.response
		end
		task.wait(delay)
		delay = math.min(delay * 2, 8)
		local response = request({
			url = `{API_URL}/operations/{operationId(operation)}`,
			method = "GET",
			headers = { ["x-api-key"] = apiKey },
		})
		if not response.ok then
			fail("polling upload status failed: " .. describeHttpError(response))
		end
		operation = serde.decode("json", response.body)
	end
	fail("upload did not finish in time; re-run the script to try again")
end

local function uploadImage(apiKey, context, path, fileBytes)
	local fileName = string.match(path, "[^/]+$")
	local extension = string.lower(string.match(fileName, "%.(%w+)$") or "")
	local contentType = CONTENT_TYPES[extension] or fail(`unsupported image type: {path}`)
	local requestJson = serde.encode("json", {
		assetType = "Image",
		displayName = "Ice King " .. string.gsub(fileName, "%.%w+$", ""),
		description = "Ice King game art (" .. path .. ")",
		creationContext = context,
	}, false)
	local body, multipartType = buildMultipart(requestJson, fileName, contentType, fileBytes)
	local response = request({
		url = `{API_URL}/assets`,
		method = "POST",
		headers = { ["x-api-key"] = apiKey, ["content-type"] = multipartType },
		body = body,
	})
	if not response.ok then
		fail(`uploading {path} failed: ` .. describeHttpError(response))
	end
	return waitForOperation(apiKey, serde.decode("json", response.body))
end

local function assetUrl(lock, path)
	local entry = lock[path]
	return entry and `rbxassetid://{entry.assetId}` or ""
end

-- Rewrites the tileSheets table and the logo/splash lines; the rest of the file is kept.
local function renderAssetsFile(source, lock)
	local lines = { "Assets.tileSheets = {" }
	for _, tileType in TILE_TYPES do
		local sheet = assetUrl(lock, tilePath(tileType))
		if sheet ~= "" then
			table.insert(lines, `\t{tileType} = "{sheet}",`)
		else
			table.insert(lines, `\t-- {tileType} = "rbxassetid://0",`)
		end
	end
	table.insert(lines, "}")
	local tileBlock = table.concat(lines, "\n")

	local blockStart, blockEnd = string.find(source, "Assets%.tileSheets = {.-\n}")
	if not blockStart then
		fail(`could not find the Assets.tileSheets table in {ASSETS_PATH}`)
	end
	source = string.sub(source, 1, blockStart - 1) .. tileBlock .. string.sub(source, blockEnd + 1)

	for _, image in STANDALONE_IMAGES do
		local pattern = `\nAssets%.{image.field} = [^\n]*`
		if not string.find(source, pattern) then
			fail(`could not find Assets.{image.field} in {ASSETS_PATH}`)
		end
		local line = `\nAssets.{image.field} = "{assetUrl(lock, image.path)}" -- art/{image.path}`
		source = string.gsub(source, pattern, function()
			return line
		end)
	end
	return source
end

local function main()
	local isDryRun = table.find(process.args, "--dry-run") ~= nil

	if not fs.isDir(ART_DIR) or not fs.isFile(ASSETS_PATH) then
		fail("run this from the roblox/ directory: lune run scripts/upload-art.luau")
	end

	local lock = readLockfile()
	local images = listImages()
	local hasDropped = false
	for path in lock do
		if not table.find(images, path) then
			print(`  dropped    {path}  (no longer used)`)
			lock[path] = nil
			hasDropped = true
		end
	end
	local pending = {}
	for _, path in images do
		local fullPath = `{ART_DIR}/{path}`
		if not fs.isFile(fullPath) then
			fail(`missing image: {fullPath}`)
		end
		local fileBytes = fs.readFile(fullPath)
		local hash = serde.hash("sha256", fileBytes)
		local entry = lock[path]
		if entry and entry.hash == hash then
			print(`  unchanged  {path}  (rbxassetid://{entry.assetId})`)
		else
			print(`  {entry and "changed" or "new"}      {path}`)
			table.insert(pending, { path = path, bytes = fileBytes, hash = hash })
		end
	end

	if isDryRun then
		print(`\nDry run: {#pending} image(s) would be uploaded. Nothing was changed.`)
		return
	end

	if hasDropped then
		writeLockfile(lock)
	end
	if #pending > 0 then
		local env = loadEnv({ "ROBLOX_API_KEY", "ROBLOX_USER_ID", "ROBLOX_GROUP_ID" })
		local apiKey = env.ROBLOX_API_KEY
		local context = creationContext(env)
		if not apiKey or apiKey == "" then
			fail("set ROBLOX_API_KEY (in your shell or roblox/.env); see art/README.md")
		end
		if not context then
			fail(
				"set ROBLOX_USER_ID or ROBLOX_GROUP_ID (in your shell or roblox/.env); see art/README.md"
			)
		end

		print(`\nUploading {#pending} image(s)...`)
		for _, image in pending do
			local asset = uploadImage(apiKey, context, image.path, image.bytes)
			lock[image.path] = { assetId = asset.assetId, hash = image.hash }
			-- Save after each upload so a failure part-way through doesn't lose finished ones.
			writeLockfile(lock)
			local moderation = asset.moderationResult and asset.moderationResult.moderationState
			local isApproved = moderation == "Approved" or moderation == "MODERATION_STATE_APPROVED"
			local note = if moderation and not isApproved
				then `  ({moderation}; it shows once moderation approves it)`
				else ""
			print(`  uploaded   {image.path}  -> rbxassetid://{asset.assetId}{note}`)
		end
	end

	local source = fs.readFile(ASSETS_PATH)
	local updated = renderAssetsFile(source, lock)
	if updated ~= source then
		fs.writeFile(ASSETS_PATH, updated)
		print(`\nUpdated {ASSETS_PATH}.`)
	else
		print(`\n{ASSETS_PATH} is already up to date.`)
	end
end

main()
