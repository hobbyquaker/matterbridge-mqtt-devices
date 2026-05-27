import { MatterbridgeEndpoint, onOffSwitch, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

export const onOffSwitchDescriptor: DeviceDescriptor = {
  type: 'on-off-switch',
  editableKeys: [...COMMON_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicSetOnOff', 'payloadOn', 'payloadOff', 'retain'],
  applyDefaults(cfg, baseTopic) {
    return { topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set` };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([onOffSwitch, powerSource]);
    ctx.initEp(ep, cfg, 0x8001);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();

    ctx.onCmd(ep, 'on', () => {
      ctx.log.info(`[${cfg.name}] ? ON`);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, ON, cfg.retain);
    });
    ctx.onCmd(ep, 'off', () => {
      ctx.log.info(`[${cfg.name}] ? OFF`);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, OFF, cfg.retain);
    });
    ctx.onCmd(ep, 'toggle', () => {
      const cur = (ctx.getAttr(ep, CID.OnOff, 'onOff') as boolean) ?? false;
      ctx.log.info(`[${cfg.name}] ? TOGGLE (was ${cur ? 'ON' : 'OFF'})`);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, cur ? OFF : ON, cfg.retain);
    });

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) {
          ctx.log.info(`[${cfg.name}] ? ${v ? 'ON' : 'OFF'}`);
          ctx.setAttr(ep, CID.OnOff, 'onOff', v);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? switch "${cfg.name}"`);
  },
};
