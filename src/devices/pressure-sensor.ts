import { MatterbridgeEndpoint, powerSource, pressureSensor } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const pressureSensorDescriptor: DeviceDescriptor = {
  type: 'pressure-sensor',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicPressure', 'payloadPressureJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([pressureSensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8014);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultPressureMeasurementClusterServer(0);

    if (cfg.topicPressure) {
      ctx.subscribe(cfg.topicPressure, (p) => {
        // Matter unit: 1/10 kPa = 1 hPa. Assume MQTT value is in hPa.
        const v = ctx.parseFloatPayload(p, ['pressure', 'value'], cfg.payloadPressureJsonPath);
        if (v !== null && !isNaN(v)) {
          ctx.setAttr(ep, CID.PressureMeasurement, 'measuredValue', Math.round(v));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? pressure sensor "${cfg.name}"`);
  },
};
