import { LaundryWasher } from 'matterbridge/devices';

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

export const laundryWasherDescriptor: DeviceDescriptor = {
  type: 'laundry-washer',
  editableKeys: {
    publish: ['topicSetOnOff', 'topicSetOperationalState', 'topicSetWasherMode', 'topicSetTemperatureLevel'],
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
      // washer mode
      'topicWasherMode',
      'payloadWasherModeJsonPath',
      // washer controls
      'topicSpinSpeed',
      'payloadSpinSpeedJsonPath',
      'topicNumberOfRinses',
      'payloadNumberOfRinsesJsonPath',
      // temperature control
      'topicTemperatureLevel',
      'payloadTemperatureLevelJsonPath',
    ],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadOn', 'payloadOff', 'payloadRunning', 'payloadStopped', 'payloadPaused'],
  },
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const PAYLOAD_ON = cfg.payloadOn ?? 'ON';
    const PAYLOAD_OFF = cfg.payloadOff ?? 'OFF';
    const RUNNING = cfg.payloadRunning ?? 'running';
    const STOPPED = cfg.payloadStopped ?? 'stopped';
    const PAUSED = cfg.payloadPaused ?? 'paused';

    // Compute serial the same way initEp would
    const serial = cfg.type && cfg.serial ? `${cfg.type}:${cfg.serial}` : (cfg.serial ?? cfg.id ?? 'mqd-000');

    // LaundryWasher single-class creates: OnOff, LaundryWasherMode, LaundryWasherControls,
    // TemperatureControl (level-based), OperationalState, PowerSource (wired), Identify, BasicInfo
    const ep = new LaundryWasher(cfg.name, serial);
    ctx.applyConfigUrl(ep, cfg);

    // ── OperationalState commands (Matter controller → MQTT) ─────────────────

    if (cfg.topicSetOperationalState) {
      const opTopic = cfg.topicSetOperationalState;
      ctx.onCmd(ep, 'OperationalState.start', () => ctx.publish(opTopic, RUNNING, cfg.retain));
      ctx.onCmd(ep, 'OperationalState.stop', () => ctx.publish(opTopic, STOPPED, cfg.retain));
      ctx.onCmd(ep, 'OperationalState.pause', () => ctx.publish(opTopic, PAUSED, cfg.retain));
      ctx.onCmd(ep, 'OperationalState.resume', () => ctx.publish(opTopic, RUNNING, cfg.retain));
    }

    // ── OnOff commands (Matter controller → MQTT) ────────────────────────────

    if (cfg.topicSetOnOff) {
      const setTopic = cfg.topicSetOnOff;
      ctx.onCmd(ep, 'on', () => ctx.publish(setTopic, PAYLOAD_ON, cfg.retain));
      ctx.onCmd(ep, 'off', () => ctx.publish(setTopic, PAYLOAD_OFF, cfg.retain));
    }

    // ── LaundryWasherMode command (Matter controller → MQTT) ─────────────────

    ctx.onCmd(ep, 'LaundryWasherMode.changeToMode', (data: unknown) => {
      const req = data as { request?: { newMode?: number } };
      const mode = req?.request?.newMode;
      if (mode !== undefined && cfg.topicSetWasherMode) {
        ctx.publish(cfg.topicSetWasherMode, String(mode), cfg.retain);
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

    // ── MQTT → Matter: washer mode ───────────────────────────────────────────

    if (cfg.topicWasherMode) {
      ctx.subscribe(cfg.topicWasherMode, (p) => {
        const val = ctx.parseFloatPayload(p, ['currentMode', 'mode', 'value'], cfg.payloadWasherModeJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.LaundryWasherMode, 'currentMode', Math.round(val));
        }
      });
    }

    // ── MQTT → Matter: washer controls ──────────────────────────────────────

    if (cfg.topicSpinSpeed) {
      ctx.subscribe(cfg.topicSpinSpeed, (p) => {
        const val = ctx.parseFloatPayload(p, ['spinSpeedCurrent', 'spinSpeed', 'value'], cfg.payloadSpinSpeedJsonPath);
        if (val !== null && !isNaN(val)) {
          ctx.setAttr(ep, CID.LaundryWasherControls, 'spinSpeedCurrent', Math.round(val));
        }
      });
    }

    if (cfg.topicNumberOfRinses) {
      ctx.subscribe(cfg.topicNumberOfRinses, (p) => {
        const val = ctx.parseFloatPayload(p, ['numberOfRinses', 'rinses', 'value'], cfg.payloadNumberOfRinsesJsonPath);
        if (val !== null && !isNaN(val)) {
          // 0=None, 1=Normal, 2=Extra, 3=Max
          ctx.setAttr(ep, CID.LaundryWasherControls, 'numberOfRinses', Math.round(val));
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
    ctx.log.info(`✓ laundry washer "${cfg.name}"`);
  },
};
