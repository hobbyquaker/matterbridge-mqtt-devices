import { genericSwitch, powerSource, MatterbridgeEndpoint } from 'matterbridge';
import { COMMON_KEYS } from './types.js';
import type { DeviceDescriptor, DeviceContext, MqttDeviceConfig } from './types.js';


export const genericSwitchDescriptor: DeviceDescriptor = {
  type: 'generic_switch',
  editableKeys: [
    ...COMMON_KEYS,
    'stateTopic', 'stateJsonPath',
    'payloadPress', 'payloadDouble', 'payloadLong',
  ],
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const PRESS  = cfg.payloadPress  ?? 'PRESS';
    const DOUBLE = cfg.payloadDouble ?? 'DOUBLE';
    const LONG   = cfg.payloadLong   ?? 'LONG';

    const ep = new MatterbridgeEndpoint([genericSwitch, powerSource]);
    ctx.initEp(ep, cfg, 0x800D);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultSwitchClusterServer();

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, async (p) => {
        const payload = ctx.extractPayloadValue(p, cfg.stateJsonPath) ?? p;
        if (payload === PRESS) {
          ctx.log.info(`[${cfg.name}] ← Single press`);
          await ep.triggerSwitchEvent('Single', ctx.log);
        } else if (payload === DOUBLE) {
          ctx.log.info(`[${cfg.name}] ← Double press`);
          await ep.triggerSwitchEvent('Double', ctx.log);
        } else if (payload === LONG) {
          ctx.log.info(`[${cfg.name}] ← Long press`);
          await ep.triggerSwitchEvent('Long', ctx.log);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id!, ep);
    ctx.log.info(`✓ generic switch "${cfg.name}"`);
  },
};
