import { doorLockDevice, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

/** DoorLock.LockState enum values (Matter spec) */
const LOCK_STATE = { NotFullyLocked: 0, Locked: 1, Unlocked: 2 } as const;

export const doorLockDescriptor: DeviceDescriptor = {
  type: 'door-lock',
  editableKeys: [...COMMON_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicSetOnOff', 'payloadLocked', 'payloadUnlocked', 'retain'],
  applyDefaults(cfg, baseTopic) {
    return { topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set` };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const LOCKED = cfg.payloadLocked ?? 'LOCK';
    const UNLOCKED = cfg.payloadUnlocked ?? 'UNLOCK';

    const ep = new MatterbridgeEndpoint([doorLockDevice, powerSource]);
    ctx.initEp(ep, cfg, 0x800e);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultDoorLockClusterServer();

    ctx.onCmd(ep, 'lockDoor', () => {
      ctx.log.info(`[${cfg.name}] ? LOCK`);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, LOCKED, cfg.retain);
    });
    ctx.onCmd(ep, 'unlockDoor', () => {
      ctx.log.info(`[${cfg.name}] ? UNLOCK`);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, UNLOCKED, cfg.retain);
    });
    ctx.onCmd(ep, 'unlockWithTimeout', () => {
      ctx.log.info(`[${cfg.name}] ? UNLOCK (with timeout)`);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, UNLOCKED, cfg.retain);
    });

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const payload = String(ctx.extractPayloadValue(p, cfg.payloadOnOffJsonPath) ?? p).trim();
        let lockState: number;
        if (payload === LOCKED) {
          lockState = LOCK_STATE.Locked;
        } else if (payload === UNLOCKED) {
          lockState = LOCK_STATE.Unlocked;
        } else {
          lockState = LOCK_STATE.NotFullyLocked;
        }
        ctx.log.info(`[${cfg.name}] ? lockState ${lockState} (payload "${payload}")`);
        ctx.setAttr(ep, CID.DoorLock, 'lockState', lockState);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? door lock "${cfg.name}"`);
  },
};
