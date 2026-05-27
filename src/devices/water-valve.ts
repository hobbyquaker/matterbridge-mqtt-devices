import { MatterbridgeEndpoint, powerSource, waterValve } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const waterValveDescriptor: DeviceDescriptor = {
  type: 'water-valve',
  editableKeys: {
    publish: ['topicSetOnOff'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicOpenLevel', 'payloadOpenLevelJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain'],
  },
  applyDefaults(cfg, baseTopic) {
    return { topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set` };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const OPEN = cfg.payloadOn ?? 'ON';
    const CLOSE = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([waterValve, powerSource]);
    ctx.initEp(ep, cfg, 0x8017);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultValveConfigurationAndControlClusterServer();

    ctx.onCmd(ep, 'open', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, OPEN, cfg.retain);
    });
    ctx.onCmd(ep, 'close', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, CLOSE, cfg.retain);
    });

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, OPEN, CLOSE, cfg.payloadOnOffJsonPath);
        if (v !== null) {
          // ValveState: 0 = Closed, 1 = Open
          ctx.setAttr(ep, CID.ValveConfigurationAndControl, 'currentState', v ? 1 : 0);
          ctx.setAttr(ep, CID.ValveConfigurationAndControl, 'targetState', v ? 1 : 0);
        }
      });
    }

    if (cfg.topicOpenLevel) {
      ctx.subscribe(cfg.topicOpenLevel, (p) => {
        const pct = ctx.parseFloatPayload(p, ['level', 'open_level', 'percent'], cfg.payloadOpenLevelJsonPath);
        if (pct !== null) ctx.setAttr(ep, CID.ValveConfigurationAndControl, 'currentLevel', Math.round(Math.max(0, Math.min(100, pct))));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? water valve "${cfg.name}"`);
  },
};
