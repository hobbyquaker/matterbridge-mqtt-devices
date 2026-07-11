import { colorTemperatureLight, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { AnyHandler, ColorTempRequest, DeviceContext, DeviceDescriptor, LevelRequest, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const colorTemperatureLightDescriptor: DeviceDescriptor = {
  type: 'color-temperature-light',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicMoveToLevel', 'topicMoveToLevelWithOnOff', 'topicSetColorTemp'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicCurrentLevel', 'payloadCurrentLevelJsonPath', 'topicColorTemp', 'payloadColorTempJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain', 'brightnessMin', 'brightnessMax', 'colorTempMin', 'colorTempMax'],
  },
  applyDefaults(cfg, _baseTopic) {
    // Legacy key migration: earlier releases used the shared color keys.
    return {
      topicColorTemp: cfg.topicColorTemp ?? cfg.topicColor,
      payloadColorTempJsonPath: cfg.payloadColorTempJsonPath ?? cfg.payloadColorJsonPath,
      topicSetColorTemp: cfg.topicSetColorTemp ?? cfg.topicSetColor,
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
    // CT feature only: the default helper also enables HueSaturation and Xy,
    // which makes controllers like Apple Home render a full RGB color wheel.
    const ctMin = cfg.colorTempMin ?? 147;
    const ctMax = cfg.colorTempMax ?? 500;
    ep.createCtColorControlClusterServer(Math.min(Math.max(250, ctMin), ctMax), ctMin, ctMax);

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

    if (cfg.topicSetColorTemp) {
      const colorTempTopic = cfg.topicSetColorTemp;
      ctx.onCmd(ep, 'moveToColorTemperature', ((data: ColorTempRequest) => {
        const mireds = data.request.colorTemperatureMireds;
        ctx.publish(colorTempTopic, ctx.wrapPayloadValue(mireds, cfg.payloadColorTempJsonPath), cfg.retain);
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
          const lv = ctx.mqttBrightnessToMatterLevel(raw, briMin, briMax);
          ctx.setAttr(ep, CID.LevelControl, 'currentLevel', lv);
        }
      });
    }
    if (cfg.topicColorTemp) {
      ctx.subscribe(cfg.topicColorTemp, (p) => {
        const extracted = ctx.extractPayloadValue(p, cfg.payloadColorTempJsonPath);
        if (extracted !== undefined && extracted !== null && typeof extracted === 'object') {
          const d = extracted as Record<string, number>;
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
