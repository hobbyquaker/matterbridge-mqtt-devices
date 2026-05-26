import { MatterbridgeEndpoint, powerSource, smokeCoAlarm } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_KEYS } from './types.js';

/** SmokeCoAlarm.AlarmState (Matter spec): Normal=0, Warning=1, Critical=2. */
const AlarmState = { Normal: 0, Warning: 1, Critical: 2 } as const;

/**
 * Maps a payload string to a SmokeCoAlarm AlarmState value.
 *
 * @param {string} payload - The MQTT payload string.
 * @param {string} normal - Payload value for normal state.
 * @param {string} warning - Payload value for warning state.
 * @param {string} critical - Payload value for critical state.
 * @returns {number} The AlarmState value (0=Normal, 1=Warning, 2=Critical).
 */
function parseAlarmState(payload: string, normal: string, warning: string, critical: string): number {
  if (payload === critical) return AlarmState.Critical;
  if (payload === warning) return AlarmState.Warning;
  return AlarmState.Normal;
}

export const smokeAlarmDescriptor: DeviceDescriptor = {
  type: 'smoke_alarm',
  editableKeys: [...COMMON_KEYS, 'stateTopic', 'stateJsonPath', 'payloadAlarmNormal', 'payloadAlarmWarning', 'payloadAlarmCritical', 'coStateTopic', 'coStateJsonPath'],
  applyDefaults(_cfg, _baseTopic) {
    return {};
  },
  async create(ctx: DeviceContext, cfg: MqttDeviceConfig): Promise<void> {
    const NORMAL = cfg.payloadAlarmNormal ?? 'normal';
    const WARNING = cfg.payloadAlarmWarning ?? 'warning';
    const CRITICAL = cfg.payloadAlarmCritical ?? 'critical';

    const ep = new MatterbridgeEndpoint([smokeCoAlarm, powerSource]);
    ctx.initEp(ep, cfg, 0x8012);
    ctx.applyConfigUrl(ep, cfg);
    ep.createDefaultSmokeCOAlarmClusterServer(AlarmState.Normal, AlarmState.Normal);

    if (cfg.stateTopic) {
      ctx.subscribe(cfg.stateTopic, (p) => {
        const payload = String(ctx.extractPayloadValue(p, cfg.stateJsonPath) ?? p).trim();
        const state = parseAlarmState(payload, NORMAL, WARNING, CRITICAL);
        ctx.log.info(`[${cfg.name}] ? smokeState ${state} (payload "${payload}")`);
        ctx.setAttr(ep, CID.SmokeCoAlarm, 'smokeState', state);
      });
    }
    if (cfg.coStateTopic) {
      ctx.subscribe(cfg.coStateTopic, (p) => {
        const payload = String(ctx.extractPayloadValue(p, cfg.coStateJsonPath) ?? p).trim();
        const state = parseAlarmState(payload, NORMAL, WARNING, CRITICAL);
        ctx.log.info(`[${cfg.name}] ? coState ${state} (payload "${payload}")`);
        ctx.setAttr(ep, CID.SmokeCoAlarm, 'coState', state);
      });
    }

    await ctx.registerDevice(ep);
    ctx.subscribeToAvailabilityAndBattery(ep, cfg);
    ctx.endpointMap.set(cfg.id ?? '', ep);
    ctx.log.info(`? smoke/CO alarm "${cfg.name}"`);
  },
};
