import { humiditySensor, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const humiditySensorDescriptor: DeviceDescriptor = {
  type: 'humidity-sensor',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([humiditySensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8006);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultRelativeHumidityMeasurementClusterServer(5000);

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const h = ctx.parseFloatPayload(p, ['humidity', 'value'], cfg.payloadOnOffJsonPath);
        if (h !== null && !isNaN(h)) {
          ctx.log.info(`[${cfg.name}] ? ${h}%`);
          ctx.setAttr(ep, CID.RelativeHumidityMeasurement, 'measuredValue', Math.round(h * 100));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? humidity sensor "${cfg.name}"`);
  },
};
