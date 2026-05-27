import { dimmableMountedSwitch, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { AnyHandler, DeviceContext, DeviceDescriptor, LevelRequest, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const dimmableMountedSwitchDescriptor: DeviceDescriptor = {
  type: 'dimmable-mounted-switch',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicMoveToLevel', 'topicMoveToLevelWithOnOff'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicCurrentLevel', 'payloadCurrentLevelJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain', 'brightnessMin', 'brightnessMax'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';
    const { min: briMin, max: briMax } = ctx.getBrightnessRange(cfg);

    const ep = new MatterbridgeEndpoint([dimmableMountedSwitch, powerSource]);
    ctx.initEp(ep, cfg, 0x801d);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultLevelControlClusterServer();

    if (cfg.topicSetOnOff) {
      const setTopic = cfg.topicSetOnOff;
      ctx.onCmd(ep, 'on', () => ctx.publish(setTopic, ON, cfg.retain));
      ctx.onCmd(ep, 'off', () => ctx.publish(setTopic, OFF, cfg.retain));
    }

    if (cfg.topicMoveToLevel) {
      const moveTopic = cfg.topicMoveToLevel;
      ctx.onCmd(ep, 'moveToLevel', ((data: LevelRequest) => {
        ctx.publish(moveTopic, String(ctx.matterLevelToMqttBrightness(data.request.level, briMin, briMax)), cfg.retain);
      }) as AnyHandler);
    }
    if (cfg.topicMoveToLevelWithOnOff || cfg.topicSetOnOff) {
      ctx.onCmd(ep, 'moveToLevelWithOnOff', ((data: LevelRequest) => {
        const lv254 = data.request.level;
        const mqttBrightness = ctx.matterLevelToMqttBrightness(lv254, briMin, briMax);
        if (cfg.topicMoveToLevelWithOnOff) ctx.publish(cfg.topicMoveToLevelWithOnOff, String(mqttBrightness), cfg.retain);
        if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, lv254 > 0 ? ON : OFF, cfg.retain);
      }) as AnyHandler);
    }

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.OnOff, 'onOff', v);
      });
    }
    if (cfg.topicCurrentLevel) {
      ctx.subscribe(cfg.topicCurrentLevel, (p) => {
        const raw = ctx.parseFloatPayload(p, [], cfg.payloadCurrentLevelJsonPath);
        if (raw !== null && !isNaN(raw)) {
          ctx.setAttr(ep, CID.LevelControl, 'currentLevel', ctx.mqttBrightnessToMatterLevel(raw, briMin, briMax));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ dimmable mounted switch "${cfg.name}"`);
  },
};
