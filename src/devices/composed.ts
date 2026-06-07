import type { DeviceTypeDefinition } from 'matterbridge';
import { airQualitySensor, humiditySensor, lightSensor, MatterbridgeEndpoint, powerSource, pressureSensor, rainSensor, soilSensor, temperatureSensor } from 'matterbridge';
import { SoilMeasurementServer } from 'matterbridge/matter/behaviors';

import type { ComposedComponentDef, DeviceContext, DeviceDescriptor, EditableDeviceKey, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

// ── Lux conversion (same as light-sensor.ts) ───────────────────────────────

/**
 * @param {number} lux - Illuminance in lux.
 * @returns {number} Matter IlluminanceMeasurement measuredValue.
 */
function luxToMatter(lux: number): number {
  if (lux <= 0) return 1;
  return Math.min(Math.round(10000 * Math.log10(lux) + 1), 0xfffe);
}

// ── Sensor component definitions ───────────────────────────────────────────

interface SensorComponentImpl {
  readonly def: ComposedComponentDef;
  readonly deviceType: DeviceTypeDefinition;
  createClusters(ep: MatterbridgeEndpoint): void;
  wireMqtt(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig, ctx: DeviceContext): void;
}

const TEMPERATURE_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'temperature',
    label: 'Temperature',
    subscribeKeys: ['topicTemperature', 'payloadTemperatureJsonPath'],
    settingsKeys: [],
  },
  deviceType: temperatureSensor,
  createClusters(ep) {
    ep.createDefaultTemperatureMeasurementClusterServer(2000);
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicTemperature) return;
    ctx.subscribe(cfg.topicTemperature, (p) => {
      const v = ctx.parseFloatPayload(p, ['temperature', 'temp', 'value'], cfg.payloadTemperatureJsonPath);
      if (v !== null && !isNaN(v)) {
        ctx.setAttr(ep, CID.TemperatureMeasurement, 'measuredValue', Math.round(v * 100));
      }
    });
  },
};

const HUMIDITY_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'humidity',
    label: 'Humidity',
    subscribeKeys: ['topicHumidity', 'payloadHumidityJsonPath'],
    settingsKeys: [],
  },
  deviceType: humiditySensor,
  createClusters(ep) {
    ep.createDefaultRelativeHumidityMeasurementClusterServer(5000);
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicHumidity) return;
    ctx.subscribe(cfg.topicHumidity, (p) => {
      const v = ctx.parseFloatPayload(p, ['humidity', 'hum', 'value'], cfg.payloadHumidityJsonPath);
      if (v !== null && !isNaN(v)) {
        ctx.setAttr(ep, CID.RelativeHumidityMeasurement, 'measuredValue', Math.round(v * 100));
      }
    });
  },
};

const ILLUMINANCE_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'illuminance',
    label: 'Light Intensity (lux)',
    subscribeKeys: ['topicIlluminance', 'payloadIlluminanceJsonPath'],
    settingsKeys: [],
  },
  deviceType: lightSensor,
  createClusters(ep) {
    ep.createDefaultIlluminanceMeasurementClusterServer(1, 1, 0xfffe);
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicIlluminance) return;
    ctx.subscribe(cfg.topicIlluminance, (p) => {
      const v = ctx.parseFloatPayload(p, ['illuminance', 'lux', 'light', 'value'], cfg.payloadIlluminanceJsonPath);
      if (v !== null && !isNaN(v)) {
        const mv = luxToMatter(v);
        ctx.setAttr(ep, CID.IlluminanceMeasurement, 'measuredValue', mv);
      }
    });
  },
};

const RAIN_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'rain',
    label: 'Rain Sensor',
    subscribeKeys: ['topicOnOff', 'payloadOnOffJsonPath'],
    settingsKeys: ['payloadOn', 'payloadOff'],
  },
  deviceType: rainSensor,
  createClusters(ep) {
    ep.createDefaultBooleanStateClusterServer(false);
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicOnOff) return;
    const RAINING = cfg.payloadOn ?? 'ON';
    const DRY = cfg.payloadOff ?? 'OFF';
    ctx.subscribe(cfg.topicOnOff, (p) => {
      const v = ctx.parseOnOff(p, RAINING, DRY, cfg.payloadOnOffJsonPath);
      if (v !== null) {
        ctx.setAttr(ep, CID.BooleanState, 'stateValue', v);
      }
    });
  },
};

