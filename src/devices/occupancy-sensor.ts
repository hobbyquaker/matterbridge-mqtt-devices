import { MatterbridgeEndpoint, occupancySensor, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

export const occupancySensorDescriptor: DeviceDescriptor = {
  type: 'occupancy-sensor',
  editableKeys: [...COMMON_KEYS, 'stateTopic', 'stateJsonPath', 'payloadOn', 'payloadOff'],
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([occupancySensor, powerSource]);
    ctx.initEp(ep, cfg, 0x8007);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOccupancySensingClusterServer();

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, (p) => {
        const occupied = ctx.parseOnOff(p, ON, OFF, cfg.stateJsonPath) ?? false;
        ctx.log.info(`[${cfg.name}] ? ${occupied ? 'OCCUPIED' : 'CLEAR'}`);
        ctx.setAttr(ep, CID.OccupancySensing, 'occupancy', { occupied });
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? occupancy sensor "${cfg.name}"`);
  },
};
