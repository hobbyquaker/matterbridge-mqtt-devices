import { airQualitySensor, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

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

export const airQualitySensorDescriptor: DeviceDescriptor = {
  type: 'air-quality-sensor',
  editableKeys: {
    publish: [],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicAirQuality',
      'payloadAirQualityJsonPath',
      'topicTvoc',
      'payloadTvocJsonPath',
      'topicCo2',
      'payloadCo2JsonPath',
      'topicPm25',
      'payloadPm25JsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([airQualitySensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8019);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultAirQualityClusterServer();
    ep.createDefaultTvocMeasurementClusterServer();
    ep.createDefaultCarbonDioxideConcentrationMeasurementClusterServer();
    ep.createDefaultPm25ConcentrationMeasurementClusterServer();

    if (cfg.topicAirQuality) {
      ctx.subscribe(cfg.topicAirQuality, (p) => {
        const extracted = ctx.extractPayloadValue(p, cfg.payloadAirQualityJsonPath);
        const str = ctx.toPayloadString(extracted).toLowerCase().trim();
        const asNum = parseInt(str, 10);
        const quality = !isNaN(asNum) && asNum >= 0 && asNum <= 6 ? asNum : (AIR_QUALITY_MAP[str] ?? 0);
        ctx.setAttr(ep, CID.AirQuality, 'airQuality', quality);
      });
    }

    if (cfg.topicTvoc) {
      ctx.subscribe(cfg.topicTvoc, (p) => {
        const v = ctx.parseFloatPayload(p, ['tvoc', 'voc', 'value'], cfg.payloadTvocJsonPath);
        if (v !== null && !isNaN(v)) {
          ctx.setAttr(ep, CID.TvocMeasurement, 'measuredValue', v);
        }
      });
    }

    if (cfg.topicCo2) {
      ctx.subscribe(cfg.topicCo2, (p) => {
        const v = ctx.parseFloatPayload(p, ['co2', 'co2_ppm', 'value'], cfg.payloadCo2JsonPath);
        if (v !== null && !isNaN(v)) {
          ctx.setAttr(ep, CID.CarbonDioxideConcentrationMeasurement, 'measuredValue', v);
        }
      });
    }

    if (cfg.topicPm25) {
      ctx.subscribe(cfg.topicPm25, (p) => {
        const v = ctx.parseFloatPayload(p, ['pm25', 'pm2_5', 'pm2.5', 'value'], cfg.payloadPm25JsonPath);
        if (v !== null && !isNaN(v)) {
          ctx.setAttr(ep, CID.Pm25ConcentrationMeasurement, 'measuredValue', v);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? air quality sensor "${cfg.name}"`);
  },
};
