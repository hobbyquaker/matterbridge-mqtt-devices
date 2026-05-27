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
  applyDefaults(_cfg, _baseTopic) {
    return {};
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

    if (cfg.topicSetOnOff) {
      const setTopic = cfg.topicSetOnOff;
      ctx.onCmd(ep, 'on', () => ctx.publish(setTopic, ON, cfg.retain));
      ctx.onCmd(ep, 'off', () => ctx.publish(setTopic, OFF, cfg.retain));
    }

    if (cfg.topicSetOperationalState) {
      const opTopic = cfg.topicSetOperationalState;
      ctx.onCmd(ep, 'OperationalState.start', () => ctx.publish(opTopic, RUNNING, cfg.retain));
      ctx.onCmd(ep, 'OperationalState.stop', () => ctx.publish(opTopic, STOPPED, cfg.retain));
      ctx.onCmd(ep, 'OperationalState.pause', () => ctx.publish(opTopic, PAUSED, cfg.retain));
      ctx.onCmd(ep, 'OperationalState.resume', () => ctx.publish(opTopic, RUNNING, cfg.retain));
    }

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
