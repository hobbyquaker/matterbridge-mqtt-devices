import { MatterbridgeEndpoint, powerSource, temperatureSensor } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const temperatureSensorDescriptor: DeviceDescriptor = {
  type: 'temperature-sensor',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([temperatureSensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8005);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultTemperatureMeasurementClusterServer(2000);

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const c = ctx.parseFloatPayload(p, ['temperature', 'temp', 'value'], cfg.payloadOnOffJsonPath);
        if (c !== null && !isNaN(c)) {
          ctx.log.info(`[${cfg.name}] ? ${c}�C`);
          ctx.setAttr(ep, CID.TemperatureMeasurement, 'measuredValue', Math.round(c * 100));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? temperature sensor "${cfg.name}"`);
  },
};
