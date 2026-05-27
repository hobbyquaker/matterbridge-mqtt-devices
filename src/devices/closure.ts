import { closure, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

// ClosureControl mainState enum values (Matter spec 1.5 §8.2.7.6)
const MAIN_STATE_STOPPED = 0;
const MAIN_STATE_MOVING = 1;

export const closureDescriptor: DeviceDescriptor = {
  type: 'closure',
  editableKeys: {
    publish: ['topicSetClosureState', 'topicSetClosureStateOpen', 'topicSetClosureStateClose', 'topicSetClosureStateStop', 'topicSetPosition', 'topicSetLatch', 'topicSetSpeed'],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicClosureState',
      'payloadClosureStateJsonPath',
      'topicClosureStateOpen',
      'topicClosureStateClose',
      'topicClosureStateStop',
      'topicPosition',
      'payloadPositionJsonPath',
      'topicLatch',
      'payloadLatchJsonPath',
      'topicMainState',
      'payloadMainStateJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOpen', 'payloadClosed', 'payloadStop', 'retain', 'positionMin', 'positionMax', 'speedMin', 'speedMax'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const OPEN = cfg.payloadOpen ?? 'OPEN';
    const CLOSE = cfg.payloadClosed ?? 'CLOSE';
    const STOP = cfg.payloadStop ?? 'STOP';
    const { min: posMin, max: posMax } = ctx.getCoverPositionRange(cfg);
    const speedMin = Number.isFinite(cfg.speedMin) ? Number(cfg.speedMin) : 0;
    const speedMax = Number.isFinite(cfg.speedMax) ? Number(cfg.speedMax) : 100;

    const ep = new MatterbridgeEndpoint([closure, powerSource]);
    ctx.initEp(ep, cfg, 0x8022);
    ctx.applyConfigUrl(ep, cfg);
    ep.addRequiredClusterServers();

    // ── ClosureControl commands ──────────────────────────────────────────────

    ctx.onCmd(ep, 'moveTo', (data: unknown) => {
      const req = data as { request?: { position?: number; latch?: boolean; speed?: number } };
      const position = req?.request?.position;
      const latch = req?.request?.latch;
      const speed = req?.request?.speed;

      if (position !== undefined) {
        if (position >= 10000) {
          // Fully open (10000 Percent100ths = 100% = fully open in ClosureControl)
          if (cfg.topicSetClosureState) ctx.publish(cfg.topicSetClosureState, OPEN, cfg.retain);
          if (cfg.topicSetClosureStateOpen) ctx.publish(cfg.topicSetClosureStateOpen, OPEN, cfg.retain);
        } else if (position <= 0) {
          // Fully closed
          if (cfg.topicSetClosureState) ctx.publish(cfg.topicSetClosureState, CLOSE, cfg.retain);
          if (cfg.topicSetClosureStateClose) ctx.publish(cfg.topicSetClosureStateClose, CLOSE, cfg.retain);
        } else {
          // Partial — map to MQTT position range
          const pct = Math.round(position / 100);
          const mqttPos = ctx.coverMatterPctToMqttPosition(pct, posMin, posMax);
          if (cfg.topicSetPosition) ctx.publish(cfg.topicSetPosition, String(mqttPos), cfg.retain);
        }
      }

      if (latch !== undefined && cfg.topicSetLatch) {
        ctx.publish(cfg.topicSetLatch, latch ? 'true' : 'false', cfg.retain);
      }

      if (speed !== undefined && cfg.topicSetSpeed) {
        const mqttSpeed = ctx.coverMatterPctToMqttPosition(speed, speedMin, speedMax);
        ctx.publish(cfg.topicSetSpeed, String(mqttSpeed), cfg.retain);
      }

      ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_MOVING);
    });

    ctx.onCmd(ep, 'stop', () => {
      if (cfg.topicSetClosureState) ctx.publish(cfg.topicSetClosureState, STOP, cfg.retain);
      if (cfg.topicSetClosureStateStop) ctx.publish(cfg.topicSetClosureStateStop, STOP, cfg.retain);
      ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_STOPPED);
    });

    // ── ClosureDimension commands ────────────────────────────────────────────

    ctx.onCmd(ep, 'setTarget', (data: unknown) => {
      const req = data as { request?: { position?: number; latch?: boolean; speed?: number } };
      const position = req?.request?.position;
      const latch = req?.request?.latch;
      const speed = req?.request?.speed;

      if (position !== undefined) {
        const pct = Math.round(position / 100);
        const mqttPos = ctx.coverMatterPctToMqttPosition(pct, posMin, posMax);
        if (cfg.topicSetPosition) ctx.publish(cfg.topicSetPosition, String(mqttPos), cfg.retain);
      }

      if (latch !== undefined && cfg.topicSetLatch) {
        ctx.publish(cfg.topicSetLatch, latch ? 'true' : 'false', cfg.retain);
      }

      if (speed !== undefined && cfg.topicSetSpeed) {
        const mqttSpeed = ctx.coverMatterPctToMqttPosition(speed, speedMin, speedMax);
        ctx.publish(cfg.topicSetSpeed, String(mqttSpeed), cfg.retain);
      }

      ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_MOVING);
    });

    ctx.onCmd(ep, 'step', (data: unknown) => {
      // direction: 0 = Increasing (opening), 1 = Decreasing (closing)
      const req = data as { request?: { direction: number; numberOfSteps?: number; speed?: number } };
      const dir = req?.request?.direction ?? 0;
      const payload = dir === 0 ? OPEN : CLOSE;
      if (cfg.topicSetClosureState) ctx.publish(cfg.topicSetClosureState, payload, cfg.retain);
      if (dir === 0 && cfg.topicSetClosureStateOpen) ctx.publish(cfg.topicSetClosureStateOpen, OPEN, cfg.retain);
      if (dir !== 0 && cfg.topicSetClosureStateClose) ctx.publish(cfg.topicSetClosureStateClose, CLOSE, cfg.retain);
      ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_MOVING);
    });

    // ── MQTT → Matter state mapping ──────────────────────────────────────────

    if (cfg.topicClosureState) {
      ctx.subscribe(cfg.topicClosureState, (p) => {
        const state = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadClosureStateJsonPath));
        const u = state.toUpperCase();
        if (u === OPEN.toUpperCase()) {
          // 10000 Percent100ths = fully open
          ctx.setAttr(ep, CID.ClosureControl, 'overallCurrentState', { position: 10000 });
          ctx.setAttr(ep, CID.ClosureDimension, 'currentState', { position: 10000 });
          ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_STOPPED);
        } else if (u === CLOSE.toUpperCase() || u === 'CLOSED') {
          ctx.setAttr(ep, CID.ClosureControl, 'overallCurrentState', { position: 0 });
          ctx.setAttr(ep, CID.ClosureDimension, 'currentState', { position: 0 });
          ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_STOPPED);
        } else if (u === STOP.toUpperCase() || u === 'STOPPED') {
          ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_STOPPED);
        }
      });
    }

    // Payload-agnostic per-state subscribe topics
    if (cfg.topicClosureStateOpen) {
      ctx.subscribe(cfg.topicClosureStateOpen, () => {
        ctx.setAttr(ep, CID.ClosureControl, 'overallCurrentState', { position: 10000 });
        ctx.setAttr(ep, CID.ClosureDimension, 'currentState', { position: 10000 });
        ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_STOPPED);
      });
    }

    if (cfg.topicClosureStateClose) {
      ctx.subscribe(cfg.topicClosureStateClose, () => {
        ctx.setAttr(ep, CID.ClosureControl, 'overallCurrentState', { position: 0 });
        ctx.setAttr(ep, CID.ClosureDimension, 'currentState', { position: 0 });
        ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_STOPPED);
      });
    }

    if (cfg.topicClosureStateStop) {
      ctx.subscribe(cfg.topicClosureStateStop, () => {
        ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_STOPPED);
      });
    }

    if (cfg.topicPosition) {
      ctx.subscribe(cfg.topicPosition, (p) => {
        const pct = ctx.parseFloatPayload(p, ['position', 'value'], cfg.payloadPositionJsonPath);
        if (pct !== null && !isNaN(pct)) {
          const matterPct = ctx.coverMqttPositionToMatterPct(pct, posMin, posMax);
          const matter100ths = Math.round(matterPct * 100);
          ctx.setAttr(ep, CID.ClosureControl, 'overallCurrentState', { position: matter100ths });
          ctx.setAttr(ep, CID.ClosureDimension, 'currentState', { position: matter100ths });
          ctx.setAttr(ep, CID.ClosureControl, 'mainState', MAIN_STATE_STOPPED);
        }
      });
    }

    if (cfg.topicMainState) {
      ctx.subscribe(cfg.topicMainState, (p) => {
        const val = ctx.parseFloatPayload(p, ['mainState', 'state', 'value'], cfg.payloadMainStateJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.ClosureControl, 'mainState', Math.round(val));
        }
      });
    }

    if (cfg.topicLatch) {
      ctx.subscribe(cfg.topicLatch, (p) => {
        const raw = ctx.extractPayloadValue(p, cfg.payloadLatchJsonPath);
        const val = typeof raw === 'boolean' ? raw : String(raw).toLowerCase() === 'true' || String(raw) === '1';
        ctx.setAttr(ep, CID.ClosureControl, 'overallCurrentState', { latch: val });
        ctx.setAttr(ep, CID.ClosureDimension, 'currentState', { latch: val });
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ closure "${cfg.name}"`);
  },
};
