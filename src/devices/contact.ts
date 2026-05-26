import { contactSensor, powerSource, MatterbridgeEndpoint } from 'matterbridge';
import { COMMON_KEYS, CID } from './types.js';
import type { DeviceDescriptor, DeviceContext, MqttDeviceConfig } from './types.js';


export const contactDescriptor: DeviceDescriptor = {
  type: 'contact_sensor',
  editableKeys: [
    ...COMMON_KEYS,
    'stateTopic', 'stateJsonPath', 'payloadOpen', 'payloadClosed',
  ],
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const OPEN   = cfg.payloadOpen   ?? 'OPEN';
    const CLOSED = cfg.payloadClosed ?? 'CLOSED';

    const ep = new MatterbridgeEndpoint([contactSensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8004);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultBooleanStateClusterServer(true);

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, (p) => {
        const state = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.stateJsonPath));
        let contact: boolean;
        if      (state === OPEN)   contact = false;
        else if (state === CLOSED) contact = true;
        else { const l = state.toLowerCase(); contact = l === '1' || l === 'true' || l === 'closed'; }
        ctx.log.info(`[${cfg.name}] ← ${contact ? 'CLOSED' : 'OPEN'}`);
        ctx.setAttr(ep, CID.BooleanState, 'stateValue', contact);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id!, ep);
    ctx.log.info(`✓ contact sensor "${cfg.name}"`);
  },
};
