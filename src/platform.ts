/**
 * matterbridge-mqtt-devices — MqttPlatform
 * Compatible Matterbridge v3.x
 */

// ── Matterbridge ──────────────────────────────────────────────────────────────
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { getAttribute, MatterbridgeDynamicPlatform, MatterbridgeEndpoint, setAttribute } from 'matterbridge';
// ── Logger ────────────────────────────────────────────────────────────────────
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
// ── MQTT ──────────────────────────────────────────────────────────────────────
import mqtt, { IClientOptions, MqttClient } from 'mqtt';

import type { AnyHandler, ComposedComponentDef, DeviceContext, EditableDeviceKey, EditableKeyGroups, MqttDeviceConfig } from './devices/index.js';
// ── Device registry ───────────────────────────────────────────────────────────────
import { ALL_EDITABLE_KEYS, findDescriptor, NUMBER_KEYS } from './devices/index.js';

// ── Platform ──────────────────────────────────────────────────────────────────

export class MqttPlatform extends MatterbridgeDynamicPlatform {
  private mqttClient: MqttClient | undefined;
  private topicHandlers = new Map<string, Array<(p: string) => void>>();
  private endpointMap = new Map<string, MatterbridgeEndpoint>();
  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);
    this.log.logName = 'MqttDevices';
    if (this.config['debug']) this.log.logLevel = LogLevel.DEBUG;
    this.log.info('MqttPlatform created');
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  override async onStart(reason?: string): Promise<void> {
    this.log.info(`onStart: ${reason ?? '-'}`);
    await this.connectMqtt();

    // Ensure whiteList and blackList are defined so the Matterbridge UI
    // can show the enable/disable checkbox for each device.
    if (!Array.isArray(this.config['whiteList'])) this.config['whiteList'] = [];
    if (!Array.isArray(this.config['blackList'])) this.config['blackList'] = [];

    const devices: MqttDeviceConfig[] = (this.config['devices'] as MqttDeviceConfig[]) ?? [];
    if (!devices.length) {
      this.log.warn('No devices configured.');
      return;
    }

    for (let i = 0; i < devices.length; i++) {
      const cfg = this.applyDeviceDefaults(devices[i], i);
      this.registerSelectableDevice(cfg);
      if (!this.isDeviceEnabled(cfg)) {
        this.log.info(`[${cfg.name}] skipped (disabled by whiteList/blackList selection)`);
        continue;
      }
      try {
        await this.createDevice(cfg);
      } catch (err) {
        this.log.error(`Device "${cfg.id}" failed: ${err}`);
      }
    }
  }

  override async onConfigure(): Promise<void> {
    this.log.info('onConfigure: all devices ready');
    return Promise.resolve();
  }

  override async onShutdown(reason?: string): Promise<void> {
    this.log.info(`onShutdown: ${reason ?? '-'}`);
    if (this.mqttClient?.connected) {
      await this.mqttClient.endAsync();
      this.log.info('MQTT disconnected');
    }
  }

  // ── MQTT ───────────────────────────────────────────────────────────────────

  private async connectMqtt(): Promise<void> {
    const broker = (this.config['broker'] as string) ?? 'mqtt://localhost:1883';
    const username = (this.config['username'] as string) ?? '';
    const password = (this.config['password'] as string) ?? '';
    const clientId = (this.config['clientId'] as string) ?? `mb_mqtt_${Math.random().toString(16).slice(2, 8)}`;

    const opts: IClientOptions = {
      clientId,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 10_000,
    };
    if (username) opts.username = username;
    if (password) opts.password = password;

    this.log.info(`MQTT → ${broker} [${clientId}]`);

    return new Promise((resolve, reject) => {
      this.mqttClient = mqtt.connect(broker, opts);
      this.mqttClient.once('connect', () => {
        this.log.info('MQTT connected ✓');
        resolve();
      });
      this.mqttClient.once('error', (e) => {
        this.log.error(`MQTT error: ${e.message}`);
        reject(e);
      });
      this.mqttClient.on('reconnect', () => this.log.warn('MQTT reconnecting…'));
      this.mqttClient.on('message', (topic, buf) => {
        const payload = buf.toString().trim();
        const handlers = this.topicHandlers.get(topic);
        if (!handlers) {
          this.log.warn(`← [${topic}] no handler registered for this topic`);
          return;
        }
        handlers.forEach((h) => {
          try {
            h(payload);
          } catch (e) {
            this.log.error(`Handler [${topic}]: ${e}`);
          }
        });
      });
    });
  }

  private subscribe(topic: string, handler: (p: string) => void): void {
    if (!this.mqttClient) return;
    const list = this.topicHandlers.get(topic);
    if (list) {
      list.push(handler);
      return;
    }
    this.topicHandlers.set(topic, [handler]);
    this.mqttClient.subscribe(topic, (err) => {
      if (err) this.log.error(`Subscribe failed [${topic}]: ${err.message}`);
      else this.log.info(`subscribed → ${topic}`);
    });
  }

  private publish(topic: string, payload: string, retain = false): void {
    if (!this.mqttClient?.connected) {
      this.log.warn(`Not connected, skip [${topic}]`);
      return;
    }
    this.mqttClient.publish(topic, payload, { retain, qos: 1 });
    this.log.debug(`→ [${topic}] ${payload}`);
  }

  // ── HTTP API ─────────────────────────────────────────────────────────────

  override async onFetch(method: string, path?: string, query?: Record<string, unknown>, body?: unknown): Promise<unknown> {
    if (path !== 'config') return undefined;

    if (method === 'GET') {
      const deviceId = String(query?.['device'] ?? '');
      const cfg = this.findConfiguredDeviceById(deviceId);
      if (!cfg) return undefined;

      const descriptor = findDescriptor(cfg.type);
      const componentDefs: readonly ComposedComponentDef[] | null = descriptor?.componentDefs ?? null;
      const groups = this.getEditableKeyGroups(cfg.type);
      const allKeys = [...groups.publish, ...groups.subscribe, ...groups.settings];
      const values: Record<string, unknown> = {};
      for (const key of allKeys) values[key] = (cfg as unknown as Record<string, unknown>)[key] ?? '';
      values['retain'] = cfg.retain === true;
      values['batteryValueBased'] = cfg.batteryValueBased === true;
      if (Array.isArray(values['components'])) {
        values['components'] = (values['components'] as string[]).join(',');
      }
      const title = `${cfg.name} (${cfg.type ?? 'unknown'})`;
      return { title, deviceId, values, groups, componentDefs };
    }

    if (method === 'POST') {
      // Matterbridge does not apply express.json() to plugin API routes so
      // req.body is always undefined. All save parameters are sent as URL
      // query params instead; fall back to body if a future release fixes this.
      const params = (body && typeof body === 'object' ? body : query) as Record<string, unknown>;
      const deviceId = String(params?.['deviceId'] ?? '');
      if (!deviceId) return { ok: false, error: 'deviceId is required' };
      const updated = this.applyAdvancedValues(deviceId, params);
      if (!updated) return undefined;
      try {
        this.persistCurrentConfig();
        return { ok: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: `Save failed: ${message}` };
      }
    }

    return undefined;
  }

  // ── Config helpers (used by onFetch) ──────────────────────────────────────

  private findConfiguredDeviceById(deviceId: string): MqttDeviceConfig | undefined {
    const devices = (this.config['devices'] as MqttDeviceConfig[]) ?? [];
    for (let i = 0; i < devices.length; i++) {
      const effective = this.applyDeviceDefaults(devices[i], i);
      if (effective.id === deviceId) return effective;
    }
    return undefined;
  }

  private getEditableKeyGroups(type?: string): EditableKeyGroups {
    const descriptor = type ? findDescriptor(type) : undefined;
    return (
      descriptor?.editableKeys ?? {
        publish: [],
        subscribe: [],
        settings: ALL_EDITABLE_KEYS as EditableDeviceKey[],
      }
    );
  }

  private applyAdvancedValues(deviceId: string, payload: Record<string, unknown>): boolean {
    const devices = (this.config['devices'] as MqttDeviceConfig[]) ?? [];
    let index = -1;
    for (let i = 0; i < devices.length; i++) {
      if (this.applyDeviceDefaults(devices[i], i).id === deviceId) {
        index = i;
        break;
      }
    }
    if (index === -1) return false;

    const cfg = devices[index];
    const effectiveType = this.applyDeviceDefaults(cfg, index).type;
    const groups = this.getEditableKeyGroups(effectiveType);
    const allKeys = [...groups.publish, ...groups.subscribe, ...groups.settings];

    for (const key of allKeys) {
      if (!(key in payload)) continue;
      const raw = payload[key];
      if (key === 'retain' || key === 'batteryValueBased') {
        (cfg as unknown as Record<string, unknown>)[key] = raw === true || raw === 'true';
      } else if ((NUMBER_KEYS as readonly string[]).includes(key)) {
        const n = Number(raw);
        (cfg as unknown as Record<string, unknown>)[key] = Number.isFinite(n) ? n : undefined;
      } else if (key === 'components') {
        const str = String(raw ?? '').trim();
        (cfg as unknown as Record<string, unknown>)[key] = str
          ? str
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
      } else {
        (cfg as unknown as Record<string, unknown>)[key] = typeof raw === 'string' ? raw : String(raw ?? '');
      }
    }
    return true;
  }

  private persistCurrentConfig(): void {
    this.saveConfig(this.config);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getAttr(ep: MatterbridgeEndpoint, clusterId: number, attr: string): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getAttribute(ep, clusterId as any, attr, this.log);
  }

  private setAttr(ep: MatterbridgeEndpoint, clusterId: number, attr: string, value: unknown): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = getAttribute(ep, clusterId as any, attr, undefined);
    if (current === value) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void setAttribute(ep, clusterId as any, attr, value as any, this.log);
  }

  private initEp(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig, productId: number): void {
    const serial = cfg.type && cfg.serial ? `${cfg.type}:${cfg.serial}` : (cfg.serial ?? cfg.id ?? 'mqd-000');
    ep.createDefaultBasicInformationClusterServer(cfg.name, serial, 0xfff1, 'MQTT-Bridge', productId, 'matterbridge-mqtt-devices');
    ep.createDefaultIdentifyClusterServer();
  }

  private onCmd(ep: MatterbridgeEndpoint, cmd: string, fn: AnyHandler): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ep.addCommandHandler(cmd as any, fn as any);
  }

  private buildDeviceConfigUrl(cfg: MqttDeviceConfig): string {
    if (cfg.configUrl && cfg.configUrl.trim() !== '') return cfg.configUrl.trim();
    const deviceId = encodeURIComponent(cfg.id ?? 'unknown');
    return `/plugins/matterbridge-mqtt-devices/?device=${deviceId}`;
  }

  private applyConfigUrl(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig): void {
    const configUrl = this.buildDeviceConfigUrl(cfg);
    ep.configUrl = configUrl;
  }

  private subscribeToAvailabilityAndBattery(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig): void {
    // Availability / online state
    if (cfg.topicAvailability) {
      const onlinePayload = cfg.payloadOnline ?? 'online';
      this.subscribe(cfg.topicAvailability, (p) => {
        const state = this.toPayloadString(this.extractPayloadValue(p, cfg.payloadAvailabilityJsonPath));
        const isOnline = state === onlinePayload;
        this.log.info(`[${cfg.name}] availability: ${isOnline ? 'online' : 'offline'}`);
        // Set BridgedDeviceBasicInformation.reachable attribute
        const clusterIdBridgedInfo = 0x0039; // BridgedDeviceBasicInformation
        this.setAttr(ep, clusterIdBridgedInfo, 'reachable', isOnline);
      });
    }

    // Battery level
    if (cfg.topicBattery) {
      if (cfg.batteryValueBased) {
        // Value-based: expect numeric percentage 0-100 or custom range
        const min = cfg.batteryMin ?? 0;
        const max = cfg.batteryMax ?? 100;
        this.subscribe(cfg.topicBattery, (p) => {
          const raw = this.parseFloatPayload(p, ['battery', 'level', 'percent', 'value'], cfg.payloadBatteryJsonPath);
          if (raw !== null && !isNaN(raw)) {
            // Clamp and convert to 0-100 percentage
            const clamped = Math.max(min, Math.min(max, raw));
            const pct = Math.round(((clamped - min) / (max - min)) * 100);
            const clusterIdBridgedInfo = 0x0039;
            this.setAttr(ep, clusterIdBridgedInfo, 'batteryPercentageRemaining', pct * 2); // Matter uses 0-200 scale
            this.log.info(`[${cfg.name}] battery: ${pct}%`);
          }
        });
      } else {
        // Boolean-based: FULL or EMPTY payloads
        const fullPayload = cfg.payloadBatteryFull ?? 'full';
        const emptyPayload = cfg.payloadBatteryEmpty ?? 'empty';
        this.subscribe(cfg.topicBattery, (p) => {
          const state = this.toPayloadString(this.extractPayloadValue(p, cfg.payloadBatteryJsonPath));
          let pct = 50;
          if (state === fullPayload) pct = 100;
          else if (state === emptyPayload) pct = 0;
          const clusterIdBridgedInfo = 0x0039;
          this.setAttr(ep, clusterIdBridgedInfo, 'batteryPercentageRemaining', pct * 2);
          this.log.info(`[${cfg.name}] battery: ${state} (${pct}%)`);
        });
      }
    }
  }

  // ── Device factory ─────────────────────────────────────────────────────────

  private async createDevice(cfg: MqttDeviceConfig): Promise<void> {
    const descriptor = findDescriptor(cfg.type);
    if (!descriptor) {
      this.log.warn(`Unknown type "${cfg.type}" — skipping "${cfg.id}"`);
      return;
    }
    await descriptor.create(this.createDeviceContext(cfg), cfg);
  }

  private createDeviceContext(cfg: MqttDeviceConfig): DeviceContext {
    const deviceSubscribe = (topic: string, handler: (p: string) => void): void => {
      this.subscribe(topic, (payload) => {
        this.log.debug(`[${cfg.name}] \u2190 ${topic} ${payload}`);
        handler(payload);
      });
    };

    const deviceSetAttr = (ep: MatterbridgeEndpoint, clusterId: number, attr: string, value: unknown): void => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const current = getAttribute(ep, clusterId as any, attr, undefined);
      if (current === value) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void setAttribute(ep, clusterId as any, attr, value as any, this.log);
    };

    return {
      log: this.log,
      subscribe: deviceSubscribe,
      publish: this.publish.bind(this),
      getAttr: this.getAttr.bind(this),
      setAttr: deviceSetAttr,
      onCmd: this.onCmd.bind(this),
      initEp: this.initEp.bind(this),
      applyConfigUrl: this.applyConfigUrl.bind(this),
      registerDevice: this.registerDevice.bind(this),
      subscribeToAvailabilityAndBattery: this.subscribeToAvailabilityAndBattery.bind(this),
      endpointMap: this.endpointMap,
      parseOnOff: this.parseOnOff.bind(this),
      parseFloatPayload: this.parseFloatPayload.bind(this),
      extractPayloadValue: this.extractPayloadValue.bind(this),
      toPayloadString: this.toPayloadString.bind(this),
      getBrightnessRange: this.getBrightnessRange.bind(this),
      matterLevelToMqttBrightness: this.matterLevelToMqttBrightness.bind(this),
      mqttBrightnessToMatterLevel: this.mqttBrightnessToMatterLevel.bind(this),
      getCoverPositionRange: this.getCoverPositionRange.bind(this),
      coverMatterPctToMqttPosition: this.coverMatterPctToMqttPosition.bind(this),
      coverMqttPositionToMatterPct: this.coverMqttPositionToMatterPct.bind(this),
    };
  }

  // ── Utility ────────────────────────────────────────────────────────────────

  // Lightweight path resolver: dot notation + array index, e.g. sensor.state.value or values[0].temp
  private extractPayloadValue(payload: string, jsonPath?: string): unknown {
    if (!jsonPath) return payload;

    let root: unknown;
    try {
      root = JSON.parse(payload);
    } catch {
      this.log.warn(`jsonPath "${jsonPath}" requires JSON payload, got: ${payload}`);
      return payload;
    }

    const normalizedPath = jsonPath.trim().replace(/^\$\./, '').replace(/^\$/, '');
    if (!normalizedPath) return root;

    const tokens: string[] = [];
    for (const part of normalizedPath.split('.')) {
      const matches = part.match(/[^[\]]+|\[\d+\]/g);
      if (!matches) continue;
      for (const match of matches) {
        if (match.startsWith('[') && match.endsWith(']')) {
          tokens.push(match.slice(1, -1));
        } else {
          tokens.push(match);
        }
      }
    }

    let current: unknown = root;
    for (const token of tokens) {
      if (current === null || current === undefined) return undefined;
      if (Array.isArray(current)) {
        const idx = Number(token);
        if (!Number.isInteger(idx)) return undefined;
        current = current[idx];
        continue;
      }
      if (typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[token];
    }
    return current;
  }

  private toPayloadString(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private parseFloatPayload(payload: string, keys: string[], jsonPath?: string): number | null {
    const extracted = this.extractPayloadValue(payload, jsonPath);
    if (jsonPath) {
      const v = parseFloat(this.toPayloadString(extracted));
      return isNaN(v) ? null : v;
    }

    try {
      const o = JSON.parse(payload) as Record<string, unknown>;
      for (const key of keys) {
        if (o[key] !== undefined) {
          const v = parseFloat(String(o[key]));
          return isNaN(v) ? null : v;
        }
      }
      const v = parseFloat(payload);
      return isNaN(v) ? null : v;
    } catch {
      const v = parseFloat(payload);
      return isNaN(v) ? null : v;
    }
  }

  private parseOnOff(payload: string, on: string, off: string, jsonPath?: string): boolean | null {
    const extracted = this.toPayloadString(this.extractPayloadValue(payload, jsonPath));

    if (extracted === on) return true;
    if (extracted === off) return false;
    if (jsonPath) {
      const u = extracted.toUpperCase();
      if (u === 'ON' || u === '1' || u === 'TRUE') return true;
      if (u === 'OFF' || u === '0' || u === 'FALSE') return false;
      this.log.warn(`parseOnOff: unrecognized payload "${extracted}" with path "${jsonPath}"`);
      return null;
    }

    try {
      const o = JSON.parse(payload) as Record<string, unknown>;
      const s = String(o['state'] ?? o['value'] ?? o['power'] ?? '').toUpperCase();
      if (s === 'ON' || s === '1' || s === 'TRUE') return true;
      if (s === 'OFF' || s === '0' || s === 'FALSE') return false;
    } catch {
      /* pas JSON */
    }
    const u = extracted.toUpperCase();
    if (u === 'ON' || u === '1' || u === 'TRUE') return true;
    if (u === 'OFF' || u === '0' || u === 'FALSE') return false;
    this.log.warn(`parseOnOff: unrecognized payload "${extracted}"`);
    return null;
  }

  private getBrightnessRange(cfg: MqttDeviceConfig): { min: number; max: number } {
    const min = Number.isFinite(cfg.brightnessMin) ? Number(cfg.brightnessMin) : 0;
    const max = Number.isFinite(cfg.brightnessMax) ? Number(cfg.brightnessMax) : 100;

    if (max <= min) {
      this.log.warn(`[${cfg.name}] invalid brightness range (${min}-${max}), fallback to 0-100`);
      return { min: 0, max: 100 };
    }
    return { min, max };
  }

  private matterLevelToMqttBrightness(level254: number, min: number, max: number): number {
    const clampedLevel = Math.max(0, Math.min(254, Math.round(level254)));
    return Math.round(min + (clampedLevel / 254) * (max - min));
  }

  private mqttBrightnessToMatterLevel(rawBrightness: number, min: number, max: number): number {
    const clamped = Math.max(min, Math.min(max, rawBrightness));
    const normalized = (clamped - min) / (max - min);
    return Math.round(normalized * 254);
  }

  private getCoverPositionRange(cfg: MqttDeviceConfig): { min: number; max: number } {
    const min = Number.isFinite(cfg.positionMin) ? Number(cfg.positionMin) : 0;
    const max = Number.isFinite(cfg.positionMax) ? Number(cfg.positionMax) : 100;

    if (max <= min) {
      this.log.warn(`[${cfg.name}] invalid cover position range (${min}-${max}), fallback to 0-100`);
      return { min: 0, max: 100 };
    }
    return { min, max };
  }

  private coverMatterPctToMqttPosition(matterPct: number, min: number, max: number): number {
    const clampedPct = Math.max(0, Math.min(100, Math.round(matterPct)));
    return Math.round(min + (clampedPct / 100) * (max - min));
  }

  private coverMqttPositionToMatterPct(mqttPosition: number, min: number, max: number): number {
    const clamped = Math.max(min, Math.min(max, mqttPosition));
    const normalized = (clamped - min) / (max - min);
    return Math.round(normalized * 100);
  }

  private getWhiteList(): string[] {
    const list = this.config['whiteList'];
    return Array.isArray(list) ? list.map((item) => String(item).trim()).filter((item) => item !== '') : [];
  }

  private getBlackList(): string[] {
    const list = this.config['blackList'];
    return Array.isArray(list) ? list.map((item) => String(item).trim()).filter((item) => item !== '') : [];
  }

  private registerSelectableDevice(cfg: MqttDeviceConfig): void {
    const setSelectDevice = (this as unknown as { setSelectDevice?: (...args: unknown[]) => void }).setSelectDevice;
    if (typeof setSelectDevice !== 'function') return;
    const configUrl = this.buildDeviceConfigUrl(cfg);
    const serial = cfg.serial ?? cfg.id ?? 'mqd-000';
    const selector = cfg.type ? `${cfg.type}:${serial}` : serial;
    setSelectDevice.call(this, selector, cfg.name, configUrl, 'wifi');
  }

  private isDeviceEnabled(cfg: MqttDeviceConfig): boolean {
    if (cfg.enabled === false) return false;
    const validateDevice = (this as unknown as { validateDevice?: (selector: string | string[], strict?: boolean) => boolean }).validateDevice;
    const serial = cfg.serial ?? cfg.id ?? 'mqd-000';
    const selector = cfg.type ? `${cfg.type}:${serial}` : serial;
    if (typeof validateDevice === 'function') {
      return validateDevice.call(
        this,
        [cfg.name, cfg.id, selector].filter((v): v is string => v !== undefined),
        true,
      );
    }

    const whiteList = this.getWhiteList();
    const blackList = this.getBlackList();
    const selectors = [cfg.name, cfg.id, selector].filter((value): value is string => typeof value === 'string' && value.trim() !== '');

    if (whiteList.length > 0 && !selectors.some((value) => whiteList.includes(value))) {
      return false;
    }
    if (blackList.length > 0 && selectors.some((value) => blackList.includes(value))) {
      return false;
    }
    return true;
  }

  private applyDeviceDefaults(cfg: MqttDeviceConfig, index: number): MqttDeviceConfig {
    const type = cfg.type ?? 'on-off-outlet';
    const name = (cfg.name ?? '').trim() || `Device ${index + 1}`;
    const id = (cfg.id ?? '').trim() || this.slugify(name) || `${type}_${index + 1}`;
    const serial = `mqd-${String(index + 1).padStart(3, '0')}`;
    const baseTopic = `matterbridge/${id}`;

    const typeDefaults = findDescriptor(type)?.applyDefaults(cfg, baseTopic) ?? {};

    const withDefaults: MqttDeviceConfig = {
      ...cfg,
      ...typeDefaults,
      id,
      serial,
      name,
      type,
      topicOnOff: cfg.topicOnOff ?? `${baseTopic}/state`,
    };

    if (!cfg.id) {
      this.log.info(`[${name}] generated device id: ${id}`);
    }
    return withDefaults;
  }

  private slugify(input: string): string {
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 64);
  }
}
