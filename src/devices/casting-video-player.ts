import { castingVideoPlayer, MatterbridgeEndpoint, powerSource } from 'matterbridge';
import { MatterbridgeContentLauncherServer, MatterbridgeKeypadInputServer, MatterbridgeMediaPlaybackServer } from 'matterbridge/devices';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

/** Maps common string payloads to Matter MediaPlayback.PlaybackState enum values. */
const PLAYBACK_STATE_MAP: Record<string, number> = {
  'playing': 0,
  'paused': 1,
  'stopped': 2,
  'notplaying': 2,
  'not-playing': 2,
  'buffering': 3,
};

export const castingVideoPlayerDescriptor: DeviceDescriptor = {
  type: 'casting-video-player',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicSetPlaybackState', 'topicSetPlaybackCmd', 'topicSetMediaSeek'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicPlaybackState', 'payloadPlaybackJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';

    const ep = new MatterbridgeEndpoint([castingVideoPlayer, powerSource]);
    ctx.initEp(ep, cfg, 0x8035);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.behaviors.require(MatterbridgeMediaPlaybackServer, { currentState: 2 }); // 2 = NotPlaying
    ep.behaviors.require(MatterbridgeKeypadInputServer, {});
    ep.behaviors.require(MatterbridgeContentLauncherServer, {});

    if (cfg.topicSetOnOff) {
      const setTopic = cfg.topicSetOnOff;
      ctx.onCmd(ep, 'on', () => ctx.publish(setTopic, ON, cfg.retain));
      ctx.onCmd(ep, 'off', () => ctx.publish(setTopic, OFF, cfg.retain));
    }

    ctx.onCmd(ep, 'MediaPlayback.play', () => {
      if (cfg.topicSetPlaybackCmd) ctx.publish(cfg.topicSetPlaybackCmd, 'play', cfg.retain);
      if (cfg.topicSetPlaybackState) ctx.publish(cfg.topicSetPlaybackState, 'playing', cfg.retain);
      ctx.setAttr(ep, CID.MediaPlayback, 'currentState', 0);
    });
    ctx.onCmd(ep, 'MediaPlayback.pause', () => {
      if (cfg.topicSetPlaybackCmd) ctx.publish(cfg.topicSetPlaybackCmd, 'pause', cfg.retain);
      if (cfg.topicSetPlaybackState) ctx.publish(cfg.topicSetPlaybackState, 'paused', cfg.retain);
      ctx.setAttr(ep, CID.MediaPlayback, 'currentState', 1);
    });
    ctx.onCmd(ep, 'MediaPlayback.stop', () => {
      if (cfg.topicSetPlaybackCmd) ctx.publish(cfg.topicSetPlaybackCmd, 'stop', cfg.retain);
      if (cfg.topicSetPlaybackState) ctx.publish(cfg.topicSetPlaybackState, 'stopped', cfg.retain);
      ctx.setAttr(ep, CID.MediaPlayback, 'currentState', 2);
    });
    ctx.onCmd(ep, 'MediaPlayback.seek', (data: unknown) => {
      const req = data as { request?: { position?: number } };
      const posMs = req?.request?.position ?? 0;
      if (cfg.topicSetMediaSeek) ctx.publish(cfg.topicSetMediaSeek, String(posMs), cfg.retain);
    });

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.OnOff, 'onOff', v);
      });
    }

    if (cfg.topicPlaybackState) {
      ctx.subscribe(cfg.topicPlaybackState, (p) => {
        const extracted = ctx.extractPayloadValue(p, cfg.payloadPlaybackJsonPath);
        const str = ctx.toPayloadString(extracted).toLowerCase().trim();
        const state = PLAYBACK_STATE_MAP[str] ?? null;
        if (state !== null) ctx.setAttr(ep, CID.MediaPlayback, 'currentState', state);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ casting video player "${cfg.name}"`);
  },
};
