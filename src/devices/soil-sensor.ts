import { MatterbridgeEndpoint, powerSource, soilSensor } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

/**
 * Soil sensor device type.
 *
 * NOTE: The Matter SoilMeasurement cluster (0x0408) has no helper in the
 * current Matterbridge release. As a workaround, this device exposes the
 * RelativeHumidityMeasurement cluster (0x0405) to report soil moisture
 * percentage (0�100 %). Clients that understand the soilSensor device type
 * will see a moisture reading via the humidity measurement attribute.
 */
export const soilSensorDescriptor: DeviceDescriptor = {
  type: 'soil-sensor',
  editableKeys: [...COMMON_KEYS, 'topicOnOff', 'payloadOnOffJsonPath'],
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([soilSensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8013);
    ctx.applyConfigUrl(ep, cfg);
    // Proxy: RelativeHumidityMeasurement represents soil moisture 0�100 %
    ep.createDefaultRelativeHumidityMeasurementClusterServer(0);

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const raw = ctx.parseFloatPayload(p, [], cfg.payloadOnOffJsonPath);
        if (raw !== null && !isNaN(raw)) {
          const clamped = Math.max(0, Math.min(100, raw));
          const mv = Math.round(clamped * 100); // 0�10000 (Matter units)
          ctx.log.info(`[${cfg.name}] ? ${clamped} % soil moisture ? measuredValue ${mv}`);
          ctx.setAttr(ep, CID.RelativeHumidityMeasurement, 'measuredValue', mv);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? soil sensor "${cfg.name}"`);
  },
};
