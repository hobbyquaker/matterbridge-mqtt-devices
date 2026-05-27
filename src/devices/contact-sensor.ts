import { contactSensor, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const contactSensorDescriptor: DeviceDescriptor = {
  type: 'contact-sensor',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicContactState', 'payloadContactStateJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOpen', 'payloadClosed'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const OPEN = cfg.payloadOpen ?? 'OPEN';
    const CLOSED = cfg.payloadClosed ?? 'CLOSED';

    const ep = new MatterbridgeEndpoint([contactSensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8004);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultBooleanStateClusterServer(true);

    if (cfg.topicContactState) {
      ctx.subscribe(cfg.topicContactState, (p) => {
        const state = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadContactStateJsonPath));
        let contact: boolean;
        if (state === OPEN) contact = false;
        else if (state === CLOSED) contact = true;
        else {
          const l = state.toLowerCase();
          contact = l === '1' || l === 'true' || l === 'closed';
        }
        ctx.setAttr(ep, CID.BooleanState, 'stateValue', contact);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? contact sensor "${cfg.name}"`);
  },
};
