import { genericSwitch, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const genericSwitchDescriptor: DeviceDescriptor = {
  type: 'generic-switch',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadPress', 'payloadDouble', 'payloadLong'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const PRESS = cfg.payloadPress ?? 'PRESS';
    const DOUBLE = cfg.payloadDouble ?? 'DOUBLE';
    const LONG = cfg.payloadLong ?? 'LONG';

    const ep = new MatterbridgeEndpoint([genericSwitch, powerSource]);
    ctx.initEp(ep, cfg, 0x800d);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultSwitchClusterServer();

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const payload = ctx.extractPayloadValue(p, cfg.payloadOnOffJsonPath) ?? p;
        if (payload === PRESS) {
          ctx.log.info(`[${cfg.name}] ? Single press`);
          void ep.triggerSwitchEvent('Single', ctx.log);
        } else if (payload === DOUBLE) {
          ctx.log.info(`[${cfg.name}] ? Double press`);
          void ep.triggerSwitchEvent('Double', ctx.log);
        } else if (payload === LONG) {
          ctx.log.info(`[${cfg.name}] ? Long press`);
          void ep.triggerSwitchEvent('Long', ctx.log);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? generic switch "${cfg.name}"`);
  },
};
