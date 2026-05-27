import { fanDevice, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const fanDescriptor: DeviceDescriptor = {
  type: 'fan',
  editableKeys: {
    publish: ['topicSetSpeed', 'topicSetSpeedStep', 'topicSetFanMode'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicSpeed', 'payloadSpeedJsonPath', 'topicFanMode', 'payloadFanModeJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'speedMin', 'speedMax', 'retain'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicSpeed: cfg.topicSpeed ?? `${baseTopic}/speed`,
      topicSetSpeed: cfg.topicSetSpeed ?? `${baseTopic}/speed/set`,
      topicSetSpeedStep: cfg.topicSetSpeedStep ?? `${baseTopic}/speed/step`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const SPD_MIN = cfg.speedMin ?? 0;
    const SPD_MAX = cfg.speedMax ?? 5;

    const FAN_MODE_STR: Record<number, string> = { 0: 'off', 1: 'low', 2: 'medium', 3: 'high', 4: 'on', 5: 'auto', 6: 'smart' };
    const FAN_MODE_NUM: Record<string, number> = { off: 0, low: 1, medium: 2, high: 3, on: 4, auto: 5, smart: 6 };

    const lvToPct = (lv: number): number => Math.round(Math.max(0, Math.min(1, (lv - SPD_MIN) / (SPD_MAX - SPD_MIN))) * 100);
    const pctToLv = (pct: number): number => Math.round((Math.max(0, Math.min(100, pct)) / 100) * (SPD_MAX - SPD_MIN) + SPD_MIN);

    const ep = new MatterbridgeEndpoint([fanDevice, powerSource]);
    ctx.initEp(ep, cfg, 0x800a);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultFanControlClusterServer();

    void ep.subscribeAttribute(
      'FanControl',
      'fanMode',
      (newValue: number) => {
        const s = FAN_MODE_STR[newValue] ?? String(newValue);
        if (cfg.topicSetFanMode) ctx.publish(cfg.topicSetFanMode, s, cfg.retain);
      },
      ctx.log,
    );

    let currentLevel = SPD_MIN;

    void ep.subscribeAttribute(
      'FanControl',
      'percentSetting',
      (newPct: number) => {
        const newLevel = pctToLv(newPct);
        if (newLevel === currentLevel) return;
        const prev = currentLevel;
        currentLevel = newLevel;

        if (cfg.topicSetSpeed) ctx.publish(cfg.topicSetSpeed, JSON.stringify({ level: newLevel, percent: newPct }), cfg.retain);

        if (cfg.topicSetSpeedStep) {
          const delta = newLevel - prev;
          if (delta !== 0) ctx.publish(cfg.topicSetSpeedStep, delta > 0 ? '+1' : '-1', cfg.retain);
        }
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

    if (cfg.topicSpeed) {
      ctx.subscribe(cfg.topicSpeed, (p) => {
        let lv: number | null = null;
        const extracted = ctx.extractPayloadValue(p, cfg.payloadSpeedJsonPath);

        if (extracted !== null && extracted !== undefined && typeof extracted === 'object') {
          const o = extracted as Record<string, unknown>;
          if (o['level'] != null) lv = parseFloat(String(o['level']));
          else if (o['percent'] != null) lv = pctToLv(parseFloat(String(o['percent'])));
        } else {
          lv = parseFloat(ctx.toPayloadString(extracted));
        }

        if (lv !== null && !isNaN(lv)) {
          currentLevel = Math.max(SPD_MIN, Math.min(SPD_MAX, Math.round(lv)));
          ctx.setAttr(ep, CID.FanControl, 'percentSetting', lvToPct(currentLevel));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? fan "${cfg.name}" (levels ${SPD_MIN}?${SPD_MAX})`);
  },
};
