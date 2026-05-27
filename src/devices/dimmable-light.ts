import { dimmableLight, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { AnyHandler, DeviceContext, DeviceDescriptor, LevelRequest, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const dimmableLightDescriptor: DeviceDescriptor = {
  type: 'dimmable-light',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicMoveToLevel', 'topicMoveToLevelWithOnOff'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicCurrentLevel', 'payloadCurrentLevelJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain', 'brightnessMin', 'brightnessMax'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set`,
      topicCurrentLevel: cfg.topicCurrentLevel ?? `${baseTopic}/level`,
      topicMoveToLevel: cfg.topicMoveToLevel ?? `${baseTopic}/level/set`,
      topicMoveToLevelWithOnOff: cfg.topicMoveToLevelWithOnOff ?? `${baseTopic}/level-with-on-off/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';
    const { min: briMin, max: briMax } = ctx.getBrightnessRange(cfg);

    const ep = new MatterbridgeEndpoint([dimmableLight, powerSource]);
    ctx.initEp(ep, cfg, 0x8002);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultLevelControlClusterServer();

    ctx.onCmd(ep, 'on', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, ON, cfg.retain);
    });
    ctx.onCmd(ep, 'off', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, OFF, cfg.retain);
    });

    ctx.onCmd(ep, 'moveToLevel', ((data: LevelRequest) => {
      const lv254 = data.request.level;
      const mqttBrightness = ctx.matterLevelToMqttBrightness(lv254, briMin, briMax);
      if (cfg.topicMoveToLevel) ctx.publish(cfg.topicMoveToLevel, String(mqttBrightness), cfg.retain);
    }) as AnyHandler);
    ctx.onCmd(ep, 'moveToLevelWithOnOff', ((data: LevelRequest) => {
      const lv254 = data.request.level;
      const mqttBrightness = ctx.matterLevelToMqttBrightness(lv254, briMin, briMax);
      if (cfg.topicMoveToLevelWithOnOff) ctx.publish(cfg.topicMoveToLevelWithOnOff, String(mqttBrightness), cfg.retain);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, lv254 > 0 ? ON : OFF, cfg.retain);
    }) as AnyHandler);

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
          const lv = ctx.mqttBrightnessToMatterLevel(raw, briMin, briMax);
          ctx.setAttr(ep, CID.LevelControl, 'currentLevel', lv);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? dimmable light "${cfg.name}"`);
  },
};
