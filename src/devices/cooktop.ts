import { cooktop, MatterbridgeEndpoint } from 'matterbridge';

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

export const cooktopDescriptor: DeviceDescriptor = {
  type: 'cooktop',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicSetOperationalState'],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicOnOff',
      'payloadOnOffJsonPath',
      'topicOperationalState',
      'payloadOperationalStateJsonPath',
      'topicCountdownTime',
      'payloadCountdownTimeJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'payloadRunning', 'payloadStopped', 'payloadPaused', 'retain'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set`,
      topicOnOff: cfg.topicOnOff ?? `${baseTopic}/state`,
      topicOperationalState: cfg.topicOperationalState ?? `${baseTopic}/operational-state`,
      topicSetOperationalState: cfg.topicSetOperationalState ?? `${baseTopic}/operational-state/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';
    const RUNNING = cfg.payloadRunning ?? 'running';
    const STOPPED = cfg.payloadStopped ?? 'stopped';
    const PAUSED = cfg.payloadPaused ?? 'paused';

    const ep = new MatterbridgeEndpoint([cooktop]);
    ctx.initEp(ep, cfg, 0x802c);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultOperationalStateClusterServer();

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

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.OnOff, 'onOff', v);
      });
    }

    if (cfg.topicOperationalState) {
      ctx.subscribe(cfg.topicOperationalState, (p) => {
        const state = parseOperationalState(p, cfg, ctx);
        if (state !== null) ctx.setAttr(ep, CID.OperationalState, 'operationalState', state);
      });
    }

    if (cfg.topicCountdownTime) {
      ctx.subscribe(cfg.topicCountdownTime, (p) => {
        const s = ctx.parseFloatPayload(p, ['countdown', 'countdown_time', 'remaining'], cfg.payloadCountdownTimeJsonPath);
        if (s !== null) ctx.setAttr(ep, CID.OperationalState, 'countdownTime', Math.max(0, Math.round(s)));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ cooktop "${cfg.name}"`);
  },
};
