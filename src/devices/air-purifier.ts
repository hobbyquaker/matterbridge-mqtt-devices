import { airPurifier, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const airPurifierDescriptor: DeviceDescriptor = {
  type: 'air-purifier',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicSetSpeed', 'topicSetFanMode'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicSpeed', 'payloadSpeedJsonPath', 'topicFanMode', 'payloadFanModeJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'retain'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const ON = cfg.payloadOn ?? 'ON';
    const OFF = cfg.payloadOff ?? 'OFF';
    const FAN_MODE_STR: Record<number, string> = { 0: 'off', 1: 'low', 2: 'medium', 3: 'high', 4: 'on', 5: 'auto', 6: 'smart' };
    const FAN_MODE_NUM: Record<string, number> = { off: 0, low: 1, medium: 2, high: 3, on: 4, auto: 5, smart: 6 };

    const ep = new MatterbridgeEndpoint([airPurifier, powerSource]);
    ctx.initEp(ep, cfg, 0x8020);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultOnOffClusterServer();
    ep.createDefaultFanControlClusterServer();

    if (cfg.topicSetOnOff) {
      const setTopic = cfg.topicSetOnOff;
      ctx.onCmd(ep, 'on', () => ctx.publish(setTopic, ON, cfg.retain));
      ctx.onCmd(ep, 'off', () => ctx.publish(setTopic, OFF, cfg.retain));
    }

    void ep.subscribeAttribute(
      'FanControl',
      'fanMode',
      (newValue: number) => {
        const s = FAN_MODE_STR[newValue] ?? String(newValue);
        if (cfg.topicSetFanMode) ctx.publish(cfg.topicSetFanMode, s, cfg.retain);
      },
      ctx.log,
    );

    void ep.subscribeAttribute(
      'FanControl',
      'percentSetting',
      (newPct: number) => {
        if (cfg.topicSetSpeed) ctx.publish(cfg.topicSetSpeed, String(newPct), cfg.retain);
      },
      ctx.log,
    );

    if (cfg.topicFanMode) {
      ctx.subscribe(cfg.topicFanMode, (p) => {
        const raw = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadFanModeJsonPath)).toLowerCase();
        const mode = FAN_MODE_NUM[raw] ?? parseInt(raw, 10);
        if (Number.isFinite(mode)) ctx.setAttr(ep, CID.FanControl, 'fanMode', mode);
      });
    }

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const v = ctx.parseOnOff(p, ON, OFF, cfg.payloadOnOffJsonPath);
        if (v !== null) ctx.setAttr(ep, CID.OnOff, 'onOff', v);
      });
    }

    if (cfg.topicSpeed) {
      ctx.subscribe(cfg.topicSpeed, (p) => {
        const pct = ctx.parseFloatPayload(p, ['percent', 'speed'], cfg.payloadSpeedJsonPath);
        if (pct !== null) ctx.setAttr(ep, CID.FanControl, 'percentSetting', Math.round(Math.max(0, Math.min(100, pct))));
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ air purifier "${cfg.name}"`);
  },
};
