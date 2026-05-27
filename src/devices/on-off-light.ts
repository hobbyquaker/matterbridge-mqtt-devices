import { MatterbridgeEndpoint, onOffLight, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const onOffLightDescriptor: DeviceDescriptor = {
  type: 'on-off-light',
  editableKeys: {
    publish: ['topicSetOnOff'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain'],
  },
  applyDefaults(cfg, baseTopic) {
    return { topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set` };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([onOffLight, powerSource]);
    ctx.initEp(ep, cfg, 0x800b);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();

    ctx.onCmd(ep, 'on', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, ON, cfg.retain);
    });
    ctx.onCmd(ep, 'off', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, OFF, cfg.retain);
    });
    ctx.onCmd(ep, 'toggle', () => {
      const cur = (ctx.getAttr(ep, CID.OnOff, 'onOff') as boolean) ?? false;
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, cur ? OFF : ON, cfg.retain);
    });

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) {
          ctx.setAttr(ep, CID.OnOff, 'onOff', v);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? on/off light "${cfg.name}"`);
  },
};
