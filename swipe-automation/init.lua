--------------------------------------------------------------------------------
-- 🔁 Script 1: Toggle Cmd + ↓ Long Hold
--------------------------------------------------------------------------------

local holdTimer = nil
local isHolding = false
local holdKey = {"cmd"}
local holdChar = "down"
local interval = 0.05
local hotkey = {"cmd", "alt"}
local triggerKey = "D"

function stopHold()
    if holdTimer then
        holdTimer:stop()
        holdTimer = nil
    end
    hs.eventtap.event.newKeyEvent(holdKey, holdChar, false):post()
    isHolding = false
    hs.alert.show("⌘↓ Hold Stopped", 0.5)
end

function startHold()
    hs.alert.show("⌘↓ Holding...", 0.5)
    holdTimer = hs.timer.doEvery(interval, function()
        hs.eventtap.event.newKeyEvent(holdKey, holdChar, true):post()
    end)
    isHolding = true
end

function toggleHold()
    if isHolding then
        stopHold()
    else
        startHold()
    end
end

hs.hotkey.bind(hotkey, triggerKey, toggleHold)

--------------------------------------------------------------------------------
-- 🔥 Script 2: Tinder Bot with Real URL Check, Screenshots, Random Delays
--------------------------------------------------------------------------------

--------------------------------------------------------------------------------
-- ⚙️ CONFIGURATION
--------------------------------------------------------------------------------

local durationMinutes = 5
local delayBetweenScreenshotAndSpaceMin = 0.75
local delayBetweenScreenshotAndSpaceMax = 1.0
local delayBetweenScenariosMin = 1.0
local delayBetweenScenariosMax = 3.0
local screenshotBasePath = os.getenv("HOME") .. "/Desktop/tinderBot/"
hs.fs.mkdir(screenshotBasePath)

--------------------------------------------------------------------------------
-- 🧠 STATE TRACKING
--------------------------------------------------------------------------------

local botRunning = false
local endTime = nil

--------------------------------------------------------------------------------
-- 📦 UTILITY FUNCTIONS
--------------------------------------------------------------------------------

local function uuid()
    return hs.host.uuid()
end

local function randomDelay(min, max, callback)
    local delay = math.random() * (max - min) + min
    hs.timer.doAfter(delay, callback)
end

local function takeWindowScreenshot(dir, index)
    local win = hs.window.frontmostWindow()
    if not win then return end

    local filename = string.format("%s/shot_%d.png", dir, index)
    local frame = win:frame()
    local img = win:snapshot()
    img:saveToFile(filename)
    hs.alert.show("📸 Shot " .. index, 0.2)
end

--------------------------------------------------------------------------------
-- 🌐 URL DETECTION
--------------------------------------------------------------------------------

local function getChromeURL()
    local script = [[
        tell application "Google Chrome"
            if (count of windows) = 0 then return ""
            return URL of active tab of front window
        end tell
    ]]
    local ok, result = hs.osascript.applescript(script)
    return ok and result or nil
end

local function getSafariURL()
    local script = [[
        tell application "Safari"
            if (count of windows) = 0 then return ""
            return URL of current tab of front window
        end tell
    ]]
    local ok, result = hs.osascript.applescript(script)
    return ok and result or nil
end

local function getActiveURL()
    local frontApp = hs.application.frontmostApplication():name()
    if frontApp == "Google Chrome" then
        return getChromeURL()
    elseif frontApp == "Safari" then
        return getSafariURL()
    end
    return nil
end

local function isTinderActive()
    local app = hs.application.frontmostApplication()
    if not app then return false end

    local appName = app:name() or ""
    local bundleID = app:bundleID() or ""
    local win = hs.window.frontmostWindow()

    -- ✅ Case 1: Tinder website in browser
    local url = nil
    if appName == "Google Chrome" then
        url = getChromeURL()
    elseif appName == "Safari" then
        url = getSafariURL()
    end
    if url and string.find(url, "tinder%.com") then
        return true
    end

    -- ✅ Case 2: Chrome Web App (Chrome app window)
    if appName == "Google Chrome" and bundleID == "com.google.Chrome" then
        -- Chrome App windows typically have role = AXWindow and no URL
        if win and win:role() == "AXWindow" then
            return true
        end
    end

    -- ❌ All other windows/apps not allowed
    return false
