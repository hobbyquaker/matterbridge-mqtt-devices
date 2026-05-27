import { fanDevice, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

export const fanDescriptor: DeviceDescriptor = {
  type: 'fan',
  editableKeys: [...COMMON_KEYS, 'topicSpeed', 'payloadSpeedJsonPath', 'topicSetSpeed', 'topicSetSpeedStep', 'speedMin', 'speedMax', 'retain'],
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

    const lvToPct = (lv: number): number => Math.round(Math.max(0, Math.min(1, (lv - SPD_MIN) / (SPD_MAX - SPD_MIN))) * 100);
    const pctToLv = (pct: number): number => Math.round((Math.max(0, Math.min(100, pct)) / 100) * (SPD_MAX - SPD_MIN) + SPD_MIN);

    const ep = new MatterbridgeEndpoint([fanDevice, powerSource]);
    ctx.initEp(ep, cfg, 0x800a);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultFanControlClusterServer();

    let currentLevel = SPD_MIN;

    void ep.subscribeAttribute(
      'FanControl',
      'percentSetting',
      (newPct: number) => {
        const newLevel = pctToLv(newPct);
        if (newLevel === currentLevel) return;
        const prev = currentLevel;
        currentLevel = newLevel;
        ctx.log.info(`[${cfg.name}] ? level ${newLevel} (${newPct}%)`);

        if (cfg.topicSetSpeed) ctx.publish(cfg.topicSetSpeed, JSON.stringify({ level: newLevel, percent: newPct }), cfg.retain);

        if (cfg.topicSetSpeedStep) {
          const delta = newLevel - prev;
          if (delta !== 0) ctx.publish(cfg.topicSetSpeedStep, delta > 0 ? '+1' : '-1', cfg.retain);
        }
      },
      ctx.log,
    );

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
          ctx.log.info(`[${cfg.name}] ? level ${currentLevel}`);
          ctx.setAttr(ep, CID.FanControl, 'percentSetting', lvToPct(currentLevel));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? fan "${cfg.name}" (levels ${SPD_MIN}�${SPD_MAX})`);
  },
};
