# <img src="https://matterbridge.io/assets/matterbridge.svg" alt="Matterbridge Logo" width="64px" height="64px">&nbsp;&nbsp;&nbsp;Matterbridge MQTT Devices

[![npm version](https://img.shields.io/npm/v/matterbridge-mqtt-devices.svg)](https://www.npmjs.com/package/matterbridge-mqtt-devices)
[![codecov](https://codecov.io/gh/hobbyquaker/matterbridge-mqtt-devices/branch/main/graph/badge.svg)](https://codecov.io/gh/hobbyquaker/matterbridge-mqtt-devices)

A [Matterbridge](https://github.com/Luligu/matterbridge) plugin that exposes MQTT-connected devices as native Matter accessories. It bridges your existing MQTT smart home devices — sensors, lights, covers, locks, thermostats and more — to any Matter controller such as Apple Home, Google Home, Amazon Alexa or Home Assistant. With this Plugin you have to create devices and assign MQTT topics manually in the Matterbridge Web UI (no config file editing neccessary).

---

## Table of Contents

- [Features](#features)
- [Installation and Usage](#installation-and-usage)
- [Plugin Configuration](#plugin-configuration)
- [Device Types](#device-types)
- [JSON Path Extraction](#json-path-extraction)
- [Availability and Battery](#availability-and-battery)
- [Composed Sensor](#composed-sensor)
- [Device Editor UI](#device-editor-ui)
- [Debug Logging](#debug-logging)

---

## Features

- **55 device types** covering sensors, lights, covers, locks, climate, media, appliances, and more
- **Composed sensor** — combine temperature, humidity, illuminance, rain, pressure, soil moisture, air quality, CO₂, VOC and PM2.5 on a single Matter endpoint
- **JSON Path extraction** — parse values out of structured JSON MQTT payloads without custom code
- **Per-device web editor** — edit MQTT topics and payload mappings live in the Matterbridge UI, no config file editing required
- **Availability tracking** — reflect device online/offline state as Matter reachability
- **Battery reporting** — numeric percentage or full/empty boolean payloads
- **Retain flag** control on published topics
- **Debug logging** — gated behind a config switch to keep logs clean in production

---

## Installation and Usage

Install via the Matterbridge UI or npm:

```bash
npm install -g matterbridge-mqtt-devices
```

Then restart Matterbridge and add/enable the plugin. You can then configure the MQTT broker and add devices in the plugin config. After devices are added and bridge is restarted you can click on the gear icon in the device list to edit the MQTT topic and payload configuration per device. Mind that afterwards another bridge restart is needed.

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

| Type                       | Matter device class      | Description                                               |
| -------------------------- | ------------------------ | --------------------------------------------------------- |
| `air-conditioner`          | Air Conditioner          | HVAC with heating/cooling setpoints, fan speed, on/off    |
| `air-purifier`             | Air Purifier             | Fan speed + on/off                                        |
| `air-quality-sensor`       | Air Quality Sensor       | IAQ index + TVOC + CO₂                                    |
| `basic-video-player`       | Basic Video Player       | On/off + media playback control                           |
| `battery-storage`          | Battery Storage          | Battery energy storage with power and state of charge     |
| `casting-video-player`     | Casting Video Player     | On/off + media playback + content launcher                |
| `closure`                  | Closure                  | Matter 1.5 closure (garage doors, gates)                  |
| `color-temperature-light`  | Color Temperature Light  | White-spectrum light with brightness + color temperature  |
| `composed`                 | Multiple device types    | Combine any subset of sensor measurements on one endpoint |
| `contact-sensor`           | Contact Sensor           | Open/closed state                                         |
| `cooktop`                  | Cooktop                  | On/off + operational state                                |
| `device-energy-management` | Device Energy Management | Matter ESA energy management device                       |
| `dimmable-light`           | Dimmable Light           | Light with brightness control                             |
| `dimmable-mounted-switch`  | Dimmable Mounted Switch  | Hardwired mounted dimmer switch                           |
| `dimmable-outlet`          | Dimmable Plug-in Unit    | Dimmer outlet                                             |
| `dimmable-switch`          | Dimmable Light Switch    | Dimmer switch                                             |
| `dishwasher`               | Dishwasher               | Operational state reporting                               |
| `door-lock`                | Door Lock                | Lock / unlock control                                     |
| `electrical-sensor`        | Electrical Sensor        | Power (W), voltage (V), current (A), energy (Wh)          |
| `evse`                     | EVSE                     | EV charging station with power reporting                  |
| `extended-color-light`     | Extended Color Light     | Full-color light with hue/saturation, color temp and XY   |
| `extractor-hood`           | Extractor Hood           | Fan speed + on/off                                        |
| `fan`                      | Fan                      | Fan speed control                                         |
| `flow-sensor`              | Flow Sensor              | m³/h measurement                                          |
| `generic-switch`           | Generic Switch           | Momentary switch emitting single/double/long press events |
| `heat-pump`                | Heat Pump                | Thermostat + electrical power measurement                 |
| `humidity-sensor`          | Humidity Sensor          | % RH measurement                                          |
| `irrigation-system`        | Irrigation System        | Open/close valve for irrigation                           |
| `laundry-dryer`            | Laundry Dryer            | Operational state reporting                               |
| `laundry-washer`           | Laundry Washer           | Operational state reporting                               |
| `light-sensor`             | Light Sensor             | Lux measurement                                           |
| `microwave-oven`           | Microwave Oven           | Operational state reporting                               |
| `occupancy-sensor`         | Occupancy Sensor         | Occupied/clear state                                      |
| `on-off-light`             | On/Off Light             | Simple on/off light                                       |
| `on-off-mounted-switch`    | On/Off Mounted Switch    | Hardwired mounted switch                                  |
| `on-off-outlet`            | On/Off Plug-in Unit      | Smart plug / outlet                                       |
| `on-off-switch`            | On/Off Light Switch      | Wall switch                                               |
| `oven`                     | Oven                     | Operational state + cavity temperature                    |
| `pressure-sensor`          | Pressure Sensor          | hPa measurement                                           |
| `pump`                     | Pump                     | Pump on/off control                                       |
| `rain-sensor`              | Rain Sensor              | Raining/dry boolean                                       |
| `refrigerator`             | Refrigerator             | Temperature measurement                                   |
| `robotic-vacuum-cleaner`   | Robotic Vacuum Cleaner   | Operational state reporting (running/stopped/paused)      |
| `smoke-co-alarm`           | Smoke/CO Alarm           | Smoke and CO alarm with normal/warning/critical levels    |
| `soil-sensor`              | Soil Sensor              | Soil moisture                                             |
| `solar-power`              | Solar Power              | PV power and exported energy                              |
| `speaker`                  | Speaker                  | Volume control + mute/unmute                              |
| `temperature-sensor`       | Temperature Sensor       | °C measurement                                            |
| `thermostat`               | Thermostat               | Heating/cooling setpoint + local temperature              |
| `water-freeze-detector`    | Water Freeze Detector    | Frozen/normal boolean                                     |
| `water-heater`             | Water Heater             | Heating setpoint + local temperature                      |
| `water-leak-detector`      | Water Leak Detector      | Wet/dry boolean                                           |
| `water-valve`              | Water Valve              | Open/close valve                                          |
| `window-covering`          | Window Covering          | Blinds, shutters or roller shades with position and tilt  |

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

## Composed Sensor

The `composed` device type lets you combine multiple sensor measurements into a **single Matter endpoint**. This is useful for multi-sensor modules (e.g. a Bosch BME688 reporting temperature, humidity, pressure, IAQ and VOC) that you want to expose as one logical device.

### Available components

| Component ID    | Measurement           | Topics                                                          |
| --------------- | --------------------- | --------------------------------------------------------------- |
| `temperature`   | Temperature (°C)      | `topicTemperature`, `payloadTemperatureJsonPath`                |
| `humidity`      | Relative Humidity (%) | `topicHumidity`, `payloadHumidityJsonPath`                      |
| `illuminance`   | Light Intensity (lux) | `topicIlluminance`, `payloadIlluminanceJsonPath`                |
| `rain`          | Rain (boolean)        | `topicOnOff`, `payloadOnOffJsonPath`, `payloadOn`, `payloadOff` |
| `iaq`           | Air Quality Index     | `topicAirQuality`, `payloadAirQualityJsonPath`                  |
| `pm25`          | PM2.5 (µg/m³)         | `topicPm25`, `payloadPm25JsonPath`                              |
| `co2`           | CO₂ (ppm)             | `topicCo2`, `payloadCo2JsonPath`                                |
| `voc`           | TVOC (ppb)            | `topicTvoc`, `payloadTvocJsonPath`                              |
| `pressure`      | Pressure (hPa)        | `topicPressure`, `payloadPressureJsonPath`                      |
| `soil-moisture` | Soil Moisture (%)     | `topicMoisture`, `payloadMoistureJsonPath`                      |

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
