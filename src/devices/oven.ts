import { Oven } from 'matterbridge/devices';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

/**
 * @param {string} p - Raw MQTT payload string.
 * @param {MqttDeviceConfig} cfg - Device config with optional custom payload values.
 * @param {DeviceContext} ctx - Device context for payload extraction helpers.
 * @returns {number | null} Matter OvenCavityOperationalState enum value, or null if unrecognised.
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

export const ovenDescriptor: DeviceDescriptor = {
  type: 'oven',
  editableKeys: {
    publish: ['topicSetOperationalState', 'topicSetOvenMode', 'topicSetTargetTemp'],
    subscribe: [
      ...COMMON_SUBSCRIBE_KEYS,
      // oven cavity operational state
      'topicOperationalState',
      'payloadOperationalStateJsonPath',
      'topicCountdownTime',
      'payloadCountdownTimeJsonPath',
      'topicCurrentPhase',
      'payloadCurrentPhaseJsonPath',
      'topicOperationalError',
      'payloadOperationalErrorJsonPath',
      // oven mode
      'topicOvenMode',
      'payloadOvenModeJsonPath',
      // temperature measurement (cavity actual temperature)
      'topicTemperature',
      'payloadTemperatureJsonPath',
      // temperature control (target setpoint)
      'topicTargetTemp',
      'payloadTargetTempJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadRunning', 'payloadStopped', 'payloadPaused'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const RUNNING = cfg.payloadRunning ?? 'running';
    const STOPPED = cfg.payloadStopped ?? 'stopped';
    const PAUSED = cfg.payloadPaused ?? 'paused';

    const serial = cfg.type && cfg.serial ? `${cfg.type}:${cfg.serial}` : (cfg.serial ?? cfg.id ?? 'mqd-000');

    // Oven single-class creates a composed device: main endpoint (oven + powerSource)
    // with child "cabinet" endpoints added via addCabinet(). Each cabinet has:
    // OvenMode, OvenCavityOperationalState, TemperatureControl (numeric), TemperatureMeasurement.
    const ep = new Oven(cfg.name, serial);
    ctx.applyConfigUrl(ep, cfg);

    // Add the single oven cavity
    const cabinet = ep.addCabinet('Oven Cavity', []);

    // ── OvenCavityOperationalState commands (Matter controller → MQTT) ────────

    if (cfg.topicSetOperationalState) {
      const opTopic = cfg.topicSetOperationalState;
      ctx.onCmd(cabinet, 'OvenCavityOperationalState.start', () => ctx.publish(opTopic, RUNNING, cfg.retain));
      ctx.onCmd(cabinet, 'OvenCavityOperationalState.stop', () => ctx.publish(opTopic, STOPPED, cfg.retain));
      ctx.onCmd(cabinet, 'OvenCavityOperationalState.pause', () => ctx.publish(opTopic, PAUSED, cfg.retain));
      ctx.onCmd(cabinet, 'OvenCavityOperationalState.resume', () => ctx.publish(opTopic, RUNNING, cfg.retain));
    }

    // ── OvenMode command (Matter controller → MQTT) ──────────────────────────

    ctx.onCmd(cabinet, 'OvenMode.changeToMode', (data: unknown) => {
      const req = data as { request?: { newMode?: number } };
      const mode = req?.request?.newMode;
      if (mode !== undefined && cfg.topicSetOvenMode) {
        ctx.publish(cfg.topicSetOvenMode, String(mode), cfg.retain);
      }
    });

    // ── MQTT → Matter: operational state ────────────────────────────────────

    if (cfg.topicOperationalState) {
      ctx.subscribe(cfg.topicOperationalState, (p) => {
        const state = parseOperationalState(p, cfg, ctx);
        if (state !== null) ctx.setAttr(cabinet, CID.OvenCavityOperationalState, 'operationalState', state);
      });
    }

    if (cfg.topicCountdownTime) {
      ctx.subscribe(cfg.topicCountdownTime, (p) => {
        const val = ctx.parseFloatPayload(p, ['countdownTime', 'remaining', 'value'], cfg.payloadCountdownTimeJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(cabinet, CID.OvenCavityOperationalState, 'countdownTime', Math.max(0, Math.round(val)));
        }
      });
    }

    if (cfg.topicCurrentPhase) {
      ctx.subscribe(cfg.topicCurrentPhase, (p) => {
        const val = ctx.parseFloatPayload(p, ['currentPhase', 'phase', 'value'], cfg.payloadCurrentPhaseJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(cabinet, CID.OvenCavityOperationalState, 'currentPhase', Math.round(val));
        }
      });
    }

    if (cfg.topicOperationalError) {
      ctx.subscribe(cfg.topicOperationalError, (p) => {
        const val = ctx.parseFloatPayload(p, ['errorStateId', 'error', 'value'], cfg.payloadOperationalErrorJsonPath);
        const errorId = val !== null && !isNaN(val) ? Math.round(val) : 0;
        ctx.setAttr(cabinet, CID.OvenCavityOperationalState, 'operationalError', { errorStateId: errorId });
      });
    }

    // ── MQTT → Matter: oven mode ─────────────────────────────────────────────

    if (cfg.topicOvenMode) {
      ctx.subscribe(cfg.topicOvenMode, (p) => {
        const val = ctx.parseFloatPayload(p, ['currentMode', 'mode', 'value'], cfg.payloadOvenModeJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(cabinet, CID.OvenMode, 'currentMode', Math.round(val));
        }
      });
    }

    // ── MQTT → Matter: cavity temperature (measured value) ───────────────────

    if (cfg.topicTemperature) {
      ctx.subscribe(cfg.topicTemperature, (p) => {
        const c = ctx.parseFloatPayload(p, ['temperature', 'temp', 'cavity_temperature', 'value'], cfg.payloadTemperatureJsonPath);
        if (c !== null && !isNaN(c)) {
          ctx.setAttr(cabinet, CID.TemperatureMeasurement, 'measuredValue', Math.round(c * 100));
        }
      });
    }

    // ── MQTT → Matter: target temperature setpoint (0.01 °C units) ──────────

    if (cfg.topicTargetTemp) {
      ctx.subscribe(cfg.topicTargetTemp, (p) => {
        const c = ctx.parseFloatPayload(p, ['targetTemperature', 'target', 'setpoint', 'value'], cfg.payloadTargetTempJsonPath);
        if (c !== null && !isNaN(c)) {
          // Clamp to default cabinet range 30–300 °C
          const clamped = Math.min(30000, Math.max(3000, Math.round(c * 100)));
          ctx.setAttr(cabinet, CID.TemperatureControl, 'temperatureSetpoint', clamped);
        }
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`✓ oven "${cfg.name}"`);
  },
};
