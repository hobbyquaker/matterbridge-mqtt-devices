import { MatterbridgeEndpoint, powerSource, waterLeakDetector } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

export const waterLeakDescriptor: DeviceDescriptor = {
  type: 'water_leak',
  editableKeys: [...COMMON_KEYS, 'stateTopic', 'stateJsonPath', 'payloadOn', 'payloadOff'],
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const LEAK = cfg.payloadOn ?? 'ON';
    const DRY = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([waterLeakDetector, powerSource]);
    ctx.initEp(ep, cfg, 0x8011);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultBooleanStateClusterServer(false);

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, (p) => {
        const v = ctx.parseOnOff(p, LEAK, DRY, cfg.stateJsonPath);
        if (v !== null) {
          ctx.log.info(`[${cfg.name}] ? ${v ? 'LEAK' : 'DRY'}`);
          ctx.setAttr(ep, CID.BooleanState, 'stateValue', v);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? water leak detector "${cfg.name}"`);
  },
};