// ── Air quality component definitions ──────────────────────────────────────

/** Maps common string payloads to AirQuality enum values (0=Unknown … 6=ExtremelyPoor). */
const AIR_QUALITY_MAP: Record<string, number> = {
  'good': 1,
  'fair': 2,
  'moderate': 3,
  'poor': 4,
  'very-poor': 5,
  'very_poor': 5,
  'verypoor': 5,
  'extremely-poor': 6,
  'extremely_poor': 6,
  'extremelypoor': 6,
  'extreme': 6,
};

/**
 * Maps a numeric IAQ index (e.g. Bosch BME680/688, 0–500) to a Matter AirQuality enum value (1–6).
 * 0–50 → Good, 51–100 → Fair, 101–150 → Moderate, 151–200 → Poor, 201–300 → VeryPoor, 301+ → ExtremelyPoor.
 *
 * @param {number} iaq - IAQ index value (0–500).
 * @returns {number} Matter AirQuality enum value (1–6).
 */
function iaqIndexToAirQuality(iaq: number): number {
  if (iaq <= 50) return 1;
  if (iaq <= 100) return 2;
  if (iaq <= 150) return 3;
  if (iaq <= 200) return 4;
  if (iaq <= 300) return 5;
  return 6;
}

const IAQ_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'iaq',
    label: 'Air Quality (IAQ)',
    subscribeKeys: ['topicAirQuality', 'payloadAirQualityJsonPath'],
    settingsKeys: [],
  },
  deviceType: airQualitySensor,
  createClusters(ep) {
    ep.createDefaultAirQualityClusterServer();
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicAirQuality) return;
    ctx.subscribe(cfg.topicAirQuality, (p) => {
      const extracted = ctx.extractPayloadValue(p, cfg.payloadAirQualityJsonPath);
      const str = ctx.toPayloadString(extracted).toLowerCase().trim();
      const asNum = parseFloat(str);
      let quality: number;
      if (!isNaN(asNum)) {
        // Direct Matter enum (0–6) or raw IAQ index (> 6)
        quality = asNum <= 6 ? Math.round(asNum) : iaqIndexToAirQuality(asNum);
      } else {
        quality = AIR_QUALITY_MAP[str] ?? 0;
      }
      ctx.setAttr(ep, CID.AirQuality, 'airQuality', quality);
    });
  },
};

const PM25_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'pm25',
    label: 'PM2.5',
    subscribeKeys: ['topicPm25', 'payloadPm25JsonPath'],
    settingsKeys: [],
  },
  deviceType: airQualitySensor,
  createClusters(ep) {
    ep.createDefaultPm25ConcentrationMeasurementClusterServer();
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicPm25) return;
    ctx.subscribe(cfg.topicPm25, (p) => {
      const v = ctx.parseFloatPayload(p, ['pm25', 'pm2_5', 'value'], cfg.payloadPm25JsonPath);
      if (v !== null && !isNaN(v)) {
        ctx.setAttr(ep, CID.Pm25ConcentrationMeasurement, 'measuredValue', v);
      }
    });
  },
};

const CO2_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'co2',
    label: 'CO₂',
    subscribeKeys: ['topicCo2', 'payloadCo2JsonPath'],
    settingsKeys: [],
  },
  deviceType: airQualitySensor,
  createClusters(ep) {
    ep.createDefaultCarbonDioxideConcentrationMeasurementClusterServer();
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicCo2) return;
    ctx.subscribe(cfg.topicCo2, (p) => {
      const v = ctx.parseFloatPayload(p, ['co2', 'co2_ppm', 'value'], cfg.payloadCo2JsonPath);
      if (v !== null && !isNaN(v)) {
        ctx.setAttr(ep, CID.CarbonDioxideConcentrationMeasurement, 'measuredValue', v);
      }
    });
  },
};

const VOC_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'voc',
    label: 'VOC (TVOC)',
    subscribeKeys: ['topicTvoc', 'payloadTvocJsonPath'],
    settingsKeys: [],
  },
  deviceType: airQualitySensor,
  createClusters(ep) {
    ep.createDefaultTvocMeasurementClusterServer();
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicTvoc) return;
    ctx.subscribe(cfg.topicTvoc, (p) => {
      const v = ctx.parseFloatPayload(p, ['tvoc', 'voc', 'value'], cfg.payloadTvocJsonPath);
      if (v !== null && !isNaN(v)) {
        ctx.setAttr(ep, CID.TvocMeasurement, 'measuredValue', v);
      }
    });
  },
};

