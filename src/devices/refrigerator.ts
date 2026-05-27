import { Refrigerator } from 'matterbridge/devices';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const refrigeratorDescriptor: DeviceDescriptor = {
  type: 'refrigerator',
  editableKeys: {
    publish: [],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicTemperature',
      'payloadTemperatureJsonPath',
      'topicTemperatureFreezer',
      'payloadTemperatureFreezerJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicTemperature: cfg.topicTemperature ?? `${baseTopic}/temperature`,
      topicTemperatureFreezer: cfg.topicTemperatureFreezer ?? `${baseTopic}/temperature/freezer`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const serial = cfg.type && cfg.serial ? `${cfg.type}:${cfg.serial}` : (cfg.serial ?? cfg.id ?? 'mqd-000');
    const ep = new Refrigerator(cfg.name, serial);
    ctx.applyConfigUrl(ep, cfg);

    const fridge = ep.addCabinet('Fridge', []);
    const freezer = ep.addCabinet('Freezer', []);

    if (cfg.topicTemperature) {
      ctx.subscribe(cfg.topicTemperature, (p) => {
        const c = ctx.parseFloatPayload(p, ['temperature', 'temp', 'fridge_temperature'], cfg.payloadTemperatureJsonPath);
        if (c !== null) ctx.setAttr(fridge, CID.TemperatureMeasurement, 'measuredValue', Math.round(c * 100));
      });
    }

    if (cfg.topicTemperatureFreezer) {
      ctx.subscribe(cfg.topicTemperatureFreezer, (p) => {
        const c = ctx.parseFloatPayload(p, ['temperature', 'temp', 'freezer_temperature'], cfg.payloadTemperatureFreezerJsonPath);
        if (c !== null) ctx.setAttr(freezer, CID.TemperatureMeasurement, 'measuredValue', Math.round(c * 100));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ refrigerator "${cfg.name}"`);
  },
};
