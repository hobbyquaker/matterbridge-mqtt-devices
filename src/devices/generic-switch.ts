import { genericSwitch, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const genericSwitchDescriptor: DeviceDescriptor = {
  type: 'generic-switch',
  editableKeys: {
    publish: [],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicAction',
      'payloadActionJsonPath',
      'topicActionPress',
      'topicActionDouble',
      'topicActionLong',
      'topicActionInitialPress',
      'topicActionLongRelease',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadPress', 'payloadDouble', 'payloadLong', 'payloadInitialPress', 'payloadLongRelease'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const PRESS = cfg.payloadPress ?? 'PRESS';
    const DOUBLE = cfg.payloadDouble ?? 'DOUBLE';
    const LONG = cfg.payloadLong ?? 'LONG';
    const INITIAL_PRESS = cfg.payloadInitialPress ?? 'INITIAL_PRESS';
    const LONG_RELEASE = cfg.payloadLongRelease ?? 'LONG_RELEASE';

    const ep = new MatterbridgeEndpoint([genericSwitch, powerSource]);
    ctx.initEp(ep, cfg, 0x800d);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultSwitchClusterServer();

    if (cfg.topicAction) {
      ctx.subscribe(cfg.topicAction, (p) => {
        const payload = ctx.extractPayloadValue(p, cfg.payloadActionJsonPath) ?? p;
        if (payload === PRESS) {
          void ep.triggerSwitchEvent('Single', ctx.log);
        } else if (payload === DOUBLE) {
          void ep.triggerSwitchEvent('Double', ctx.log);
        } else if (payload === LONG) {
          void ep.triggerSwitchEvent('Long', ctx.log);
        } else if (payload === INITIAL_PRESS) {
          void ep.triggerSwitchEvent('Press', ctx.log);
        } else if (payload === LONG_RELEASE) {
          void ep.triggerSwitchEvent('Release', ctx.log);
        }
      });
    }
    if (cfg.topicActionPress) {
      ctx.subscribe(cfg.topicActionPress, () => {
        void ep.triggerSwitchEvent('Single', ctx.log);
      });
    }
    if (cfg.topicActionDouble) {
      ctx.subscribe(cfg.topicActionDouble, () => {
        void ep.triggerSwitchEvent('Double', ctx.log);
      });
    }
    if (cfg.topicActionLong) {
      ctx.subscribe(cfg.topicActionLong, () => {
        void ep.triggerSwitchEvent('Long', ctx.log);
      });
    }
    if (cfg.topicActionInitialPress) {
      ctx.subscribe(cfg.topicActionInitialPress, () => {
        void ep.triggerSwitchEvent('Press', ctx.log);
      });
    }
    if (cfg.topicActionLongRelease) {
      ctx.subscribe(cfg.topicActionLongRelease, () => {
        void ep.triggerSwitchEvent('Release', ctx.log);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? generic switch "${cfg.name}"`);
  },
};
