import { coverDevice, MatterbridgeEndpoint, powerSource } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

// WindowCovering MovementStatus enum values (Matter spec 1.5 §5.3.6.4)
const MOVEMENT_STOPPED = 0;
const MOVEMENT_OPENING = 1;
const MOVEMENT_CLOSING = 2;

export const windowCoveringDescriptor: DeviceDescriptor = {
  type: 'window-covering',
  editableKeys: {
    publish: [
      'topicSetCoverState',
      'topicSetCoverStateOpen',
      'topicSetCoverStateClose',
      'topicSetCoverStateStop',
      'topicSetPosition',
      'topicSetTiltState',
      'topicSetTilt',
      'topicSetSafetyStatus',
    ],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      'topicCoverState',
      'payloadCoverStateJsonPath',
      'topicCoverStateOpen',
      'topicCoverStateClose',
      'topicCoverStateStop',
      'topicPosition',
      'payloadPositionJsonPath',
      'topicTiltState',
      'payloadTiltStateJsonPath',
      'topicTilt',
      'payloadTiltJsonPath',
      'topicSafetyStatus',
      'payloadSafetyStatusJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOpen', 'payloadClosed', 'payloadStop', 'retain', 'positionMin', 'positionMax', 'tiltMin', 'tiltMax'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const OPEN = cfg.payloadOpen ?? 'OPEN';
    const CLOSE = cfg.payloadClosed ?? 'CLOSE';
    const STOP = cfg.payloadStop ?? 'STOP';
    const { min: posMin, max: posMax } = ctx.getCoverPositionRange(cfg);
    const tiltMin = Number.isFinite(cfg.tiltMin) ? Number(cfg.tiltMin) : 0;
    const tiltMax = Number.isFinite(cfg.tiltMax) ? Number(cfg.tiltMax) : 100;
    const CLOSED_ALIASES = [CLOSE.toUpperCase(), 'CLOSED', 'CLOSE'];

    const ep = new MatterbridgeEndpoint([coverDevice, powerSource]);
    ctx.initEp(ep, cfg, 0x8008);
    ctx.applyConfigUrl(ep, cfg);

    // Full Lift+Tilt server — exposes goToTiltPercentage command and all tilt attributes.
    ep.createDefaultLiftTiltWindowCoveringClusterServer(0, 0);

    // ── Command handlers ─────────────────────────────────────────────────────

    ctx.onCmd(ep, 'upOrOpen', () => {
      if (cfg.topicSetCoverState) ctx.publish(cfg.topicSetCoverState, OPEN, cfg.retain);
      if (cfg.topicSetCoverStateOpen) ctx.publish(cfg.topicSetCoverStateOpen, OPEN, cfg.retain);
      if (cfg.topicSetPosition) ctx.publish(cfg.topicSetPosition, String(posMin), cfg.retain);
      if (cfg.topicSetTilt) ctx.publish(cfg.topicSetTilt, String(tiltMin), cfg.retain);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 0);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionTiltPercent100ths', 0);
      ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_OPENING, lift: MOVEMENT_OPENING, tilt: MOVEMENT_OPENING });
    });

    ctx.onCmd(ep, 'downOrClose', () => {
      if (cfg.topicSetCoverState) ctx.publish(cfg.topicSetCoverState, CLOSE, cfg.retain);
      if (cfg.topicSetCoverStateClose) ctx.publish(cfg.topicSetCoverStateClose, CLOSE, cfg.retain);
      if (cfg.topicSetPosition) ctx.publish(cfg.topicSetPosition, String(posMax), cfg.retain);
      if (cfg.topicSetTilt) ctx.publish(cfg.topicSetTilt, String(tiltMax), cfg.retain);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 10000);
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionTiltPercent100ths', 10000);
      ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_CLOSING, lift: MOVEMENT_CLOSING, tilt: MOVEMENT_CLOSING });
    });

    ctx.onCmd(ep, 'stopMotion', () => {
      if (cfg.topicSetCoverState) ctx.publish(cfg.topicSetCoverState, STOP, cfg.retain);
      if (cfg.topicSetCoverStateStop) ctx.publish(cfg.topicSetCoverStateStop, STOP, cfg.retain);
      ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_STOPPED, lift: MOVEMENT_STOPPED, tilt: MOVEMENT_STOPPED });
    });

    ctx.onCmd(ep, 'goToLiftPercentage', (data: unknown) => {
      const req = data as { request?: { liftPercent100thsValue?: number } };
      const matter100ths: number = req?.request?.liftPercent100thsValue ?? 0;
      const pct = Math.round(matter100ths / 100);
      const mqttPos = ctx.coverMatterPctToMqttPosition(pct, posMin, posMax);
      if (cfg.topicSetPosition) ctx.publish(cfg.topicSetPosition, String(mqttPos), cfg.retain);
      const current = (ctx.getAttr(ep, CID.WindowCovering, 'currentPositionLiftPercent100ths') as number) ?? 0;
      const direction = matter100ths > current ? MOVEMENT_CLOSING : MOVEMENT_OPENING;
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', matter100ths);
      ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: direction, lift: direction, tilt: MOVEMENT_STOPPED });
    });

    ctx.onCmd(ep, 'goToTiltPercentage', (data: unknown) => {
      const req = data as { request?: { tiltPercent100thsValue?: number } };
      const matter100ths: number = req?.request?.tiltPercent100thsValue ?? 0;
      const pct = Math.round(matter100ths / 100);
      const mqttPos = ctx.coverMatterPctToMqttPosition(pct, tiltMin, tiltMax);
      if (cfg.topicSetTilt) ctx.publish(cfg.topicSetTilt, String(mqttPos), cfg.retain);
      const current = (ctx.getAttr(ep, CID.WindowCovering, 'currentPositionTiltPercent100ths') as number) ?? 0;
      const direction = matter100ths > current ? MOVEMENT_CLOSING : MOVEMENT_OPENING;
      ctx.setAttr(ep, CID.WindowCovering, 'targetPositionTiltPercent100ths', matter100ths);
      ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: direction, lift: MOVEMENT_STOPPED, tilt: direction });
    });

    // ── MQTT → Matter state mapping ──────────────────────────────────────────

    if (cfg.topicCoverState) {
      ctx.subscribe(cfg.topicCoverState, (p) => {
        const state = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadCoverStateJsonPath));
        const u = state.toUpperCase();
        if (u === OPEN.toUpperCase()) {
          ctx.setAttr(ep, CID.WindowCovering, 'currentPositionLiftPercent100ths', 0);
          ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 0);
        } else if (CLOSED_ALIASES.includes(u)) {
          ctx.setAttr(ep, CID.WindowCovering, 'currentPositionLiftPercent100ths', 10000);
          ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 10000);
        }
        ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_STOPPED, lift: MOVEMENT_STOPPED, tilt: MOVEMENT_STOPPED });
      });
    }

    // Payload-agnostic per-state subscribe topics
    if (cfg.topicCoverStateOpen) {
      ctx.subscribe(cfg.topicCoverStateOpen, () => {
        ctx.setAttr(ep, CID.WindowCovering, 'currentPositionLiftPercent100ths', 0);
        ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 0);
        ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_STOPPED, lift: MOVEMENT_STOPPED, tilt: MOVEMENT_STOPPED });
      });
    }

    if (cfg.topicCoverStateClose) {
      ctx.subscribe(cfg.topicCoverStateClose, () => {
        ctx.setAttr(ep, CID.WindowCovering, 'currentPositionLiftPercent100ths', 10000);
        ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', 10000);
        ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_STOPPED, lift: MOVEMENT_STOPPED, tilt: MOVEMENT_STOPPED });
      });
    }

    if (cfg.topicCoverStateStop) {
      ctx.subscribe(cfg.topicCoverStateStop, () => {
        ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_STOPPED, lift: MOVEMENT_STOPPED, tilt: MOVEMENT_STOPPED });
      });
    }

    if (cfg.topicPosition) {
      ctx.subscribe(cfg.topicPosition, (p) => {
        const pct = ctx.parseFloatPayload(p, ['position', 'value'], cfg.payloadPositionJsonPath);
        if (pct !== null && !isNaN(pct)) {
          const matterPct = ctx.coverMqttPositionToMatterPct(pct, posMin, posMax);
          const matter100ths = Math.round(matterPct * 100);
          ctx.setAttr(ep, CID.WindowCovering, 'currentPositionLiftPercent100ths', matter100ths);
          ctx.setAttr(ep, CID.WindowCovering, 'targetPositionLiftPercent100ths', matter100ths);
          ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_STOPPED, lift: MOVEMENT_STOPPED, tilt: MOVEMENT_STOPPED });
        }
      });
    }

    if (cfg.topicTiltState) {
      ctx.subscribe(cfg.topicTiltState, (p) => {
        const state = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadTiltStateJsonPath));
        const u = state.toUpperCase();
        if (u === OPEN.toUpperCase()) {
          ctx.setAttr(ep, CID.WindowCovering, 'currentPositionTiltPercent100ths', 0);
          ctx.setAttr(ep, CID.WindowCovering, 'targetPositionTiltPercent100ths', 0);
        } else if (CLOSED_ALIASES.includes(u)) {
          ctx.setAttr(ep, CID.WindowCovering, 'currentPositionTiltPercent100ths', 10000);
          ctx.setAttr(ep, CID.WindowCovering, 'targetPositionTiltPercent100ths', 10000);
        }
        ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_STOPPED, lift: MOVEMENT_STOPPED, tilt: MOVEMENT_STOPPED });
      });
    }

    if (cfg.topicTilt) {
      ctx.subscribe(cfg.topicTilt, (p) => {
        const pct = ctx.parseFloatPayload(p, ['tilt', 'position', 'value'], cfg.payloadTiltJsonPath);
        if (pct !== null && !isNaN(pct)) {
          const matterPct = ctx.coverMqttPositionToMatterPct(pct, tiltMin, tiltMax);
          const matter100ths = Math.round(matterPct * 100);
          ctx.setAttr(ep, CID.WindowCovering, 'currentPositionTiltPercent100ths', matter100ths);
          ctx.setAttr(ep, CID.WindowCovering, 'targetPositionTiltPercent100ths', matter100ths);
          ctx.setAttr(ep, CID.WindowCovering, 'operationalStatus', { global: MOVEMENT_STOPPED, lift: MOVEMENT_STOPPED, tilt: MOVEMENT_STOPPED });
        }
      });
    }

    // safetyStatus: numeric bitmap (0 = fully safe). Common bits: bit5 = ObstacleDetected, bit4 = ThermalProtection.
    if (cfg.topicSafetyStatus) {
      ctx.subscribe(cfg.topicSafetyStatus, (p) => {
        const raw = ctx.extractPayloadValue(p, cfg.payloadSafetyStatusJsonPath);
        const val = Number(raw ?? 0);
        if (Number.isFinite(val)) {
          ctx.setAttr(ep, CID.WindowCovering, 'safetyStatus', val);
        }
      });
    }

    // Matter → MQTT: publish safetyStatus changes
    void ep.subscribeAttribute(
      'WindowCovering',
      'safetyStatus',
      (newValue: number) => {
        if (cfg.topicSetSafetyStatus) ctx.publish(cfg.topicSetSafetyStatus, String(newValue), cfg.retain);
      },
      ctx.log,
    );

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ window-covering "${cfg.name}"`);
  },
};
