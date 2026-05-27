import { colorTemperatureLight, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { AnyHandler, ColorTempRequest, DeviceContext, DeviceDescriptor, HueSatRequest, LevelRequest, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const colorTemperatureLightDescriptor: DeviceDescriptor = {
  type: 'color-temperature-light',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicMoveToLevel', 'topicMoveToLevelWithOnOff', 'topicSetColor'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicCurrentLevel', 'payloadCurrentLevelJsonPath', 'topicColor', 'payloadColorJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain', 'brightnessMin', 'brightnessMax'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set`,
      topicCurrentLevel: cfg.topicCurrentLevel ?? `${baseTopic}/level`,
      topicMoveToLevel: cfg.topicMoveToLevel ?? `${baseTopic}/level/set`,
      topicMoveToLevelWithOnOff: cfg.topicMoveToLevelWithOnOff ?? `${baseTopic}/level-with-on-off/set`,
      topicColor: cfg.topicColor ?? `${baseTopic}/color`,
      topicSetColor: cfg.topicSetColor ?? `${baseTopic}/color/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';
    const { min: briMin, max: briMax } = ctx.getBrightnessRange(cfg);

    const ep = new MatterbridgeEndpoint([colorTemperatureLight, powerSource]);
    ctx.initEp(ep, cfg, 0x8003);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultLevelControlClusterServer();
    ep.createDefaultColorControlClusterServer();

    ctx.onCmd(ep, 'on', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, ON, cfg.retain);
    });
    ctx.onCmd(ep, 'off', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, OFF, cfg.retain);
    });

    ctx.onCmd(ep, 'moveToLevel', ((data: LevelRequest) => {
      const mqttBrightness = ctx.matterLevelToMqttBrightness(data.request.level, briMin, briMax);
      if (cfg.topicMoveToLevel) ctx.publish(cfg.topicMoveToLevel, String(mqttBrightness), cfg.retain);
    }) as AnyHandler);
    ctx.onCmd(ep, 'moveToLevelWithOnOff', ((data: LevelRequest) => {
      const mqttBrightness = ctx.matterLevelToMqttBrightness(data.request.level, briMin, briMax);
      if (cfg.topicMoveToLevelWithOnOff) ctx.publish(cfg.topicMoveToLevelWithOnOff, String(mqttBrightness), cfg.retain);
    }) as AnyHandler);

    ctx.onCmd(ep, 'moveToHueAndSaturation', ((data: HueSatRequest) => {
      const hue360 = Math.round((data.request.hue / 254) * 360);
      const sat100 = Math.round((data.request.saturation / 254) * 100);
      ctx.log.info(`[${cfg.name}] ? H${hue360}� S${sat100}%`);
      if (cfg.topicSetColor) ctx.publish(cfg.topicSetColor, JSON.stringify({ hue: hue360, saturation: sat100 }), cfg.retain);
    }) as AnyHandler);

    ctx.onCmd(ep, 'moveToColorTemperature', ((data: ColorTempRequest) => {
      const mireds = data.request.colorTemperatureMireds;
      ctx.log.info(`[${cfg.name}] ? ${mireds} mireds`);
      if (cfg.topicSetColor) ctx.publish(cfg.topicSetColor, JSON.stringify({ colorTemp: mireds }), cfg.retain);
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
    if (cfg.topicColor) {
      ctx.subscribe(cfg.topicColor, (p) => {
        const extracted = ctx.extractPayloadValue(p, cfg.payloadColorJsonPath);
        if (extracted !== undefined && extracted !== null && typeof extracted === 'object') {
          const d = extracted as Record<string, number>;
          if (d['hue'] !== undefined) ctx.setAttr(ep, CID.ColorControl, 'currentHue', Math.round((d['hue'] / 360) * 254));
          if (d['saturation'] !== undefined) ctx.setAttr(ep, CID.ColorControl, 'currentSaturation', Math.round((d['saturation'] / 100) * 254));
          if (d['colorTemp'] !== undefined) ctx.setAttr(ep, CID.ColorControl, 'colorTemperatureMireds', d['colorTemp']);
          return;
        }
        const m = parseInt(ctx.toPayloadString(extracted), 10);
        if (!isNaN(m)) {
          ctx.setAttr(ep, CID.ColorControl, 'colorTemperatureMireds', m);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? color light "${cfg.name}"`);
  },
};
