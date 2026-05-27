import { deviceEnergyManagement, MatterbridgeEndpoint } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const deviceEnergyManagementDescriptor: DeviceDescriptor = {
  type: 'device-energy-management',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOperationalState', 'payloadOperationalStateJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicOperationalState: cfg.topicOperationalState ?? `${baseTopic}/state`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([deviceEnergyManagement]);
    ctx.initEp(ep, cfg, 0x8027);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultDeviceEnergyManagementClusterServer();
    ep.createDefaultDeviceEnergyManagementModeClusterServer();

    if (cfg.topicOperationalState) {
      ctx.subscribe(cfg.topicOperationalState, (p) => {
        const raw = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadOperationalStateJsonPath)).toLowerCase();
        // esaState: 0 = Offline, 1 = Online, 2 = Fault
        let state: number;
        if (raw === 'running' || raw === 'online' || raw === '1') state = 1;
        else if (raw === 'error' || raw === 'fault' || raw === '2') state = 2;
        else state = 0; // offline / stopped / off
        ctx.setAttr(ep, CID.DeviceEnergyManagement, 'esaState', state);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ device energy management "${cfg.name}"`);
  },
};
