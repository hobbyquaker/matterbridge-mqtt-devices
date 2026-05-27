import { MatterbridgeEndpoint, powerSource, smokeCoAlarm } from 'matterbridge';

import type { DeviceContext, DeviceDescriptor, MqttDeviceConfig } from './types.js';
import { CID, COMMON_SETTINGS_KEYS, COMMON_SUBSCRIBE_KEYS } from './types.js';

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

export const smokeCoAlarmDescriptor: DeviceDescriptor = {
  type: 'smoke-co-alarm',
  editableKeys: {
    publish: [],
    subscribe: [...COMMON_SUBSCRIBE_KEYS, 'topicOnOff', 'payloadOnOffJsonPath', 'topicCo', 'payloadCoJsonPath'],
    settings: [...COMMON_SETTINGS_KEYS, 'payloadAlarmNormal', 'payloadAlarmWarning', 'payloadAlarmCritical'],
  },
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

    if (cfg.topicOnOff) {
      ctx.subscribe(cfg.topicOnOff, (p) => {
        const payload = String(ctx.extractPayloadValue(p, cfg.payloadOnOffJsonPath) ?? p).trim();
        const state = parseAlarmState(payload, NORMAL, WARNING, CRITICAL);
        ctx.log.info(`[${cfg.name}] ? smokeState ${state} (payload "${payload}")`);
        ctx.setAttr(ep, CID.SmokeCoAlarm, 'smokeState', state);
      });
    }
    if (cfg.topicCo) {
      ctx.subscribe(cfg.topicCo, (p) => {
        const payload = String(ctx.extractPayloadValue(p, cfg.payloadCoJsonPath) ?? p).trim();
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
