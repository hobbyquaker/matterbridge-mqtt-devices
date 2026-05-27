import { coverDevice, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

export const coverDescriptor: DeviceDescriptor = {
  type: 'cover',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicSetPosition'],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicPosition', 'payloadPositionJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOpen', 'payloadClosed', 'payloadStop', 'retain', 'positionMin', 'positionMax'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set`,
      topicPosition: cfg.topicPosition ?? `${baseTopic}/position`,
      topicSetPosition: cfg.topicSetPosition ?? `${baseTopic}/position/set`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const OPEN = cfg.payloadOpen ?? 'OPEN';
    const CLOSE = cfg.payloadClosed ?? 'CLOSE';
    const STOP = cfg.payloadStop ?? 'STOP';
    const { min: posMin, max: posMax } = ctx.getCoverPositionRange(cfg);
    const CLOSED_ALIASES = [CLOSE.toUpperCase(), 'CLOSED', 'CLOSE'];

    const ep = new MatterbridgeEndpoint([coverDevice, powerSource]);
    ctx.initEp(ep, cfg, 0x8008);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultWindowCoveringClusterServer();

    ctx.onCmd(ep, 'upOrOpen', () => {
      ctx.log.info(`[${cfg.name}] ? OPEN`);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, OPEN, cfg.retain);
      if (cfg.topicSetPosition) ctx.publish(cfg.topicSetPosition, String(posMin), cfg.retain);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 0);
    });

    ctx.onCmd(ep, 'downOrClose', () => {
      ctx.log.info(`[${cfg.name}] ? CLOSE`);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, CLOSE, cfg.retain);
      if (cfg.topicSetPosition) ctx.publish(cfg.topicSetPosition, String(posMax), cfg.retain);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 10000);
    });

    ctx.onCmd(ep, 'stopMotion', () => {
      ctx.log.info(`[${cfg.name}] ? STOP`);
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, STOP, cfg.retain);
    });

    ctx.onCmd(ep, 'goToLiftPercentage', (data: unknown) => {
      const req = data as { request?: { liftPercent100thsValue?: number } };
      const matter100ths: number = req?.request?.liftPercent100thsValue ?? 0;
      const pct = Math.round(matter100ths / 100);
      const mqttPos = ctx.coverMatterPctToMqttPosition(pct, posMin, posMax);
      ctx.log.info(`[${cfg.name}] ? position ${pct}% (mqtt ${mqttPos}, range ${posMin}-${posMax})`);
      if (cfg.topicSetPosition) ctx.publish(cfg.topicSetPosition, String(mqttPos), cfg.retain);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', matter100ths);
    });

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const state = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadOnOffJsonPath));
        const u = state.toUpperCase();
        if (u === OPEN.toUpperCase()) {
          ctx.setAttr(ep, CID.WindowCovering, 'currentPositionLiftPercent100ths', 0);
          ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 0);
        } else if (CLOSED_ALIASES.includes(u)) {
          ctx.setAttr(ep, CID.WindowCovering, 'currentPositionLiftPercent100ths', 10000);
          ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 10000);
        }
        ctx.log.info(`[${cfg.name}] ? state ${state}`);
      });
    }

    if (cfg.topicPosition) {
      ctx.subscribe(cfg.topicPosition, (p) => {
        const pct = ctx.parseFloatPayload(p, ['position', 'value'], cfg.payloadPositionJsonPath);
        if (pct !== null && !isNaN(pct)) {
          const matterPct = ctx.coverMqttPositionToMatterPct(pct, posMin, posMax);
          const matter100ths = Math.round(matterPct * 100);
          ctx.log.info(`[${cfg.name}] ? position mqtt ${pct} (matter ${matterPct}%, range ${posMin}-${posMax})`);
          ctx.setAttr(ep, CID.WindowCovering, 'currentPositionLiftPercent100ths', matter100ths);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? cover "${cfg.name}"`);
  },
};
