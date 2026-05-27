import { MatterbridgeEndpoint, speakerDevice } from 'matterbridge';

import type { AnyHandler, DeviceContext, DeviceDescriptor, LevelRequest, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

/**
 * Maps a volume percentage (0–100) to a Matter LevelControl currentLevel (1–254).
 *
 * @param {number} pct - Volume percentage (0–100).
 * @returns {number} Matter level (1–254).
 */
function volumePctToLevel(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  return Math.max(1, Math.round((clamped / 100) * 254));
}

/**
 * Maps a Matter LevelControl currentLevel (1–254) to a volume percentage (0–100).
 *
 * @param {number} level - Matter level (1–254).
 * @returns {number} Volume percentage (0–100).
 */
function levelToVolumePct(level: number): number {
  return Math.round((Math.max(1, Math.min(254, level)) / 254) * 100);
}

export const speakerDescriptor: DeviceDescriptor = {
  type: 'speaker',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicSetVolume'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicVolume', 'payloadVolumeJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    // speakerDevice has no powerSource by design
    const ep = new MatterbridgeEndpoint([speakerDevice]);
    ctx.initEp(ep, cfg, 0x8036);
    ctx.applyConfigUrl(ep, cfg);
    ep.createOnOffClusterServer(true); // true = on (not muted)
    ep.createLevelControlClusterServer(128); // default volume 50%

    // on = unmute, off = mute
    if (cfg.topicSetOnOff) {
      const setTopic = cfg.topicSetOnOff;
      ctx.onCmd(ep, 'on', () => ctx.publish(setTopic, ON, cfg.retain));
      ctx.onCmd(ep, 'off', () => ctx.publish(setTopic, OFF, cfg.retain));
    }

    // Matter controller changes volume via moveToLevel
    if (cfg.topicSetVolume) {
      const volTopic = cfg.topicSetVolume;
      ctx.onCmd(ep, 'moveToLevel', ((data: LevelRequest) => {
        ctx.publish(volTopic, String(levelToVolumePct(data.request.level)), cfg.retain);
      }) as AnyHandler);
      ctx.onCmd(ep, 'moveToLevelWithOnOff', ((data: LevelRequest) => {
        ctx.publish(volTopic, String(levelToVolumePct(data.request.level)), cfg.retain);
      }) as AnyHandler);
    }

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.OnOff, 'onOff', v);
      });
    }

    if (cfg.topicVolume) {
      ctx.subscribe(cfg.topicVolume, (p) => {
        const raw = ctx.parseFloatPayload(p, ['volume', 'value'], cfg.payloadVolumeJsonPath);
        if (raw !== null && !isNaN(raw)) {
          const level = volumePctToLevel(raw);
          ctx.setAttr(ep, CID.LevelControl, 'currentLevel', level);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ speaker "${cfg.name}"`);
  },
};
