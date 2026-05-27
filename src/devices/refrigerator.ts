import { MatterbridgeEndpoint, refrigerator } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const refrigeratorDescriptor: DeviceDescriptor = {
  type: 'refrigerator',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicTemperature', 'payloadTemperatureJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicTemperature: cfg.topicTemperature ?? `${baseTopic}/temperature`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([refrigerator]);
    ctx.initEp(ep, cfg, 0x8033);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultTemperatureMeasurementClusterServer();

    if (cfg.topicTemperature) {
      ctx.subscribe(cfg.topicTemperature, (p) => {
        const c = ctx.parseFloatPayload(p, ['temperature', 'temp', 'fridge_temperature'], cfg.payloadTemperatureJsonPath);
        if (c !== null) ctx.setAttr(ep, CID.TemperatureMeasurement, 'measuredValue', Math.round(c * 100));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ refrigerator "${cfg.name}"`);
  },
};
