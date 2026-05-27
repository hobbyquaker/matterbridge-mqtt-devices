# <img src="https://matterbridge.io/assets/matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge MQTT Devices

[![npm version](https://img.shields.io/npm/v/matterbridge-mqtt-devices.svg)](https://www.npmjs.com/package/matterbridge-mqtt-devices)
[![npm downloads](https://img.shields.io/npm/dt/matterbridge-mqtt-devices.svg)](https://www.npmjs.com/package/matterbridge-mqtt-devices)
![Node.js CI](https://github.com/hobbyquaker/matterbridge-mqtt-devices/actions/workflows/build.yml/badge.svg)
![CodeQL](https://github.com/hobbyquaker/matterbridge-mqtt-devices/actions/workflows/codeql.yml/badge.svg)
[![codecov](https://codecov.io/gh/hobbyquaker/matterbridge-mqtt-devices/branch/main/graph/badge.svg)](https://codecov.io/gh/hobbyquaker/matterbridge-mqtt-devices)

A [Matterbridge](https://github.com/Luligu/matterbridge) plugin that exposes MQTT-connected devices as native Matter accessories. It bridges your existing MQTT smart home devices — sensors, lights, covers, locks, thermostats and more — to any Matter controller such as Apple Home, Google Home, Amazon Alexa or Home Assistant.

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Plugin Configuration](#plugin-configuration)
- [Device Types](#device-types)
- [Common Device Options](#common-device-options)
- [JSON Path Extraction](#json-path-extraction)
- [Availability and Battery](#availability-and-battery)
- [Device-specific Configuration](#device-specific-configuration)
  - [On/Off Devices](#onoff-devices-on-off-light-on-off-outlet-on-off-switch)
  - [Dimmable Lights and Outlets](#dimmable-lights-and-outlets-dimmable-light-dimmable-outlet)
  - [Color Lights](#color-lights-color-temperature-light-extended-color-light)
  - [Sensors](#sensors-temperature-humidity-pressure-flow-light-rain-soil)
  - [Contact Sensor](#contact-sensor)
  - [Occupancy Sensor](#occupancy-sensor)
  - [Water Leak / Freeze Detectors](#water-leak--freeze-detectors)
  - [Smoke / CO Alarm](#smokeco-alarm)
  - [Air Quality Sensor](#air-quality-sensor)
  - [Cover (Blinds / Shutters)](#cover-blinds--shutters)
  - [Fan](#fan)
  - [Thermostat](#thermostat)
  - [Door Lock](#door-lock)
  - [Water Valve](#water-valve)
  - [Generic Switch](#generic-switch)
  - [Air Conditioner](#air-conditioner)
  - [Air Purifier](#air-purifier)
  - [Electrical Sensor](#electrical-sensor)
  - [Solar Power](#solar-power)
  - [Battery Storage](#battery-storage)
  - [EVSE](#evse)
  - [Heat Pump](#heat-pump)
  - [Water Heater](#water-heater)
  - [Irrigation System](#irrigation-system)
  - [Closure](#closure)
  - [Pump](#pump)
  - [Robotic Vacuum Cleaner](#robotic-vacuum-cleaner)
  - [Appliances](#appliances-dishwasher-laundry-washer-laundry-dryer-microwave-oven-oven)
  - [Cooktop](#cooktop)
  - [Extractor Hood](#extractor-hood)
  - [Refrigerator](#refrigerator)
  - [Composed Sensor](#composed-sensor)
- [Device Editor UI](#device-editor-ui)
- [Debug Logging](#debug-logging)

---

## Features

- **27 device types** covering sensors, lights, covers, locks, climate, and more
- **Composed sensor** — combine temperature, humidity, illuminance, rain, pressure, air quality, CO₂, VOC and PM2.5 on a single Matter endpoint
- **JSON Path extraction** — parse values out of structured JSON MQTT payloads without custom code
- **Per-device web editor** — edit MQTT topics and payload mappings live in the Matterbridge UI, no config file editing required
- **Availability tracking** — reflect device online/offline state as Matter reachability
- **Battery reporting** — numeric percentage or full/empty boolean payloads
- **Retain flag** control on published topics
- **Debug logging** — gated behind a config switch to keep logs clean in production

---

## Installation

Install via the Matterbridge UI or npm:

```bash
npm install -g matterbridge-mqtt-devices
```

Then restart Matterbridge and enable the plugin.

---

## Plugin Configuration

The top-level plugin configuration lives in `matterbridge-mqtt-devices.config.json` (managed by Matterbridge).

| Key        | Type    | Default                 | Description                                                        |
| ---------- | ------- | ----------------------- | ------------------------------------------------------------------ |
| `broker`   | string  | `mqtt://localhost:1883` | MQTT broker URL, e.g. `mqtt://192.168.1.10:1883` or `mqtts://...`  |
| `username` | string  | —                       | MQTT username                                                      |
| `password` | string  | —                       | MQTT password                                                      |
| `debug`    | boolean | `false`                 | Enable verbose debug logging (see [Debug Logging](#debug-logging)) |
| `devices`  | array   | `[]`                    | List of device definitions (see below)                             |

---

## Device Types

| Type                       | Matter device class      | Description                                                  |
| -------------------------- | ------------------------ | ------------------------------------------------------------ |
| `on-off-light`             | On/Off Light             | Simple on/off light                                          |
| `on-off-outlet`            | On/Off Plug-in Unit      | Smart plug / outlet                                          |
| `on-off-switch`            | On/Off Light Switch      | Wall switch                                                  |
| `on-off-mounted-switch`    | On/Off Mounted Switch    | Hardwired mounted switch                                     |
| `dimmable-light`           | Dimmable Light           | Light with brightness control                                |
| `dimmable-outlet`          | Dimmable Plug-in Unit    | Dimmer outlet                                                |
| `dimmable-switch`          | Dimmable Light Switch    | Dimmer switch                                                |
| `dimmable-mounted-switch`  | Dimmable Mounted Switch  | Hardwired mounted dimmer switch                              |
| `color-temperature-light`  | Color Temperature Light  | White-spectrum light with hue/saturation + color temperature |
| `color-temperature-switch` | Color Temperature Switch | Color temperature light switch                               |
| `extended-color-light`     | Extended Color Light     | Full-color light with hue/saturation, color temp and XY      |
| `generic-switch`           | Generic Switch           | Momentary switch emitting single/double/long press events    |
| `door-lock`                | Door Lock                | Lock / unlock control                                        |
| `cover`                    | Window Covering          | Blinds, shutters or roller shades with position and tilt     |
| `fan`                      | Fan                      | Fan speed control                                            |
| `thermostat`               | Thermostat               | Heating/cooling setpoint + local temperature                 |
| `air-conditioner`          | Air Conditioner          | HVAC with heating/cooling setpoints, fan speed, on/off       |
| `air-purifier`             | Air Purifier             | Fan speed + on/off                                           |
| `water-valve`              | Water Valve              | Open/close valve                                             |
| `irrigation-system`        | Irrigation System        | Open/close valve for irrigation                              |
| `closure`                  | Closure                  | Matter 1.5 closure (garage doors, gates)                     |
| `pump`                     | Pump                     | Pump on/off control                                          |
| `robotic-vacuum-cleaner`   | Robotic Vacuum Cleaner   | Operational state reporting (running/stopped/paused)         |
| `electrical-sensor`        | Electrical Sensor        | Power (W), voltage (V), current (A), energy (Wh)             |
| `solar-power`              | Solar Power              | PV power and exported energy                                 |
| `battery-storage`          | Battery Storage          | Battery energy storage with power and state of charge        |
| `evse`                     | EVSE                     | EV charging station with power reporting                     |
| `heat-pump`                | Heat Pump                | Thermostat + electrical power measurement                    |
| `water-heater`             | Water Heater             | Heating setpoint + local temperature                         |
| `device-energy-management` | Device Energy Management | Matter ESA energy management device                          |
| `cooktop`                  | Cooktop                  | On/off + operational state                                   |
| `dishwasher`               | Dishwasher               | Operational state reporting                                  |
| `extractor-hood`           | Extractor Hood           | Fan speed + on/off                                           |
| `laundry-washer`           | Laundry Washer           | Operational state reporting                                  |
| `laundry-dryer`            | Laundry Dryer            | Operational state reporting                                  |
| `microwave-oven`           | Microwave Oven           | Operational state reporting                                  |
| `oven`                     | Oven                     | Operational state + cavity temperature                       |
| `refrigerator`             | Refrigerator             | Temperature measurement                                      |
| `temperature-sensor`       | Temperature Sensor       | °C measurement                                               |
| `humidity-sensor`          | Humidity Sensor          | % RH measurement                                             |
| `pressure-sensor`          | Pressure Sensor          | hPa measurement                                              |
| `flow-sensor`              | Flow Sensor              | m³/h measurement                                             |
| `light-sensor`             | Light Sensor             | Lux measurement                                              |
| `contact-sensor`           | Contact Sensor           | Open/closed state                                            |
| `occupancy-sensor`         | Occupancy Sensor         | Occupied/clear state                                         |
| `rain-sensor`              | Rain Sensor              | Raining/dry boolean                                          |
| `water-leak-detector`      | Water Leak Detector      | Wet/dry boolean                                              |
| `water-freeze-detector`    | Water Freeze Detector    | Frozen/normal boolean                                        |
| `smoke-co-alarm`           | Smoke/CO Alarm           | Smoke and CO alarm with normal/warning/critical levels       |
| `soil-sensor`              | Soil Sensor              | Soil moisture                                                |
| `air-quality-sensor`       | Air Quality Sensor       | IAQ index + TVOC + CO₂                                       |
| `composed`                 | Multiple device types    | Combine any subset of sensor measurements on one endpoint    |

---

## Common Device Options

Every device definition supports these fields:

```jsonc
{
  "name": "Living Room Sensor",     // Display name shown in Matter controllers
  "type": "temperature-sensor",     // Device type (see table above)
  "id": "living-room-sensor",       // Optional stable ID — used for storage; auto-generated if omitted

  // Availability (online/offline → Matter reachability)
  "topicAvailability": "home/sensor/availability",
  "payloadOnline": "online",        // Default: "online"
  "payloadOffline": "offline",      // Default: "offline"

  // Battery
  "topicBattery": "home/sensor/battery",
  "powerSource": "battery",         // "battery" or "mains"

  // Retain flag for published messages
  "retain": false
}
```

---

## JSON Path Extraction

Many devices publish structured JSON payloads. The plugin can extract the relevant value using a dot-notation JSON path on any `payload*JsonPath` option.

**Example payload:**

```json
{ "sensor": { "temperature": 21.5, "humidity": 65 } }
```

**Config:**

```jsonc
{
  "type": "temperature-sensor",
  "topicTemperature": "home/multisensor/state",
  "payloadTemperatureJsonPath": "sensor.temperature"
}
```

**Array access** is also supported:

```json
{ "readings": [{ "temp": 22.1 }] }
```

```jsonc
"payloadTemperatureJsonPath": "readings[0].temp"
```

**JSONPath prefix** (`$.`) is accepted and stripped automatically, so `$.sensor.temperature` and `sensor.temperature` are equivalent.

If no JSON path is configured, the raw payload string is used directly.

For numeric sensors the plugin also tries a set of common key names before falling back to the raw payload, so a payload of just `"21.5"` or `{"temperature": 21.5}` will both work without any path config.

---

## Availability and Battery

### Availability

```jsonc
{
  "topicAvailability": "zigbee2mqtt/sensor/availability",
  "payloadOnline": "online",     // Default: "online"
  "payloadOffline": "offline"    // Default: "offline"
}
```

When the availability payload matches `payloadOffline`, the Matter device is marked unreachable.

### Battery — percentage value

```jsonc
{
  "topicBattery": "home/sensor/battery",
  "batteryValueBased": true,
  "batteryMin": 0,       // Default: 0
  "batteryMax": 100,     // Default: 100
  "payloadBatteryJsonPath": "battery"
}
```

`batteryMin` / `batteryMax` let you remap a custom voltage or raw range to 0–100%.

### Battery — boolean full/empty

```jsonc
{
  "topicBattery": "home/sensor/battery",
  "payloadBatteryFull": "full",    // Default: "full"
  "payloadBatteryEmpty": "empty"   // Default: "empty"
}
```

---

## Device-specific Configuration

### On/Off Devices (`on-off-light`, `on-off-outlet`, `on-off-switch`)

```jsonc
{
  "name": "Kitchen Light",
  "type": "on-off-light",
  "topicOnOff": "home/kitchen/light/state",      // Subscribe: receives current state
  "topicSetOnOff": "home/kitchen/light/set",     // Publish: sends on/off commands
  "payloadOn": "ON",                             // Default: "ON"
  "payloadOff": "OFF",                           // Default: "OFF"
  "payloadOnOffJsonPath": "state"                // Optional: JSON path to the on/off value
}
```

### Dimmable Lights and Outlets (`dimmable-light`, `dimmable-outlet`)

Extends on/off with brightness:

```jsonc
{
  "topicCurrentLevel": "home/light/brightness",        // Subscribe: current brightness
  "payloadCurrentLevelJsonPath": "brightness",
  "topicMoveToLevel": "home/light/brightness/set",     // Publish: set brightness (no on/off)
  "topicMoveToLevelWithOnOff": "home/light/set",       // Publish: set brightness + turn on
  "brightnessMin": 0,                                  // MQTT brightness range (default 0–254)
  "brightnessMax": 254
}
```

Brightness is automatically mapped between the MQTT range and the Matter 0–254 range.

### Color Lights (`color-temperature-light`, `extended-color-light`)

Extends dimmable with color:

```jsonc
{
  "topicColor": "home/light/color",         // Subscribe: receives color state (hue/sat or color temp)
  "payloadColorJsonPath": "",               // Optional JSON path
  "topicSetColor": "home/light/color/set"  // Publish: sends color commands as JSON
}
```

Color state topics expect/send JSON objects:

- Hue + saturation: `{"hue": 180, "saturation": 100}` (hue 0–360, saturation 0–100)
- Color temperature: `{"color_temp": 370}` (mireds)
- XY (extended-color-light only): `{"x": 0.3, "y": 0.3}`

### Sensors (`temperature`, `humidity`, `pressure`, `flow`, `light`, `rain`, `soil`)

```jsonc
{
  "name": "Outdoor Sensor",
  "type": "temperature-sensor",
  "topicTemperature": "home/outdoor/temperature",
  "payloadTemperatureJsonPath": "temp"    // Optional JSON path
}
```

| Type                 | Topic key          | Unit                                     |
| -------------------- | ------------------ | ---------------------------------------- |
| `temperature-sensor` | `topicTemperature` | °C                                       |
| `humidity-sensor`    | `topicHumidity`    | % RH                                     |
| `pressure-sensor`    | `topicPressure`    | hPa                                      |
| `flow-sensor`        | `topicFlow`        | m³/h                                     |
| `light-sensor`       | `topicIlluminance` | lux (auto-converted to Matter log scale) |
| `rain-sensor`        | `topicOnOff`       | boolean (payloadOn/payloadOff)           |
| `soil-sensor`        | `topicMoisture`    | %                                        |

### Contact Sensor

```jsonc
{
  "type": "contact-sensor",
  "topicContactState": "home/door/state",
  "payloadContactStateJsonPath": "contact",  // Optional
  "payloadOn": "true",    // Value that means CLOSED (contact = true)
  "payloadOff": "false"   // Value that means OPEN
}
```

### Occupancy Sensor

```jsonc
{
  "type": "occupancy-sensor",
  "topicOnOff": "home/motion/state",
  "payloadOnOffJsonPath": "occupancy",
  "payloadOn": "true",
  "payloadOff": "false"
}
```

### Water Leak / Freeze Detectors

```jsonc
{
  "type": "water-leak-detector",
  "topicOnOff": "home/sensor/leak",
  "payloadOn": "wet",    // Leak detected
  "payloadOff": "dry"
}
```

```jsonc
{
  "type": "water-freeze-detector",
  "topicOnOff": "home/sensor/freeze",
  "payloadOn": "frozen",
  "payloadOff": "normal"
}
```

### Smoke/CO Alarm

```jsonc
{
  "type": "smoke-co-alarm",
  "topicSmokeAlarm": "home/alarm/smoke",
  "payloadAlarmNormal": "clear",      // Default: "clear"
  "payloadAlarmWarning": "warning",   // Default: "warning"
  "payloadAlarmCritical": "alarm",    // Default: "alarm"
  "topicCo": "home/alarm/co",
  "payloadCoJsonPath": "co_alarm"
}
```

### Air Quality Sensor

```jsonc
{
  "type": "air-quality-sensor",
  "topicAirQuality": "home/air/quality",      // String: "good"/"fair"/"moderate"/"poor"/"very-poor"/"extremely-poor"
  "payloadAirQualityJsonPath": "iaq_level",   // or numeric: 0–6 (Matter enum)
  "topicTvoc": "home/air/tvoc",               // TVOC in ppb
  "payloadTvocJsonPath": "tvoc",
  "topicCo2": "home/air/co2",                 // CO₂ in ppm
  "payloadCo2JsonPath": "co2"
}
```

### Cover (Blinds / Shutters)

```jsonc
{
  "type": "cover",
  "topicCoverState": "home/blind/state",       // Subscribe: "open"/"closed"/"stopped"
  "topicSetCoverState": "home/blind/set",      // Publish: open/close/stop command
  "payloadOpen": "open",
  "payloadClosed": "close",
  "payloadStop": "stop",
  "topicPosition": "home/blind/position",      // Subscribe: current position
  "payloadPositionJsonPath": "position",
  "topicSetPosition": "home/blind/position/set", // Publish: set target position
  "positionMin": 0,                            // MQTT position range (default 0–100)
  "positionMax": 100                           // 0 = closed, 100 = open
}
```

### Fan

```jsonc
{
  "type": "fan",
  "topicOnOff": "home/fan/state",
  "topicSetOnOff": "home/fan/set",
  "topicSpeed": "home/fan/speed",           // Subscribe: current speed
  "payloadSpeedJsonPath": "speed",
  "topicSetSpeed": "home/fan/speed/set",    // Publish: set absolute speed
  "topicSetSpeedStep": "home/fan/step/set", // Publish: increment/decrement step
  "speedMin": 0,
  "speedMax": 100
}
```

### Thermostat

```jsonc
{
  "type": "thermostat",
  "topicLocalTemp": "home/thermostat/current",
  "payloadLocalTempJsonPath": "current_temperature",
  "topicTargetTemp": "home/thermostat/target",
  "payloadTargetTempJsonPath": "target_temperature",
  "topicSetTargetTemp": "home/thermostat/target/set"
}
```

### Door Lock

```jsonc
{
  "type": "door-lock",
  "topicLockState": "home/lock/state",
  "payloadLockStateJsonPath": "state",
  "payloadLocked": "LOCKED",           // Default: "LOCKED"
  "payloadUnlocked": "UNLOCKED",       // Default: "UNLOCKED"
  "payloadNotFullyLocked": "JAMMED",
  "topicSetLockState": "home/lock/set"
}
```

### Water Valve

```jsonc
{
  "type": "water-valve",
  "topicOnOff": "home/valve/state",
  "topicSetOnOff": "home/valve/set",
  "payloadOn": "OPEN",
  "payloadOff": "CLOSED"
}
```

### Generic Switch

Emits single/double/long press events to Matter, useful for battery-powered buttons.

```jsonc
{
  "type": "generic-switch",

  // Option A: single topic with action string
  "topicAction": "home/button/action",
  "payloadActionJsonPath": "action",
  "payloadPress": "single",
  "payloadDouble": "double",
  "payloadLong": "hold",

  // Option B: separate topics per event (payload irrelevant)
  "topicActionPress": "home/button/press",
  "topicActionDouble": "home/button/double",
  "topicActionLong": "home/button/hold"
}
```

### Air Conditioner

Reports local temperature, heating and cooling setpoints, fan speed, and on/off. All temperature values in °C; fan speed in percent (0–100).

```jsonc
{
  "type": "air-conditioner",
  "topicOnOff": "home/ac/state",
  "topicSetOnOff": "home/ac/set",
  "topicLocalTemp": "home/ac/temperature",
  "topicTargetTemp": "home/ac/heating-setpoint",
  "topicSetTargetTemp": "home/ac/heating-setpoint/set",
  "topicCoolingSetpoint": "home/ac/cooling-setpoint",
  "topicSetCoolingSetpoint": "home/ac/cooling-setpoint/set",
  "topicSpeed": "home/ac/speed",
  "topicSetSpeed": "home/ac/speed/set"
}
```

### Air Purifier

Fan speed in percent (0–100) plus on/off.

```jsonc
{
  "type": "air-purifier",
  "topicOnOff": "home/purifier/state",
  "topicSetOnOff": "home/purifier/set",
  "topicSpeed": "home/purifier/speed",
  "topicSetSpeed": "home/purifier/speed/set"
}
```

### Electrical Sensor

Publishes power (W), voltage (V), current (A), and cumulative energy (Wh) to Matter. Values are converted to the Matter units (mW, mV, mA, mWh) automatically.

```jsonc
{
  "type": "electrical-sensor",
  "topicPower": "home/sensor/power",
  "payloadPowerJsonPath": "power",
  "topicVoltage": "home/sensor/voltage",
  "payloadVoltageJsonPath": "voltage",
  "topicCurrent": "home/sensor/current",
  "payloadCurrentJsonPath": "current",
  "topicEnergy": "home/sensor/energy",
  "payloadEnergyJsonPath": "energy"
}
```

### Solar Power

Power (W) and cumulative energy (Wh).

```jsonc
{
  "type": "solar-power",
  "topicPower": "home/solar/power",
  "topicEnergy": "home/solar/energy"
}
```

### Battery Storage

Power (W), cumulative energy (Wh), and state of charge (%) via `topicBattery`.

```jsonc
{
  "type": "battery-storage",
  "topicPower": "home/battery/power",
  "topicEnergy": "home/battery/energy",
  "topicBattery": "home/battery/soc"
}
```

### EVSE

EV charging station. Publishes charging power (W) to Matter. On/off controls charging enable/disable.

```jsonc
{
  "type": "evse",
  "topicOnOff": "home/evse/state",
  "topicSetOnOff": "home/evse/set",
  "topicPower": "home/evse/power",
  "payloadPowerJsonPath": "charging_power"
}
```

### Heat Pump

Heating and cooling setpoints + electrical power measurement. All temperatures in °C.

```jsonc
{
  "type": "heat-pump",
  "topicLocalTemp": "home/heatpump/temperature",
  "topicTargetTemp": "home/heatpump/heating-setpoint",
  "topicSetTargetTemp": "home/heatpump/heating-setpoint/set",
  "topicCoolingSetpoint": "home/heatpump/cooling-setpoint",
  "topicSetCoolingSetpoint": "home/heatpump/cooling-setpoint/set",
  "topicPower": "home/heatpump/power"
}
```

### Water Heater

Heating setpoint + local temperature. Temperature in °C.

```jsonc
{
  "type": "water-heater",
  "topicLocalTemp": "home/boiler/temperature",
  "topicTargetTemp": "home/boiler/target",
  "topicSetTargetTemp": "home/boiler/target/set"
}
```

### Irrigation System

Open/close valve control, state reported via `topicOnOff`.

```jsonc
{
  "type": "irrigation-system",
  "topicOnOff": "home/irrigation/state",
  "topicSetOnOff": "home/irrigation/set",
  "payloadOn": "ON",
  "payloadOff": "OFF"
}
```

### Closure

Matter 1.5 closure device (garage doors, gates). Sends open/close/stop commands to MQTT. The payload for close uses `payloadOff`.

```jsonc
{
  "type": "closure",
  "topicSetOnOff": "home/garage/set",
  "payloadOpen": "OPEN",
  "payloadOff": "CLOSE",
  "payloadStop": "STOP"
}
```

### Pump

Simple on/off pump control.

```jsonc
{
  "type": "pump",
  "topicOnOff": "home/pump/state",
  "topicSetOnOff": "home/pump/set"
}
```

### Robotic Vacuum Cleaner

Reports operational state. The default payloads are `running`, `stopped`, and `paused`; `error` is always mapped to the error state.

```jsonc
{
  "type": "robotic-vacuum-cleaner",
  "topicOperationalState": "home/robot/state",
  "payloadRunning": "cleaning",
  "payloadStopped": "docked",
  "payloadPaused": "paused"
}
```

### Appliances (Dishwasher, Laundry Washer, Laundry Dryer, Microwave Oven, Oven)

All appliances report operational state from MQTT. The same `payloadRunning`, `payloadStopped`, and `payloadPaused` options apply.

```jsonc
{
  "type": "dishwasher",
  "topicOperationalState": "home/dishwasher/state",
  "payloadRunning": "running",
  "payloadStopped": "stopped",
  "payloadPaused": "paused"
}
```

The `oven` type also supports `topicTemperature` for cavity temperature.

### Cooktop

On/off control plus operational state.

```jsonc
{
  "type": "cooktop",
  "topicOnOff": "home/cooktop/state",
  "topicSetOnOff": "home/cooktop/set",
  "topicOperationalState": "home/cooktop/op-state"
}
```

### Extractor Hood

Fan speed in percent (0–100) plus on/off, identical to the Air Purifier configuration.

```jsonc
{
  "type": "extractor-hood",
  "topicOnOff": "home/hood/state",
  "topicSetOnOff": "home/hood/set",
  "topicSpeed": "home/hood/speed",
  "topicSetSpeed": "home/hood/speed/set"
}
```

### Refrigerator

Temperature measurement for the fridge compartment.

```jsonc
{
  "type": "refrigerator",
  "topicTemperature": "home/fridge/temperature"
}
```

---

## Composed Sensor

The `composed` device type lets you combine multiple sensor measurements into a **single Matter endpoint**. This is useful for multi-sensor modules (e.g. a Bosch BME688 reporting temperature, humidity, pressure, IAQ and VOC) that you want to expose as one logical device.

### Available components

| Component ID  | Measurement           | Topics                                                          |
| ------------- | --------------------- | --------------------------------------------------------------- |
| `temperature` | Temperature (°C)      | `topicTemperature`, `payloadTemperatureJsonPath`                |
| `humidity`    | Relative Humidity (%) | `topicHumidity`, `payloadHumidityJsonPath`                      |
| `illuminance` | Light Intensity (lux) | `topicIlluminance`, `payloadIlluminanceJsonPath`                |
| `rain`        | Rain (boolean)        | `topicOnOff`, `payloadOnOffJsonPath`, `payloadOn`, `payloadOff` |
| `iaq`         | Air Quality Index     | `topicAirQuality`, `payloadAirQualityJsonPath`                  |
| `pm25`        | PM2.5 (µg/m³)         | `topicPm25`, `payloadPm25JsonPath`                              |
| `co2`         | CO₂ (ppm)             | `topicCo2`, `payloadCo2JsonPath`                                |
| `voc`         | TVOC (ppb)            | `topicTvoc`, `payloadTvocJsonPath`                              |
| `pressure`    | Pressure (hPa)        | `topicPressure`, `payloadPressureJsonPath`                      |

### IAQ index mapping

When the `iaq` component receives a **numeric IAQ index** (such as those from Bosch BME680/BME688), it is automatically mapped to the Matter AirQuality enum:

| IAQ index | Matter Air Quality |
| --------- | ------------------ |
| 0–50      | Good               |
| 51–100    | Fair               |
| 101–150   | Moderate           |
| 151–200   | Poor               |
| 201–300   | Very Poor          |
| 301+      | Extremely Poor     |

String labels (`"good"`, `"fair"`, `"moderate"`, `"poor"`, `"very-poor"`, `"extremely-poor"`) are also accepted directly.

### Example — BME688 multi-sensor

```jsonc
{
  "name": "Office Air",
  "type": "composed",
  "components": ["temperature", "humidity", "pressure", "iaq", "voc", "co2"],

  "topicTemperature": "home/bme688/temperature",
  "topicHumidity": "home/bme688/humidity",
  "topicPressure": "home/bme688/pressure",
  "topicAirQuality": "home/bme688/iaq",
  "topicTvoc": "home/bme688/tvoc",
  "topicCo2": "home/bme688/co2"
}
```

Or if your sensor publishes everything as one JSON payload:

```jsonc
{
  "name": "Office Air",
  "type": "composed",
  "components": ["temperature", "humidity", "pressure", "iaq"],

  "topicTemperature": "home/bme688/state",
  "payloadTemperatureJsonPath": "temperature",
  "topicHumidity": "home/bme688/state",
  "payloadHumidityJsonPath": "humidity",
  "topicPressure": "home/bme688/state",
  "payloadPressureJsonPath": "pressure",
  "topicAirQuality": "home/bme688/state",
  "payloadAirQualityJsonPath": "iaq"
}
```

Multiple components can share the same topic — each subscribes independently and extracts its own value via JSON path.

### Selecting components in the UI

When editing a composed device in the [Device Editor UI](#device-editor-ui), the active components are controlled via checkboxes. Only topics and settings relevant to the selected components are shown.

---

## Device Editor UI

Every device has a **gear icon** in the Matterbridge device table that opens a built-in web editor for its MQTT topics and payload settings. Changes are persisted immediately to the config file. Restart the plugin to apply runtime changes.

The editor automatically shows only the fields relevant to the selected device type and — for composed devices — only the fields that belong to the active components.

---

## Debug Logging

Enable verbose logging by setting `"debug": true` in the plugin configuration.

When enabled, you will see one debug line per incoming MQTT message:

```text
[MqttDevices] [Office Air] ← home/bme688/temperature 21.5
```

And one line per attribute update sent to Matter:

```text
[MqttDevices] [Office Air] → abc123:12 TemperatureMeasurement.measuredValue 2140 → 2150
```

With `debug: false` (the default), only startup and lifecycle messages appear at info level.

## License

Apache 2.0
