import { onOffOutlet, powerSource, MatterbridgeEndpoint } from 'matterbridge';
import { COMMON_KEYS, CID } from './types.js';
import type { DeviceDescriptor, DeviceContext, MqttDeviceConfig } from './types.js';


export const outletDescriptor: DeviceDescriptor = {
  type: 'outlet',
  editableKeys: [
    ...COMMON_KEYS,
    'stateTopic', 'stateJsonPath', 'commandTopic', 'payloadOn', 'payloadOff', 'retain',
  ],
  applyDefaults(cfg, baseTopic) {
    return { commandTopic: cfg.commandTopic ?? `${baseTopic}/set` };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON  = cfg.payloadOn  ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([onOffOutlet, powerSource]);
    ctx.initEp(ep, cfg, 0x8000);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();

    ctx.onCmd(ep, 'on', async () => {
      ctx.log.info(`[${cfg.name}] → ON`);
      if (cfg.commandTopic) ctx.publish(cfg.commandTopic, ON, cfg.retain);
    });
    ctx.onCmd(ep, 'off', async () => {
      ctx.log.info(`[${cfg.name}] → OFF`);
      if (cfg.commandTopic) ctx.publish(cfg.commandTopic, OFF, cfg.retain);
    });
    ctx.onCmd(ep, 'toggle', async () => {
      const cur = (ctx.getAttr(ep, CID.OnOff, 'onOff') as boolean) ?? false;
      ctx.log.info(`[${cfg.name}] → TOGGLE (was ${cur ? 'ON' : 'OFF'})`);
      if (cfg.commandTopic) ctx.publish(cfg.commandTopic, cur ? OFF : ON, cfg.retain);
    });

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.stateJsonPath);
        if (v !== null) {
          ctx.log.info(`[${cfg.name}] ← ${v ? 'ON' : 'OFF'}`);
          ctx.setAttr(ep, CID.OnOff, 'onOff', v);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id!, ep);
    ctx.log.info(`✓ outlet "${cfg.name}"`);
  },
};
