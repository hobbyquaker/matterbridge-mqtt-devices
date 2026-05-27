import { MatterbridgeEndpoint, powerSource, waterFreezeDetector } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const waterFreezeDetectorDescriptor: DeviceDescriptor = {
  type: 'water-freeze-detector',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const FROZEN = cfg.payloadOn ?? 'ON';
    const NORMAL = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([waterFreezeDetector, powerSource]);
    ctx.initEp(ep, cfg, 0x8016);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultBooleanStateClusterServer(false);

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, FROZEN, NORMAL, cfg.payloadOnOffJsonPath);
        if (v !== null) {
          ctx.setAttr(ep, CID.BooleanState, 'stateValue', v);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? water freeze detector "${cfg.name}"`);
  },
};
