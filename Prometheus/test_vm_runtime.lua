-- Runtime regression smoke test for the VM hot-path optimizations.
-- Run from any working directory with a Lua runtime that can load this project.

local sourcePath = debug.getinfo(1, "S").source:sub(2)
local sourceDir = sourcePath:match("^(.*[/\\])") or ""
package.path = sourceDir .. "?.lua;" .. sourceDir .. "?/init.lua;" .. package.path

local Prometheus = require("prometheus")
Prometheus.Logger.logLevel = Prometheus.Logger.LogLevel.Error

local source = [[
local sum = 0
for i = 1, 100 do
    sum = sum + i
end
local function transform(value)
    return value * 2 + 1
end
return transform(sum)
]]

local loader = loadstring or load
for _, presetName in ipairs({ "Performance", "Standard", "Strong", "Maximum" }) do
    local config = {}
    local usesVm = false
    for key, value in pairs(Prometheus.Presets[presetName]) do
        config[key] = value
    end
    for _, step in ipairs(config.Steps or {}) do
        if step.Name == "Vmify" then
            usesVm = true
            break
        end
    end
    assert(usesVm, presetName .. ": VM virtualization unexpectedly disabled")
    config.Seed = 123456

    local output = Prometheus.Pipeline:fromConfig(config):apply(source, presetName .. "-runtime-test.lua")
    assert(type(output) == "string" and #output > 0, presetName .. ": no output generated")

    local chunk, compileError = loader(output)
    assert(chunk, presetName .. ": output syntax error: " .. tostring(compileError))

    local ok, result = pcall(chunk)
    assert(ok, presetName .. ": runtime error: " .. tostring(result))
    assert(result == 10101, presetName .. ": unexpected result " .. tostring(result))
end

print("VM runtime smoke test passed for Performance, Standard, Strong, and Maximum.")