const PRESSURE_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'pressure',
    label: 'Pressure (hPa)',
    subscribeKeys: ['topicPressure', 'payloadPressureJsonPath'],
    settingsKeys: [],
  },
  deviceType: pressureSensor,
  createClusters(ep) {
    ep.createDefaultPressureMeasurementClusterServer(0);
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicPressure) return;
    ctx.subscribe(cfg.topicPressure, (p) => {
      const v = ctx.parseFloatPayload(p, ['pressure', 'value'], cfg.payloadPressureJsonPath);
      if (v !== null && !isNaN(v)) {
        ctx.setAttr(ep, CID.PressureMeasurement, 'measuredValue', Math.round(v));
      }
    });
  },
};

const SOIL_MOISTURE_COMPONENT: SensorComponentImpl = {
  def: {
    id: 'soil-moisture',
    label: 'Soil Moisture (%)',
    subscribeKeys: ['topicMoisture', 'payloadMoistureJsonPath'],
    settingsKeys: [],
  },
  deviceType: soilSensor,
  createClusters(ep) {
    ep.behaviors.require(SoilMeasurementServer, {
      soilMoistureMeasuredValue: null,
    });
  },
  wireMqtt(ep, cfg, ctx) {
    if (!cfg.topicMoisture) return;
    ctx.subscribe(cfg.topicMoisture, (p) => {
      const raw = ctx.parseFloatPayload(p, [], cfg.payloadMoistureJsonPath);
      if (raw !== null && !isNaN(raw)) {
        const clamped = Math.max(0, Math.min(100, raw));
        ctx.setAttr(ep, CID.SoilMeasurement, 'soilMoistureMeasuredValue', clamped);
      }
    });
  },
};

/** All available sensor components, in display order. */
export const SENSOR_COMPONENT_IMPLS: readonly SensorComponentImpl[] = [
  TEMPERATURE_COMPONENT,
  HUMIDITY_COMPONENT,
  ILLUMINANCE_COMPONENT,
  RAIN_COMPONENT,
  IAQ_COMPONENT,
  PM25_COMPONENT,
  CO2_COMPONENT,
  VOC_COMPONENT,
  PRESSURE_COMPONENT,
  SOIL_MOISTURE_COMPONENT,
];

/** `ComposedComponentDef` array exported for use in the platform editor UI. */
export const SENSOR_COMPONENT_DEFS: readonly ComposedComponentDef[] = SENSOR_COMPONENT_IMPLS.map((c) => c.def);

// ── Collect all component-specific editable keys ───────────────────────────

const allCompSubscribeKeys: EditableDeviceKey[] = [];
const allCompSettingsKeys: EditableDeviceKey[] = [];
for (const c of SENSOR_COMPONENT_IMPLS) {
  for (const k of c.def.subscribeKeys) {
    if (!allCompSubscribeKeys.includes(k)) allCompSubscribeKeys.push(k);
  }
  for (const k of c.def.settingsKeys) {
    if (!allCompSettingsKeys.includes(k)) allCompSettingsKeys.push(k);
  }
}

// ── Descriptor ─────────────────────────────────────────────────────────────

export const composedDescriptor: DeviceDescriptor = {
  type: 'composed',
  componentDefs: SENSOR_COMPONENT_DEFS,
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, ...allCompSubscribeKeys],
    settings: [...COMMON_SETTINGS_KEYS, 'components', ...allCompSettingsKeys],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const selectedIds = new Set(cfg.components ?? []);
    const active = SENSOR_COMPONENT_IMPLS.filter((c) => selectedIds.has(c.def.id));

    if (active.length === 0) {
      ctx.log.warn(`[${cfg.name}] composed device has no components selected — skipping`);
      return;
    }

    const deviceTypes = [...new Set(active.map((c) => c.deviceType))];
    const ep = new MatterbridgeEndpoint([...deviceTypes, powerSource] as unknown as [DeviceTypeDefinition, ...DeviceTypeDefinition[]]);
    ctx.initEp(ep, cfg, 0x801a);
    ctx.applyConfigUrl(ep, cfg);

    for (const c of active) c.createClusters(ep);
    for (const c of active) c.wireMqtt(ep, cfg, ctx);

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ composed sensor "${cfg.name}" [${active.map((c) => c.def.id).join(', ')}]`);
  },
};
