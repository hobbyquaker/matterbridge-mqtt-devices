import { colorTemperatureSwitch, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { AnyHandler, ColorTempRequest, DeviceContext, DeviceDescriptor, HueSatRequest, LevelRequest, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const colorTemperatureSwitchDescriptor: DeviceDescriptor = {
  type: 'color-temperature-switch',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicMoveToLevel', 'topicMoveToLevelWithOnOff', 'topicSetColor'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicCurrentLevel', 'payloadCurrentLevelJsonPath', 'topicColor', 'payloadColorJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain', 'brightnessMin', 'brightnessMax'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';
    const { min: briMin, max: briMax } = ctx.getBrightnessRange(cfg);

    const ep = new MatterbridgeEndpoint([colorTemperatureSwitch, powerSource]);
    ctx.initEp(ep, cfg, 0x801e);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultLevelControlClusterServer();
    ep.createDefaultColorControlClusterServer();

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
    if (cfg.topicMoveToLevelWithOnOff) {
      const moveTopic = cfg.topicMoveToLevelWithOnOff;
      ctx.onCmd(ep, 'moveToLevelWithOnOff', ((data: LevelRequest) => {
        ctx.publish(moveTopic, String(ctx.matterLevelToMqttBrightness(data.request.level, briMin, briMax)), cfg.retain);
      }) as AnyHandler);
    }

    if (cfg.topicSetColor) {
      const colorTopic = cfg.topicSetColor;
      ctx.onCmd(ep, 'moveToHueAndSaturation', ((data: HueSatRequest) => {
        const hue360 = Math.round((data.request.hue / 254) * 360);
        const sat100 = Math.round((data.request.saturation / 254) * 100);
        ctx.publish(colorTopic, JSON.stringify({ hue: hue360, saturation: sat100 }), cfg.retain);
      }) as AnyHandler);

      ctx.onCmd(ep, 'moveToColorTemperature', ((data: ColorTempRequest) => {
        ctx.publish(colorTopic, JSON.stringify({ colorTemp: data.request.colorTemperatureMireds }), cfg.retain);
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
        if (!isNaN(m)) ctx.setAttr(ep, CID.ColorControl, 'colorTemperatureMireds', m);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ color temperature switch "${cfg.name}"`);
  },
};
