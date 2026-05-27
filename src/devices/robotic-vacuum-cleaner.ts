import { MatterbridgeEndpoint, powerSource, roboticVacuumCleaner } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

/**
 * @param {string} p - Raw MQTT payload string.
 * @param {MqttDeviceConfig} cfg - Device config with optional custom payload values.
 * @param {DeviceContext} ctx - Device context for payload extraction helpers.
 * @returns {number | null} Matter OperationalState enum value, or null if unrecognised.
 */
function parseOperationalState(p: string, cfg: MqttDeviceConfig, ctx: DeviceContext): number | null {
  const RUNNING = cfg.payloadRunning ?? 'running';
  const STOPPED = cfg.payloadStopped ?? 'stopped';
  const PAUSED = cfg.payloadPaused ?? 'paused';
  const raw = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadOperationalStateJsonPath));
  if (raw === RUNNING) return 1;
  if (raw === STOPPED) return 0;
  if (raw === PAUSED) return 2;
  if (raw === 'error') return 3;
  return null;
}

export const roboticVacuumCleanerDescriptor: DeviceDescriptor = {
  type: 'robotic-vacuum-cleaner',
  editableKeys: {
    publish: ['topicSetOperationalState'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOperationalState', 'payloadOperationalStateJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadRunning', 'payloadStopped', 'payloadPaused'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicOperationalState: cfg.topicOperationalState ?? `${baseTopic}/state`,
      topicSetOperationalState: cfg.topicSetOperationalState ?? `${baseTopic}/state/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ep = new MatterbridgeEndpoint([roboticVacuumCleaner, powerSource]);
    ctx.initEp(ep, cfg, 0x8025);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOperationalStateClusterServer();

    const RUNNING = cfg.payloadRunning ?? 'running';
    const STOPPED = cfg.payloadStopped ?? 'stopped';
    const PAUSED = cfg.payloadPaused ?? 'paused';

    ctx.onCmd(ep, 'OperationalState.start', () => {
      if (cfg.topicSetOperationalState) ctx.publish(cfg.topicSetOperationalState, RUNNING, cfg.retain);
    });
    ctx.onCmd(ep, 'OperationalState.stop', () => {
      if (cfg.topicSetOperationalState) ctx.publish(cfg.topicSetOperationalState, STOPPED, cfg.retain);
    });
    ctx.onCmd(ep, 'OperationalState.pause', () => {
      if (cfg.topicSetOperationalState) ctx.publish(cfg.topicSetOperationalState, PAUSED, cfg.retain);
    });
    ctx.onCmd(ep, 'OperationalState.resume', () => {
      if (cfg.topicSetOperationalState) ctx.publish(cfg.topicSetOperationalState, RUNNING, cfg.retain);
    });

    if (cfg.topicOperationalState) {
      ctx.subscribe(cfg.topicOperationalState, (p) => {
        const state = parseOperationalState(p, cfg, ctx);
        if (state !== null) ctx.setAttr(ep, CID.OperationalState, 'operationalState', state);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ robotic vacuum cleaner "${cfg.name}"`);
  },
};