end


--------------------------------------------------------------------------------
-- 🧪 RUN ONE FULL SCENARIO
--------------------------------------------------------------------------------

local function runOneScenario(callback)
    if not botRunning then return end

    local id = uuid()
    local dir = screenshotBasePath .. id
    hs.fs.mkdir(dir)
    hs.alert.show("▶ Scenario: " .. id, 0.3)

    local i = 1

    local function step()
        if not botRunning then return end
        if i > 6 then
            hs.eventtap.keyStroke({}, "left")
            callback()
            return
        end

        takeWindowScreenshot(dir, i)

        randomDelay(delayBetweenScreenshotAndSpaceMin, delayBetweenScreenshotAndSpaceMax, function()
            hs.eventtap.keyStroke({}, "space")

            randomDelay(delayBetweenScreenshotAndSpaceMin, delayBetweenScreenshotAndSpaceMax, function()
                i = i + 1
                step()
            end)
        end)
    end

    step()
end

--------------------------------------------------------------------------------
-- 🔁 MAIN LOOP CONTROLLER
--------------------------------------------------------------------------------

local function runBotLoop()
    if not botRunning then return end
    if hs.timer.secondsSinceEpoch() >= endTime then
        botRunning = false
        hs.alert.show("✅ Tinder Bot Completed")
        return
    end

    runOneScenario(function()
        randomDelay(delayBetweenScenariosMin, delayBetweenScenariosMax, function()
            runBotLoop()
        end)
    end)
end

--------------------------------------------------------------------------------
-- 🔘 TOGGLE START/STOP
--------------------------------------------------------------------------------

local function toggleBot()
    if botRunning then
        botRunning = false
        hs.alert.show("🛑 Bot Stopped")
        return
    end

    if not isTinderActive() then
        hs.alert.show("❌ Tinder is not active.")
        return
    end

    hs.alert.show("🔥 Bot Started")
    botRunning = true
    endTime = hs.timer.secondsSinceEpoch() + (durationMinutes * 60)
    runBotLoop()
end

--------------------------------------------------------------------------------
-- ⌨️ HOTKEY BINDING
--------------------------------------------------------------------------------

hs.hotkey.bind({"cmd", "alt"}, "B", toggleBot)

--------------------------------------------------------------------------------
-- 🏹 Script 3: Infinite Left Arrow Bot with Pauses, HUD, and Human-like Cursor Movement
--------------------------------------------------------------------------------

local arrowClickerRunning = false
local arrowClickerTimer = nil
local hudUpdateTimer = nil
local nextLongPauseAt = nil
local inLongPause = false
local longPauseEndTime = nil
local cursorDriftTimer = nil

--------------------------------------------------------------------------------
-- 🖼️ HUD Setup
--------------------------------------------------------------------------------

local hudCanvas = hs.canvas.new({ x = 20, y = 40, w = 280, h = 80 }):show()
hudCanvas[1] = {
    type = "text",
    text = "",
    textSize = 14,
    textColor = { white = 1, alpha = 1 },
    frame = { x = "0%", y = "0%", w = "100%", h = "100%" },
    textAlignment = "left",
    textFont = "Menlo"
}
hudCanvas:behavior(hs.canvas.windowBehaviors.canJoinAllSpaces)
hudCanvas:level(hs.canvas.windowLevels.floating)

local function updateHUD()
    if not arrowClickerRunning then
        hudCanvas[1].text = ""
        return
    end

    local now = hs.timer.secondsSinceEpoch()
    local status = ""

    if inLongPause then
        local remaining = math.max(0, math.floor(longPauseEndTime - now))
        status = "⏸ Long Pause: " .. remaining .. "s remaining"
    else
        local eta = math.max(0, math.floor(nextLongPauseAt - now))
        status = "⬅️ Clicking | 🕒 Next Pause In: " .. eta .. "s"
    end

    hudCanvas[1].text = status
