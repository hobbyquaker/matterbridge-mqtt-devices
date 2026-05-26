import { coverDevice, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

export const coverDescriptor: DeviceDescriptor = {
  type: 'cover',
  editableKeys: [
    ...COMMON_KEYS,
    'stateTopic',
    'stateJsonPath',
    'commandTopic',
    'payloadOpen',
    'payloadClosed',
    'payloadStop',
    'retain',
    'positionStateTopic',
    'positionStateJsonPath',
    'positionCommandTopic',
    'positionMin',
    'positionMax',
  ],
  applyDefaults(cfg, baseTopic) {
    return {
      commandTopic: cfg.commandTopic ?? `${baseTopic}/set`,
      positionStateTopic: cfg.positionStateTopic ?? `${baseTopic}/position`,
      positionCommandTopic: cfg.positionCommandTopic ?? `${baseTopic}/position/set`,
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
      if (cfg.commandTopic) ctx.publish(cfg.commandTopic, OPEN, cfg.retain);
      if (cfg.positionCommandTopic) ctx.publish(cfg.positionCommandTopic, String(posMin), cfg.retain);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 0);
    });

    ctx.onCmd(ep, 'downOrClose', () => {
      ctx.log.info(`[${cfg.name}] ? CLOSE`);
      if (cfg.commandTopic) ctx.publish(cfg.commandTopic, CLOSE, cfg.retain);
      if (cfg.positionCommandTopic) ctx.publish(cfg.positionCommandTopic, String(posMax), cfg.retain);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 10000);
    });

    ctx.onCmd(ep, 'stopMotion', () => {
      ctx.log.info(`[${cfg.name}] ? STOP`);
      if (cfg.commandTopic) ctx.publish(cfg.commandTopic, STOP, cfg.retain);
    });

    ctx.onCmd(ep, 'goToLiftPercentage', (data: unknown) => {
      const req = data as { request?: { liftPercent100thsValue?: number } };
      const matter100ths: number = req?.request?.liftPercent100thsValue ?? 0;
      const pct = Math.round(matter100ths / 100);
      const mqttPos = ctx.coverMatterPctToMqttPosition(pct, posMin, posMax);
      ctx.log.info(`[${cfg.name}] ? position ${pct}% (mqtt ${mqttPos}, range ${posMin}-${posMax})`);
      if (cfg.positionCommandTopic) ctx.publish(cfg.positionCommandTopic, String(mqttPos), cfg.retain);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', matter100ths);
    });

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, (p) => {
        const state = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.stateJsonPath));
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

    if (cfg.positionStateTopic) {
      ctx.subscribe(cfg.positionStateTopic, (p) => {
        const pct = ctx.parseFloatPayload(p, ['position', 'value'], cfg.positionStateJsonPath);
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
