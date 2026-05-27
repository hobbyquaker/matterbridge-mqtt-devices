import { lightSensor, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

/**
 * Convert lux to Matter IlluminanceMeasurement measuredValue.
 * measuredValue = 10000 × log10(lux) + 1  (min 1 for 0 lux; max 0xFFFE).
 *
 * @param {number} lux - Illuminance in lux.
 * @returns {number} The Matter measuredValue for the IlluminanceMeasurement cluster.
 */
function luxToMatter(lux: number): number {
  if (lux <= 0) return 1;
  return Math.min(Math.round(10000 * Math.log10(lux) + 1), 0xfffe);
}

export const lightSensorDescriptor: DeviceDescriptor = {
  type: 'light-sensor',
  editableKeys: [...COMMON_KEYS, 'stateTopic', 'stateJsonPath'],
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([lightSensor, powerSource]);
    ctx.initEp(ep, cfg, 0x800f);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultIlluminanceMeasurementClusterServer(1, 1, 0xfffe);

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, (p) => {
        const lux = ctx.parseFloatPayload(p, [], cfg.stateJsonPath);
        if (lux !== null && !isNaN(lux)) {
          const mv = luxToMatter(lux);
          ctx.log.info(`[${cfg.name}] ? ${lux} lux ? measuredValue ${mv}`);
          ctx.setAttr(ep, CID.IlluminanceMeasurement, 'measuredValue', mv);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? light sensor "${cfg.name}"`);
  },
};
