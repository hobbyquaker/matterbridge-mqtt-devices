import { MicrowaveOven } from 'matterbridge/devices';

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

export const microwaveOvenDescriptor: DeviceDescriptor = {
  type: 'microwave-oven',
  editableKeys: {
    publish: ['topicSetOperationalState'],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      // operational state
      'topicOperationalState',
      'payloadOperationalStateJsonPath',
      'topicCountdownTime',
      'payloadCountdownTimeJsonPath',
      'topicCurrentPhase',
      'payloadCurrentPhaseJsonPath',
      'topicOperationalError',
      'payloadOperationalErrorJsonPath',
      // microwave mode
      'topicMicrowaveMode',
      'payloadMicrowaveModeJsonPath',
      // microwave control
      'topicCookTime',
      'payloadCookTimeJsonPath',
      'topicSelectedWattIndex',
      'payloadSelectedWattIndexJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadRunning', 'payloadStopped', 'payloadPaused'],
  },
  applyDefaults(cfg, baseTopic) {
    return {
      topicOperationalState: cfg.topicOperationalState ?? `${baseTopic}/operational-state`,
      topicSetOperationalState: cfg.topicSetOperationalState ?? `${baseTopic}/operational-state/set`,
      topicMicrowaveMode: cfg.topicMicrowaveMode ?? `${baseTopic}/mode`,
      topicCookTime: cfg.topicCookTime ?? `${baseTopic}/cook-time`,
      topicSelectedWattIndex: cfg.topicSelectedWattIndex ?? `${baseTopic}/watt`,
      topicCountdownTime: cfg.topicCountdownTime ?? `${baseTopic}/countdown`,
    };
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const RUNNING = cfg.payloadRunning ?? 'running';
    const STOPPED = cfg.payloadStopped ?? 'stopped';
    const PAUSED = cfg.payloadPaused ?? 'paused';

    const serial = cfg.type && cfg.serial ? `${cfg.type}:${cfg.serial}` : (cfg.serial ?? cfg.id ?? 'mqd-000');

    // MicrowaveOven single-class creates: OperationalState, MicrowaveOvenMode,
    // MicrowaveOvenControl (with PowerInWatts feature), PowerSource (wired), Identify, BasicInfo
    const ep = new MicrowaveOven(cfg.name, serial);
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

    // ── MQTT → Matter: microwave mode ────────────────────────────────────────
    // MicrowaveOvenMode uses a standard Matter.js server; setting currentMode
    // attribute from MQTT is supported; Matter → MQTT direction is not intercepted.

    if (cfg.topicMicrowaveMode) {
      ctx.subscribe(cfg.topicMicrowaveMode, (p) => {
        const val = ctx.parseFloatPayload(p, ['currentMode', 'mode', 'value'], cfg.payloadMicrowaveModeJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.MicrowaveOvenMode, 'currentMode', Math.round(val));
        }
      });
    }

    // ── MQTT → Matter: microwave control ────────────────────────────────────

    if (cfg.topicCookTime) {
      ctx.subscribe(cfg.topicCookTime, (p) => {
        const val = ctx.parseFloatPayload(p, ['cookTime', 'time', 'value'], cfg.payloadCookTimeJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.MicrowaveOvenControl, 'cookTime', Math.max(0, Math.round(val)));
        }
      });
    }

    if (cfg.topicSelectedWattIndex) {
      ctx.subscribe(cfg.topicSelectedWattIndex, (p) => {
        const val = ctx.parseFloatPayload(p, ['selectedWattIndex', 'watt', 'value'], cfg.payloadSelectedWattIndexJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.MicrowaveOvenControl, 'selectedWattIndex', Math.max(0, Math.round(val)));
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ microwave oven "${cfg.name}"`);
  },
};
