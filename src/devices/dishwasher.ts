import { Dishwasher } from 'matterbridge/devices';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

/**
 * @param {string} p - Raw MQTT payload string.
 * @param {MqttDeviceConfig} cfg - Device config with optional custom payload values.
 * @param {DeviceContext} ctx - Device context for payload extraction helpers.
 * @returns {number | null} Matter OperationalState enum value, or null if unrecognised.
 */
function parseOperationalState(p: string, cfg: MqttDeviceConfig, ctx: DeviceContext): number | null {
  const RUNNING = cfg.payloadRunning ?? 'running';
  const STOPPED = cfg.payloadStopped ?? 'stopped';
  const PAUSED = cfg.payloadPaused ?? 'paused';
  const raw = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadOperationalStateJsonPath));
  if (raw === RUNNING) return 1;
  if (raw === STOPPED) return 0;
  if (raw === PAUSED) return 2;
  if (raw === 'error') return 3;
  return null;
}

export const dishwasherDescriptor: DeviceDescriptor = {
  type: 'dishwasher',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicSetOperationalState', 'topicSetDishwasherMode'],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      // on/off power state
      'topicOnOff',
      'payloadOnOffJsonPath',
      // operational state
      'topicOperationalState',
      'payloadOperationalStateJsonPath',
      'topicCountdownTime',
      'payloadCountdownTimeJsonPath',
      'topicCurrentPhase',
      'payloadCurrentPhaseJsonPath',
      'topicOperationalError',
      'payloadOperationalErrorJsonPath',
      // dishwasher mode
      'topicDishwasherMode',
      'payloadDishwasherModeJsonPath',
      // dishwasher alarm
      'topicDishwasherAlarm',
      'payloadDishwasherAlarmJsonPath',
      // temperature control
      'topicTemperatureLevel',
      'payloadTemperatureLevelJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'payloadRunning', 'payloadStopped', 'payloadPaused'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicOnOff: cfg.topicOnOff ?? `${baseTopic}/state`,
      topicSetOnOff: cfg.topicSetOnOff ?? `${baseTopic}/set`,
      topicOperationalState: cfg.topicOperationalState ?? `${baseTopic}/operational-state`,
      topicSetOperationalState: cfg.topicSetOperationalState ?? `${baseTopic}/operational-state/set`,
      topicDishwasherMode: cfg.topicDishwasherMode ?? `${baseTopic}/mode`,
      topicSetDishwasherMode: cfg.topicSetDishwasherMode ?? `${baseTopic}/mode/set`,
      topicTemperatureLevel: cfg.topicTemperatureLevel ?? `${baseTopic}/temperature`,
      topicCountdownTime: cfg.topicCountdownTime ?? `${baseTopic}/countdown`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const PAYLOAD_ON = cfg.payloadOn ?? 'ON';
    const PAYLOAD_OFF = cfg.payloadOff ?? 'OFF';
    const RUNNING = cfg.payloadRunning ?? 'running';
    const STOPPED = cfg.payloadStopped ?? 'stopped';
    const PAUSED = cfg.payloadPaused ?? 'paused';

    const serial = cfg.type && cfg.serial ? `${cfg.type}:${cfg.serial}` : (cfg.serial ?? cfg.id ?? 'mqd-000');

    // Dishwasher single-class creates: OnOff (DeadFront), DishwasherMode,
    // DishwasherAlarm, TemperatureControl (level-based), OperationalState,
    // PowerSource (wired), Identify, BasicInfo
    const ep = new Dishwasher(cfg.name, serial);
    ctx.applyConfigUrl(ep, cfg);

    // ── OperationalState commands (Matter controller → MQTT) ─────────────────

    ctx.onCmd(ep, 'OperationalState.start', () => {
      if (cfg.topicSetOperationalState) ctx.publish(cfg.topicSetOperationalState, RUNNING, cfg.retain);
    });
    ctx.onCmd(ep, 'OperationalState.stop', () => {
      if (cfg.topicSetOperationalState) ctx.publish(cfg.topicSetOperationalState, STOPPED, cfg.retain);
    });
    ctx.onCmd(ep, 'OperationalState.pause', () => {
      if (cfg.topicSetOperationalState) ctx.publish(cfg.topicSetOperationalState, PAUSED, cfg.retain);
    });
    ctx.onCmd(ep, 'OperationalState.resume', () => {
      if (cfg.topicSetOperationalState) ctx.publish(cfg.topicSetOperationalState, RUNNING, cfg.retain);
    });

    // ── OnOff commands (Matter controller → MQTT) ────────────────────────────

    ctx.onCmd(ep, 'on', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, PAYLOAD_ON, cfg.retain);
    });
    ctx.onCmd(ep, 'off', () => {
      if (cfg.topicSetOnOff) ctx.publish(cfg.topicSetOnOff, PAYLOAD_OFF, cfg.retain);
    });

    // ── DishwasherMode command (Matter controller → MQTT) ────────────────────

    ctx.onCmd(ep, 'DishwasherMode.changeToMode', (data: unknown) => {
      const req = data as { request?: { newMode?: number } };
      const mode = req?.request?.newMode;
      if (mode !== undefined && cfg.topicSetDishwasherMode) {
        ctx.publish(cfg.topicSetDishwasherMode, String(mode), cfg.retain);
      }
    });

    // ── MQTT → Matter: power state ───────────────────────────────────────────

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const state = ctx.toPayloadString(ctx.extractPayloadValue(p, cfg.payloadOnOffJsonPath));
        const isOn = state === PAYLOAD_ON || state === 'true' || state === '1';
        ctx.setAttr(ep, CID.OnOff, 'onOff', isOn);
      });
    }

    // ── MQTT → Matter: operational state ────────────────────────────────────

    if (cfg.topicOperationalState) {
      ctx.subscribe(cfg.topicOperationalState, (p) => {
        const state = parseOperationalState(p, cfg, ctx);
        if (state !== null) ctx.setAttr(ep, CID.OperationalState, 'operationalState', state);
      });
    }

    if (cfg.topicCountdownTime) {
      ctx.subscribe(cfg.topicCountdownTime, (p) => {
        const val = ctx.parseFloatPayload(p, ['countdownTime', 'remaining', 'value'], cfg.payloadCountdownTimeJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.OperationalState, 'countdownTime', Math.max(0, Math.round(val)));
        }
      });
    }

    if (cfg.topicCurrentPhase) {
      ctx.subscribe(cfg.topicCurrentPhase, (p) => {
        const val = ctx.parseFloatPayload(p, ['currentPhase', 'phase', 'value'], cfg.payloadCurrentPhaseJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.OperationalState, 'currentPhase', Math.round(val));
        }
      });
    }

    if (cfg.topicOperationalError) {
      ctx.subscribe(cfg.topicOperationalError, (p) => {
        const val = ctx.parseFloatPayload(p, ['errorStateId', 'error', 'value'], cfg.payloadOperationalErrorJsonPath);
        const errorId = val !== null && !isNaN(val) ? Math.round(val) : 0;
        ctx.setAttr(ep, CID.OperationalState, 'operationalError', { errorStateId: errorId });
      });
    }

    // ── MQTT → Matter: dishwasher mode ──────────────────────────────────────

    if (cfg.topicDishwasherMode) {
      ctx.subscribe(cfg.topicDishwasherMode, (p) => {
        const val = ctx.parseFloatPayload(p, ['currentMode', 'mode', 'value'], cfg.payloadDishwasherModeJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.DishwasherMode, 'currentMode', Math.round(val));
        }
      });
    }

    // ── MQTT → Matter: dishwasher alarm ─────────────────────────────────────
    // Expects a JSON object: {"inflowError":bool,"drainError":bool,"doorError":bool,
    //                         "tempTooLow":bool,"tempTooHigh":bool,"waterLevelError":bool}

    if (cfg.topicDishwasherAlarm) {
      ctx.subscribe(cfg.topicDishwasherAlarm, (p) => {
        try {
          const raw = ctx.extractPayloadValue(p, cfg.payloadDishwasherAlarmJsonPath);
          const obj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : JSON.parse(ctx.toPayloadString(raw));
          const toBool = (v: unknown): boolean => v === true || v === 'true' || v === 1;
          ctx.setAttr(ep, CID.DishwasherAlarm, 'state', {
            inflowError: toBool(obj['inflowError']),
            drainError: toBool(obj['drainError']),
            doorError: toBool(obj['doorError']),
            tempTooLow: toBool(obj['tempTooLow']),
            tempTooHigh: toBool(obj['tempTooHigh']),
            waterLevelError: toBool(obj['waterLevelError']),
          });
        } catch {
          // ignore malformed alarm payloads
        }
      });
    }

    // ── MQTT → Matter: temperature level ────────────────────────────────────

    if (cfg.topicTemperatureLevel) {
      ctx.subscribe(cfg.topicTemperatureLevel, (p) => {
        const val = ctx.parseFloatPayload(p, ['selectedTemperatureLevel', 'level', 'value'], cfg.payloadTemperatureLevelJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.TemperatureControl, 'selectedTemperatureLevel', Math.round(val));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ dishwasher "${cfg.name}"`);
  },
};
