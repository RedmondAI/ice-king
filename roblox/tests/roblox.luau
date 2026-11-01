--!nocheck
-- Minimal Roblox-instance shim for Lune.
--
-- The game-core modules use normal Roblox requires (`require(script.Parent.Foo)`)
-- so they run in Studio with zero build step. To run those same files headless
-- under Lune, this shim mirrors `src/shared` as a tree of fake Folder/ModuleScript
-- instances and loads each module with a per-module environment providing `script`
-- and an instance-aware `require`. Everything else falls through to the real _G.

local fs = require("@lune/fs")
local luau = require("@lune/luau")

local function findSharedDir(): string
	local candidates = {
		"src/shared",
		"roblox/src/shared",
		"../src/shared",
		"../../src/shared",
	}
	for _, path in candidates do
		if fs.isDir(path) then
			return path
		end
	end
	error("roblox shim: could not locate src/shared relative to cwd")
end

local folderMeta
folderMeta = {
	__index = function(self, key)
		local children = rawget(self, "_children")
		local child = children[key]
		if child ~= nil then
			return child
		end
		if key == "FindFirstChild" then
			return function(_, name)
				return children[name]
			end
		end
		if key == "WaitForChild" then
			return function(_, name)
				local found = children[name]
				if not found then
					error("roblox shim: WaitForChild missing child " .. tostring(name))
				end
				return found
			end
		end
		if key == "GetChildren" then
			return function()
				local out = {}
				for _, value in children do
					table.insert(out, value)
				end
				return out
			end
		end
		return nil
	end,
}

local function makeFolder(name, parent, dir)
	return setmetatable({
		Name = name,
		ClassName = "Folder",
		Parent = parent,
		_dir = dir,
		_children = {},
	}, folderMeta)
end

local function makeModule(name, parent, file)
	return {
		Name = name,
		ClassName = "ModuleScript",
		Parent = parent,
		_file = file,
	}
end

local function buildTree(name, parent, dir)
	local folder = makeFolder(name, parent, dir)
	local children = rawget(folder, "_children")
	for _, entry in fs.readDir(dir) do
		local full = dir .. "/" .. entry
		if fs.isDir(full) then
			children[entry] = buildTree(entry, folder, full)
		elseif string.match(entry, "%.luau$") then
			local moduleName = string.gsub(entry, "%.luau$", "")
			children[moduleName] = makeModule(moduleName, folder, full)
		end
	end
	return folder
end

local moduleCache = {}
local loadingNow = {}

local function requireInstance(target)
	if type(target) ~= "table" or rawget(target, "_file") == nil then
		error("roblox shim: require expected a ModuleScript instance")
	end
	local file = rawget(target, "_file")
	if moduleCache[file] ~= nil then
		return moduleCache[file]
	end
	if loadingNow[file] then
		error("roblox shim: cyclic require of " .. file)
	end
	loadingNow[file] = true

	local source = fs.readFile(file)
	local chunk = luau.load(source, {
		debugName = file,
		environment = setmetatable({
			script = target,
			require = requireInstance,
		}, { __index = _G }),
	})
	local result = chunk()

	loadingNow[file] = nil
	moduleCache[file] = result
	return result
end

local rootFolder = nil
local function getRoot()
	if not rootFolder then
		rootFolder = buildTree("IceKing", nil, findSharedDir())
	end
	return rootFolder
end

local shim = {}

-- Return the instance at the given path parts under IceKing, e.g. shim.get("core", "Rng").
function shim.get(...)
	local node = getRoot()
	for _, part in { ... } do
		node = rawget(node, "_children")[part]
		if node == nil then
			error("roblox shim: no child '" .. tostring(part) .. "'")
		end
	end
	return node
end

-- Require a module by path parts, e.g. shim.require("core", "Engine").
function shim.require(...)
	return requireInstance(shim.get(...))
end

return shim
