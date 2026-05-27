import { flowSensor, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const flowSensorDescriptor: DeviceDescriptor = {
  type: 'flow-sensor',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicFlow', 'payloadFlowJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([flowSensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8015);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultFlowMeasurementClusterServer(0);

    if (cfg.topicFlow) {
      ctx.subscribe(cfg.topicFlow, (p) => {
        // Matter unit: 1/10 m³/h. Assume MQTT value is in m³/h.
        const v = ctx.parseFloatPayload(p, ['flow', 'value'], cfg.payloadFlowJsonPath);
        if (v !== null && !isNaN(v)) {
          ctx.setAttr(ep, CID.FlowMeasurement, 'measuredValue', Math.round(v * 10));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? flow sensor "${cfg.name}"`);
  },
};
