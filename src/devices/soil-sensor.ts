import { MatterbridgeEndpoint, powerSource, soilSensor } from 'matterbridge';
import { SoilMeasurementServer } from 'matterbridge/matter/behaviors';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

/**
 * Soil sensor device type.
 *
 * Uses the SoilMeasurement cluster (0x0430) via the SoilMeasurementServer
 * behavior from matterbridge/devices to report soil moisture percentage (0–100 %).
 */
export const soilSensorDescriptor: DeviceDescriptor = {
  type: 'soil-sensor',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicMoisture', 'payloadMoistureJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([soilSensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8013);
    ctx.applyConfigUrl(ep, cfg);
    ep.behaviors.require(SoilMeasurementServer, {
      soilMoistureMeasuredValue: null,
    });

    if (cfg.topicMoisture) {
      ctx.subscribe(cfg.topicMoisture, (p) => {
        const raw = ctx.parseFloatPayload(p, [], cfg.payloadMoistureJsonPath);
        if (raw !== null && !isNaN(raw)) {
          const clamped = Math.max(0, Math.min(100, raw));
          ctx.setAttr(ep, CID.SoilMeasurement, 'soilMoistureMeasuredValue', clamped);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ soil sensor "${cfg.name}"`);
  },
};
