import { dimmableOutlet, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { AnyHandler, DeviceContext, DeviceDescriptor, LevelRequest, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

export const dimmableOutletDescriptor: DeviceDescriptor = {
  type: 'dimmable-outlet',
  editableKeys: [
    ...COMMON_KEYS,
    'topicOnOff',
    'payloadOnOffJsonPath',
    'topicSetOnOff',
    'payloadOn',
    'payloadOff',
    'retain',
    'topicBrightness',
    'payloadBrightnessJsonPath',
    'topicSetBrightness',
    'brightnessMin',
    'brightnessMax',
  ],
  applyDefaults(cfg, baseTopic) {
    return {
      topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set`,
      topicBrightness: cfg.topicBrightness ?? `${baseTopic}/brightness`,
      topicSetBrightness: cfg.topicSetBrightness ?? `${baseTopic}/brightness/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';
    const { min: briMin, max: briMax } = ctx.getBrightnessRange(cfg);

    const ep = new MatterbridgeEndpoint([dimmableOutlet, powerSource]);
    ctx.initEp(ep, cfg, 0x800c);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultLevelControlClusterServer();

    ctx.onCmd(ep, 'on', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, ON, cfg.retain);
    });
    ctx.onCmd(ep, 'off', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, OFF, cfg.retain);
    });

    const levelHandler = (data: LevelRequest): void => {
      const lv254 = data.request.level;
      const mqttBrightness = ctx.matterLevelToMqttBrightness(lv254, briMin, briMax);
      ctx.log.info(`[${cfg.name}] ? level ${lv254} (mqtt ${mqttBrightness}, range ${briMin}-${briMax})`);
      if (cfg.topicSetBrightness) ctx.publish(cfg.topicSetBrightness, String(mqttBrightness), cfg.retain);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, lv254 > 0 ? ON : OFF, cfg.retain);
    };
    ctx.onCmd(ep, 'moveToLevel', levelHandler as AnyHandler);
    ctx.onCmd(ep, 'moveToLevelWithOnOff', levelHandler as AnyHandler);

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.OnOff, 'onOff', v);
      });
    }
    if (cfg.topicBrightness) {
      ctx.subscribe(cfg.topicBrightness, (p) => {
        const raw = ctx.parseFloatPayload(p, [], cfg.payloadBrightnessJsonPath);
        if (raw !== null && !isNaN(raw)) {
          const lv = ctx.mqttBrightnessToMatterLevel(raw, briMin, briMax);
          ctx.setAttr(ep, CID.LevelControl, 'currentLevel', lv);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? dimmable outlet "${cfg.name}"`);
  },
};