end

--------------------------------------------------------------------------------
-- 📅 Scheduling Helpers
--------------------------------------------------------------------------------

local function scheduleNextLongPause()
    local now = hs.timer.secondsSinceEpoch()
    local nextPauseIn = math.random(15 * 60, 30 * 60)  -- 15–30 minutes
    nextLongPauseAt = now + nextPauseIn
end

--------------------------------------------------------------------------------
-- 🧭 Human-like Cursor Movement ("Drifting")
--------------------------------------------------------------------------------

local function moveCursorSmoothly(fromPt, toPt, steps, interval)
    local dx = (toPt.x - fromPt.x) / steps
    local dy = (toPt.y - fromPt.y) / steps
    for i = 1, steps do
        hs.timer.doAfter(i * interval, function()
            hs.mouse.absolutePosition({
                x = fromPt.x + dx * i,
                y = fromPt.y + dy * i
            })
        end)
    end
end

local function cursorDriftStep()
    if not arrowClickerRunning or inLongPause then return end

    local origin = hs.mouse.absolutePosition()
    local jitterRadius = 50
    local newPt = {
        x = origin.x + math.random(-jitterRadius, jitterRadius),
        y = origin.y + math.random(-jitterRadius, jitterRadius)
    }

    moveCursorSmoothly(origin, newPt, math.random(10, 20), 0.02)

    local nextDelay = math.random(3, 9) -- seconds
    cursorDriftTimer = hs.timer.doAfter(nextDelay, cursorDriftStep)
end

local function startCursorDrift()
    cursorDriftStep()
end

local function stopCursorDrift()
    if cursorDriftTimer then
        cursorDriftTimer:stop()
        cursorDriftTimer = nil
    end
end

--------------------------------------------------------------------------------
-- 🔁 Main Arrow Clicker Logic
--------------------------------------------------------------------------------

local function startArrowClicker()
    hs.alert.show("⬅️ Auto Left Started")
    arrowClickerRunning = true
    scheduleNextLongPause()
    startCursorDrift()
    hudUpdateTimer = hs.timer.doEvery(1, updateHUD)

    local function clickAndWait()
        if not arrowClickerRunning then return end

        local now = hs.timer.secondsSinceEpoch()

        if not inLongPause and now >= nextLongPauseAt then
            inLongPause = true
            local pauseDuration = math.random(4 * 60, 10 * 60)
            longPauseEndTime = now + pauseDuration
            hs.alert.show("⏸ Long Pause (" .. math.floor(pauseDuration / 60) .. " min)")
            arrowClickerTimer = hs.timer.doAfter(pauseDuration, function()
                inLongPause = false
                scheduleNextLongPause()
                clickAndWait()
            end)
            return
        end

        if not inLongPause then
            hs.eventtap.keyStroke({}, "left")

            -- Quick flash on HUD
            hudCanvas[1].text = "⬅️ Pressed"
            hs.timer.doAfter(0.2, updateHUD)

            local delay = math.random(500, 1500) / 1000
            arrowClickerTimer = hs.timer.doAfter(delay, clickAndWait)
        end
    end

    clickAndWait()
end

local function stopArrowClicker()
    if arrowClickerTimer then arrowClickerTimer:stop() end
    if hudUpdateTimer then hudUpdateTimer:stop() end
    stopCursorDrift()

    arrowClickerRunning = false
    inLongPause = false
    arrowClickerTimer = nil
    hudUpdateTimer = nil
    hudCanvas[1].text = ""
    hs.alert.show("⏹ Left Auto Stopped")
end

local function toggleArrowClicker()
    if arrowClickerRunning then
        stopArrowClicker()
    else
        startArrowClicker()
    end
end

hs.hotkey.bind({"cmd", "alt"}, "L", toggleArrowClicker)
