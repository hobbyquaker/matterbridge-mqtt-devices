/**
 * matterbridge-mqtt-devices — MqttPlatform
 * Compatible Matterbridge v3.x
 */

// ── Matterbridge ──────────────────────────────────────────────────────────────
import { promises as fs } from 'node:fs';
import { type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import type { PlatformConfig, PlatformMatterbridge } from 'matterbridge';
import { getAttribute, MatterbridgeDynamicPlatform, MatterbridgeEndpoint, setAttribute } from 'matterbridge';
// ── Logger ────────────────────────────────────────────────────────────────────
import { AnsiLogger } from 'matterbridge/logger';
// ── MQTT ──────────────────────────────────────────────────────────────────────
import mqtt, { IClientOptions, MqttClient } from 'mqtt';

import type { AnyHandler, DeviceContext, EditableDeviceKey, MqttDeviceConfig } from './devices/index.js';
// ── Device registry ───────────────────────────────────────────────────────────
import { ALL_EDITABLE_KEYS, findDescriptor, NUMBER_KEYS } from './devices/index.js';

// ── Platform ──────────────────────────────────────────────────────────────────

export class MqttPlatform extends MatterbridgeDynamicPlatform {
  private mqttClient: MqttClient | undefined;
  private topicHandlers = new Map<string, Array<(p: string) => void>>();
  private endpointMap = new Map<string, MatterbridgeEndpoint>();
  private editorAttachedServer: Server | undefined;
  private editorRequestHandler: ((req: IncomingMessage, res: ServerResponse) => void) | undefined;

  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: PlatformConfig) {
    super(matterbridge, log, config);
    this.log.info('MqttPlatform created');
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  override async onStart(reason?: string): Promise<void> {
    this.log.info(`onStart: ${reason ?? '-'}`);
    await this.connectMqtt();
    this.attachDeviceEditor();

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
    if (this.editorRequestHandler && this.editorAttachedServer) {
      this.editorAttachedServer.removeListener('request', this.editorRequestHandler);
      this.editorAttachedServer = undefined;
      this.editorRequestHandler = undefined;
      this.log.info('Device editor routes detached from Matterbridge HTTP server');
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
        this.log.debug(`← [${topic}] ${payload}`);
        const handlers = this.topicHandlers.get(topic);
        if (!handlers) {
          this.log.warn(`← [${topic}] aucun handler enregistré pour ce topic`);
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
    if (this.config['debug']) this.log.debug(`→ [${topic}] ${payload}`);
  }

  // ── Device editor web UI ──────────────────────────────────────────────────

  private attachDeviceEditor(): void {
    if (this.editorAttachedServer) return;

    // this.matterbridge is getPlatformMatterbridge() — a plain data object, NOT the
    // Matterbridge class instance. frontend/httpServer are not accessible through it.
    // Instead, locate Matterbridge's HTTP frontend server by scanning active Node.js handles.
    // The frontend HTTP server is the only listening server with 'request' event listeners
    // (Express is attached to it); raw TCP/Matter servers have none.
    const proc = process as unknown as { _getActiveHandles?: () => unknown[] };
    const handles: unknown[] = proc._getActiveHandles?.() ?? [];
    const httpServer = handles.find((h): h is Server => {
      if (h === null || typeof h !== 'object') return false;
      const handle = h as Record<string, unknown>;
      return (
        handle['listening'] === true &&
        typeof handle['prependListener'] === 'function' &&
        typeof handle['listenerCount'] === 'function' &&
        (handle as unknown as { listenerCount: (e: string) => number }).listenerCount('request') > 0
      );
    });

    if (!httpServer) {
      this.log.warn('Matterbridge HTTP server not found; device editor routes not attached');
      return;
    }

    const handler = (req: IncomingMessage, res: ServerResponse) => {
      if (res.writableEnded || !req.url) return;
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (pathname !== '/matterbridge-mqtt-config' && pathname !== '/api/matterbridge-mqtt-config') return;
      void this.handleDeviceEditorRequest(req, res);
    };

    try {
      httpServer.prependListener('request', handler);
      this.editorAttachedServer = httpServer;
      this.editorRequestHandler = handler;
      this.log.info('Device editor routes attached to Matterbridge HTTP server');
    } catch (error) {
      this.log.warn(`Failed to attach device editor routes: ${error}`);
    }
  }

  private async handleDeviceEditorRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!req.url) {
      this.sendEditorText(res, 400, 'Bad Request');
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');

    if (req.method === 'GET' && url.pathname === '/matterbridge-mqtt-config') {
      const deviceId = String(url.searchParams.get('device') ?? '');
      const html = this.renderDeviceEditorHtml(deviceId);
      if (!html) {
        this.sendEditorText(res, 404, `Unknown device: ${deviceId}`);
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/matterbridge-mqtt-config') {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of url.searchParams.entries()) payload[k] = v;

      const deviceId = String(payload['deviceId'] ?? '');
      if (!deviceId) {
        this.sendEditorJson(res, 400, { ok: false, error: 'deviceId is required' });
        return;
      }

      const updated = this.applyAdvancedValues(deviceId, payload);
      if (!updated) {
        this.sendEditorJson(res, 404, { ok: false, error: `Unknown device: ${deviceId}` });
        return;
      }

      try {
        await this.persistCurrentConfig();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.sendEditorJson(res, 500, { ok: false, error: `Save failed: ${message}` });
        return;
      }

      this.sendEditorJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/matterbridge-mqtt-config') {
      const body = await this.readRequestBody(req);
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(body) as Record<string, unknown>;
      } catch {
        this.sendEditorJson(res, 400, { ok: false, error: 'Invalid JSON body' });
        return;
      }

      const deviceId = String(payload['deviceId'] ?? '');
      if (!deviceId) {
        this.sendEditorJson(res, 400, { ok: false, error: 'deviceId is required' });
        return;
      }

      const updated = this.applyAdvancedValues(deviceId, payload);
      if (!updated) {
        this.sendEditorJson(res, 404, { ok: false, error: `Unknown device: ${deviceId}` });
        return;
      }

      try {
        await this.persistCurrentConfig();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.sendEditorJson(res, 500, { ok: false, error: `Save failed: ${message}` });
        return;
      }

      this.sendEditorJson(res, 200, { ok: true });
      return;
    }

    this.sendEditorText(res, 404, 'Not Found');
  }

  private async readRequestBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  private sendEditorText(res: ServerResponse, status: number, text: string): void {
    res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(text);
  }

  private sendEditorJson(res: ServerResponse, status: number, data: Record<string, unknown>): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  private findConfiguredDeviceById(deviceId: string): MqttDeviceConfig | undefined {
    const devices = (this.config['devices'] as MqttDeviceConfig[] | undefined) ?? [];
    for (let i = 0; i < devices.length; i++) {
      const cfg = this.applyDeviceDefaults(devices[i], i);
      if (cfg.id === deviceId) return devices[i];
    }
    return undefined;
  }

  private getEditableKeys(): readonly EditableDeviceKey[] {
    return ALL_EDITABLE_KEYS;
  }

  private getEditableKeysForType(deviceType: string | undefined): readonly EditableDeviceKey[] {
    return findDescriptor(deviceType)?.editableKeys ?? ALL_EDITABLE_KEYS;
  }

  private isNumberKey(key: EditableDeviceKey): boolean {
    return (NUMBER_KEYS as readonly string[]).includes(key);
  }

  private applyAdvancedValues(deviceId: string, data: Record<string, unknown>): boolean {
    const cfg = this.findConfiguredDeviceById(deviceId);
    if (!cfg) return false;

    for (const key of this.getEditableKeys()) {
      if (!(key in data)) continue;
      const incoming = data[key];

      if (key === 'retain' || key === 'batteryValueBased') {
        if (incoming === true || incoming === 'true') (cfg as unknown as Record<string, unknown>)[key] = true;
        else if (incoming === false || incoming === 'false') (cfg as unknown as Record<string, unknown>)[key] = false;
        else Reflect.deleteProperty(cfg as unknown as Record<string, unknown>, key);
        continue;
      }

      if (key === 'powerSource') {
        const val = String(incoming).trim().toLowerCase();
        if (val === 'battery' || val === 'mains') {
          (cfg as unknown as Record<string, unknown>)[key] = val;
        } else {
          Reflect.deleteProperty(cfg as unknown as Record<string, unknown>, key);
        }
        continue;
      }

      if (this.isNumberKey(key)) {
        const raw = incoming === undefined || incoming === null ? '' : String(incoming).trim();
        if (raw === '') {
          Reflect.deleteProperty(cfg as unknown as Record<string, unknown>, key);
          continue;
        }
        const n = Number(raw);
        if (Number.isFinite(n)) {
          (cfg as unknown as Record<string, unknown>)[key] = n;
        }
        continue;
      }

      const value = incoming === undefined || incoming === null ? '' : String(incoming).trim();
      if (value === '') Reflect.deleteProperty(cfg as unknown as Record<string, unknown>, key);
      else (cfg as unknown as Record<string, unknown>)[key] = value;
    }

    return true;
  }

  private getConfigFilePath(): string {
    const pluginName = String(this.config['name'] ?? 'matterbridge-mqtt-devices');
    return path.join(os.homedir(), '.matterbridge', `${pluginName}.config.json`);
  }

  private async persistCurrentConfig(): Promise<void> {
    const configPath = this.getConfigFilePath();
    const existingText = await fs.readFile(configPath, 'utf8');
    const existingConfig = JSON.parse(existingText) as Record<string, unknown>;
    existingConfig['devices'] = this.config['devices'];
    await fs.writeFile(configPath, `${JSON.stringify(existingConfig, null, 2)}\n`, 'utf8');
    this.log.info(`Saved device advanced config to ${configPath}`);
  }

  private renderDeviceEditorHtml(deviceId: string): string | null {
    const cfg = this.findConfiguredDeviceById(deviceId);
    if (!cfg) return null;

    const keys = this.getEditableKeysForType(cfg.type);
    const values: Record<string, unknown> = {};
    for (const key of keys) values[key] = (cfg as unknown as Record<string, unknown>)[key] ?? '';
    values['retain'] = cfg.retain === true;

    const title = `${cfg.name} (${cfg.type ?? 'on-off-outlet'})`;
    const initialJson = JSON.stringify(values);

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MQTT Device Editor</title>
  <style>
    body { font-family: Segoe UI, sans-serif; margin: 0; background: #f5f7fb; color: #1a2233; }
    .wrap { max-width: 900px; margin: 24px auto; background: #fff; border-radius: 10px; padding: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); }
    h1 { margin: 0 0 6px 0; font-size: 24px; }
    p { margin: 0 0 16px 0; color: #4a5a78; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field.full { grid-column: span 2; }
    label { font-size: 12px; color: #4a5a78; }
    input { border: 1px solid #cfd6e4; border-radius: 8px; padding: 8px 10px; font-size: 14px; }
    .actions { margin-top: 16px; display: flex; gap: 10px; align-items: center; }
    button { border: 0; border-radius: 8px; background: #1f6feb; color: #fff; padding: 10px 14px; font-weight: 600; cursor: pointer; }
    .status { font-size: 13px; color: #4a5a78; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .field.full { grid-column: span 1; } }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${this.escapeHtml(title)}</h1>
    <p>Edit advanced MQTT topics and payload mapping. Save persists to plugin config. Restart plugin to apply runtime changes.</p>
    <div class="grid" id="fields"></div>
    <div class="actions">
      <button id="saveBtn" type="button">Save</button>
      <span class="status" id="status">Ready</span>
    </div>
  </div>
  <script>
    const deviceId = ${JSON.stringify(deviceId)};
    const keys = ${JSON.stringify(keys)};
    const initial = ${initialJson};
    const fields = document.getElementById('fields');
    const status = document.getElementById('status');
    const saveBtn = document.getElementById('saveBtn');

    function makeField(key, value) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      const label = document.createElement('label');
      label.textContent = key;
      const input = document.createElement('input');
      input.name = key;
      if (key === 'retain') {
        input.type = 'checkbox';
        input.checked = !!value;
      } else {
        input.type = 'text';
        input.value = value == null ? '' : String(value);
      }
      wrap.appendChild(label);
      wrap.appendChild(input);
      return wrap;
    }

    keys.forEach((key) => fields.appendChild(makeField(key, initial[key])));

    saveBtn.addEventListener('click', async () => {
      status.textContent = 'Saving...';
      const payload = { deviceId };
      keys.forEach((key) => {
        const input = document.querySelector('[name="' + key + '"]');
        payload[key] = key === 'retain' ? input.checked : input.value;
      });

      try {
        const params = new URLSearchParams();
        params.set('deviceId', deviceId);
        keys.forEach((key) => params.set(key, String(payload[key] ?? '')));

        const resp = await fetch('/api/matterbridge-mqtt-config?' + params.toString(), { method: 'GET' });
        const data = await resp.json();
        if (!resp.ok || !data.ok) {
          status.textContent = 'Save failed: ' + (data.error || 'unknown error');
          return;
        }
        status.textContent = 'Saved. Restart plugin to apply runtime changes.';
      } catch (error) {
        status.textContent = 'Save failed: ' + error;
      }
    });
  </script>
</body>
</html>`;
  }

  private escapeHtml(input: string): string {
    return input.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private getAttr(ep: MatterbridgeEndpoint, clusterId: number, attr: string): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return getAttribute(ep, clusterId as any, attr, this.log);
  }

  private setAttr(ep: MatterbridgeEndpoint, clusterId: number, attr: string, value: unknown): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void setAttribute(ep, clusterId as any, attr, value as any, this.log);
  }

  private initEp(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig, productId: number): void {
    ep.createDefaultBasicInformationClusterServer(cfg.name, `mqtt-${cfg.id}`, 0xfff1, 'MQTT-Bridge', productId, 'matterbridge-mqtt-devices');
    ep.createDefaultIdentifyClusterServer();
  }

  private onCmd(ep: MatterbridgeEndpoint, cmd: string, fn: AnyHandler): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ep.addCommandHandler(cmd as any, fn as any);
  }

  private buildDeviceConfigUrl(cfg: MqttDeviceConfig): string {
    if (cfg.configUrl && cfg.configUrl.trim() !== '') return cfg.configUrl.trim();

    const pluginName = encodeURIComponent(String(this.config['name'] ?? 'matterbridge-mqtt-devices'));
    const deviceId = encodeURIComponent(cfg.id ?? 'unknown');
    return `/matterbridge-mqtt-config?plugin=${pluginName}&device=${deviceId}`;
  }

  private applyConfigUrl(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig): void {
    const configUrl = this.buildDeviceConfigUrl(cfg);
    ep.configUrl = configUrl;
  }

  private subscribeToAvailabilityAndBattery(ep: MatterbridgeEndpoint, cfg: MqttDeviceConfig): void {
    // Availability / online state
    if (cfg.availabilityTopic) {
      const onlinePayload = cfg.payloadOnline ?? 'online';
      this.subscribe(cfg.availabilityTopic, (p) => {
        const state = this.toPayloadString(this.extractPayloadValue(p, cfg.availabilityJsonPath));
        const isOnline = state === onlinePayload;
        this.log.info(`[${cfg.name}] availability: ${isOnline ? 'online' : 'offline'}`);
        // Set BridgedDeviceBasicInformation.reachable attribute
        const clusterIdBridgedInfo = 0x0039; // BridgedDeviceBasicInformation
        this.setAttr(ep, clusterIdBridgedInfo, 'reachable', isOnline);
      });
    }

    // Battery level
    if (cfg.batteryTopic) {
      if (cfg.batteryValueBased) {
        // Value-based: expect numeric percentage 0-100 or custom range
        const min = cfg.batteryMin ?? 0;
        const max = cfg.batteryMax ?? 100;
        this.subscribe(cfg.batteryTopic, (p) => {
          const raw = this.parseFloatPayload(p, ['battery', 'level', 'percent', 'value'], cfg.batteryJsonPath);
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
        this.subscribe(cfg.batteryTopic, (p) => {
          const state = this.toPayloadString(this.extractPayloadValue(p, cfg.batteryJsonPath));
          let pct = 50;
          if (state === fullPayload) pct = 100;
          else if (state === emptyPayload) pct = 0;
          const clusterIdBridgedInfo = 0x0039;
          this.setAttr(ep, clusterIdBridgedInfo, 'batteryPercentageRemaining', pct * 2);
          this.log.info(`[${cfg.name}] battery: ${state} (${pct}%)`);
        });
      }
    }

    // Power source
    if (cfg.powerSource) {
      const clusterIdBridgedInfo = 0x0039;
      const powerSourceValue = cfg.powerSource === 'battery' ? 3 : 1; // 3=battery, 1=mains
      this.setAttr(ep, clusterIdBridgedInfo, 'powerSource', powerSourceValue);
      this.log.info(`[${cfg.name}] power source: ${cfg.powerSource}`);
    }
  }

  // ── Device factory ─────────────────────────────────────────────────────────

  private async createDevice(cfg: MqttDeviceConfig): Promise<void> {
    const descriptor = findDescriptor(cfg.type);
    if (!descriptor) {
      this.log.warn(`Unknown type "${cfg.type}" — skipping "${cfg.id}"`);
      return;
    }
    await descriptor.create(this.createDeviceContext(), cfg);
  }

  private createDeviceContext(): DeviceContext {
    return {
      log: this.log,
      subscribe: this.subscribe.bind(this),
      publish: this.publish.bind(this),
      getAttr: this.getAttr.bind(this),
      setAttr: this.setAttr.bind(this),
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
      this.log.warn(`parseOnOff: payload non reconnu "${extracted}" with path "${jsonPath}"`);
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
    this.log.warn(`parseOnOff: payload non reconnu "${extracted}"`);
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
    setSelectDevice.call(this, cfg.id, cfg.name, undefined, 'wifi');
  }

  private isDeviceEnabled(cfg: MqttDeviceConfig): boolean {
    const validateDevice = (this as unknown as { validateDevice?: (selector: string | string[], strict?: boolean) => boolean }).validateDevice;
    if (typeof validateDevice === 'function') {
      return validateDevice.call(
        this,
        [cfg.name, cfg.id].filter((v): v is string => v !== undefined),
        true,
      );
    }

    const whiteList = this.getWhiteList();
    const blackList = this.getBlackList();
    const selectors = [cfg.name, cfg.id].filter((value): value is string => typeof value === 'string' && value.trim() !== '');

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
    const baseTopic = `matterbridge/${id}`;

    const typeDefaults = findDescriptor(type)?.applyDefaults(cfg, baseTopic) ?? {};

    const withDefaults: MqttDeviceConfig = {
      ...cfg,
      ...typeDefaults,
      id,
      name,
      type,
      stateTopic: cfg.stateTopic ?? `${baseTopic}/state`,
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
