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
  private editorAttachedServer: Server | undefined;
  private editorRequestHandler: ((req: IncomingMessage, res: ServerResponse) => void) | undefined;

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
    this.attachDeviceEditor();

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

  // ── Device editor web UI ──────────────────────────────────────────────────

  private attachDeviceEditor(): void {
    if (this.editorAttachedServer) return;

    // ── TECHNICAL DEBT ────────────────────────────────────────────────────────
    // Matterbridge does not currently expose a plugin API for registering custom
    // HTTP routes. As a workaround we locate the Express/HTTP server by scanning
    // Node.js internal active handles (_getActiveHandles) and prepend our own
    // listener directly on the server's 'request' event.
    //
    // This is fragile: it relies on a private Node.js API (_getActiveHandles),
    // on implementation details of how Matterbridge attaches Express, and on the
    // assumption that our listener runs before Express's catch-all static handler.
    //
    // Remove this workaround once upstream support is available:
    //   https://github.com/Luligu/matterbridge/issues/561
    // ─────────────────────────────────────────────────────────────────────────

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
      // Express fires its own request listeners after our prependListener returns.
      // Patch setHeader/write/end on this response instance so that Express cannot
      // inject headers or a body into a response we have already claimed.
      const origSetHeader = res.setHeader.bind(res);
      const origWrite = res.write.bind(res) as typeof res.write;
      const origEnd = res.end.bind(res) as typeof res.end;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res as any).setHeader = (name: string, value: string | number | readonly string[]) => {
        if (res.headersSent) return res;
        return origSetHeader(name, value);
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res as any).write = (...args: Parameters<typeof res.write>) => {
        if (res.writableEnded) return true;
        return origWrite(...args);
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (res as any).end = (...args: Parameters<typeof res.end>) => {
        if (res.writableEnded) return res;
        return origEnd(...args);
      };
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

      // End the response synchronously so Express cannot race in and write an
      // HTML body into the open socket between writeHead and our async res.end.
      // The in-memory config is already updated by applyAdvancedValues; persist
      // runs after the response is closed and logs any failure.
      this.sendEditorJson(res, 200, { ok: true });
      void this.persistCurrentConfig().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.log.error(`Failed to persist device config: ${message}`);
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/matterbridge-mqtt-config') {
      // Claim the response before the first await (readRequestBody) so Express
      // cannot race in and serve index.html while the body is being read.
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });

      const body = await this.readRequestBody(req);
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(body) as Record<string, unknown>;
      } catch {
        res.end(JSON.stringify({ ok: false, error: 'Invalid JSON body' }));
        return;
      }

      const deviceId = String(payload['deviceId'] ?? '');
      if (!deviceId) {
        res.end(JSON.stringify({ ok: false, error: 'deviceId is required' }));
        return;
      }

      const updated = this.applyAdvancedValues(deviceId, payload);
      if (!updated) {
        res.end(JSON.stringify({ ok: false, error: `Unknown device: ${deviceId}` }));
        return;
      }

      try {
        await this.persistCurrentConfig();
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.end(JSON.stringify({ ok: false, error: `Save failed: ${message}` }));
      }
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

  private getEditableKeyGroups(deviceType: string | undefined): EditableKeyGroups {
    const d = findDescriptor(deviceType);
    if (d) return d.editableKeys;
    return { publish: [], subscribe: [], settings: ALL_EDITABLE_KEYS };
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

      if (key === 'components') {
        const raw = incoming === undefined || incoming === null ? '' : String(incoming).trim();
        const ids = raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length > 0) (cfg as unknown as Record<string, unknown>)[key] = ids;
        else Reflect.deleteProperty(cfg as unknown as Record<string, unknown>, key);
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

    const descriptor = findDescriptor(cfg.type);
    const componentDefs: readonly ComposedComponentDef[] | null = descriptor?.componentDefs ?? null;

    const groups = this.getEditableKeyGroups(cfg.type);
    const allKeys = [...groups.publish, ...groups.subscribe, ...groups.settings];
    const values: Record<string, unknown> = {};
    for (const key of allKeys) values[key] = (cfg as unknown as Record<string, unknown>)[key] ?? '';
    values['retain'] = cfg.retain === true;
    // Normalise components to a comma-separated string for the initial JS object
    if (Array.isArray(values['components'])) {
      values['components'] = (values['components'] as string[]).join(',');
    }

    const title = `${cfg.name} (${cfg.type ?? 'on-off-outlet'})`;
    const initialJson = JSON.stringify(values);
    const componentDefsJson = JSON.stringify(componentDefs);

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
    .section-label { grid-column: span 2; margin: 12px 0 0; padding: 6px 0; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #8896b0; border-bottom: 1px solid #e8ecf4; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field.full { grid-column: span 2; }
    label { font-size: 12px; color: #4a5a78; }
    input, select { border: 1px solid #cfd6e4; border-radius: 8px; padding: 8px 10px; font-size: 14px; background: #fff; }
    .comp-checks { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 6px 0; }
    .comp-check { display: flex; align-items: center; gap: 6px; font-size: 14px; color: #1a2233; cursor: pointer; }
    .comp-check input[type="checkbox"] { border: none; border-radius: 0; padding: 0; width: 16px; height: 16px; cursor: pointer; }
    .actions { margin-top: 16px; display: flex; gap: 10px; align-items: center; }
    button { border: 0; border-radius: 8px; background: #1f6feb; color: #fff; padding: 10px 14px; font-weight: 600; cursor: pointer; }
    .status { font-size: 13px; color: #4a5a78; }
    .hint-btn { background: none; border: none; color: #8896b0; cursor: pointer; font-size: 12px; padding: 0 0 0 4px; line-height: 1; vertical-align: middle; }
    .hint-btn:hover { color: #1f6feb; }
    .hint-popup { position: fixed; z-index: 9999; background: #1a2233; color: #e8ecf4; border-radius: 8px; padding: 10px 14px; font-size: 12px; max-width: 320px; box-shadow: 0 4px 20px rgba(0,0,0,.3); line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .field.full { grid-column: span 1; } .section-label { grid-column: span 1; } }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${this.escapeHtml(title)}</h1>
    <p>Edit advanced MQTT topics and payload mapping. Save persists to plugin config. Restart plugin to apply runtime changes.</p>
    <div class="grid" id="fields"></div>
    <div class="grid" id="fields"></div>
    <div class="actions">
      <button id="saveBtn" type="button">Save</button>
      <span class="status" id="status">Ready</span>
    </div>
  </div>
  <script>
    const deviceId = ${JSON.stringify(deviceId)};
    const groups = ${JSON.stringify(groups)};
    const initial = ${initialJson};
    const componentDefs = ${componentDefsJson};
    const fields = document.getElementById('fields');
    const status = document.getElementById('status');
    const saveBtn = document.getElementById('saveBtn');
    const GROUP_LABELS = { publish: 'Publish Topics', subscribe: 'Subscribe Topics & Paths', settings: 'Settings' };

    const BATTERY_KEYS = ['topicBattery','payloadBatteryJsonPath','batteryValueBased','batteryMin','batteryMax','payloadBatteryFull','payloadBatteryEmpty'];

    // ── Field hints ───────────────────────────────────────────────────────────
    const FIELD_HINTS = {
      // ── Common availability & battery ──────────────────────────────────────
      topicAvailability:           'Subscribe: receives device online/offline status.\nPayload compared against payloadOnline value.',
      payloadAvailabilityJsonPath: 'JSON path inside the availability payload to extract the status string.\nExample: state   or   sensor.status',
      payloadOnline:               'Payload value that means the device is online.\nDefault: "online"',
      payloadOffline:              'Payload value that means the device is offline.\nDefault: "offline"',
      topicBattery:                'Subscribe: receives battery state updates.',
      payloadBatteryJsonPath:      'JSON path inside the battery payload to extract the value.\nExample: battery   or   data.level',
      batteryValueBased:           'true  → expect a numeric 0–100 value (or batteryMin–batteryMax range).\nfalse → expect payloadBatteryFull / payloadBatteryEmpty strings.',
      batteryMin:                  'Raw MQTT value mapped to 0 % (empty). Default: 0',
      batteryMax:                  'Raw MQTT value mapped to 100 % (full). Default: 100',
      payloadBatteryFull:          'Payload that means battery is full (batteryValueBased = false).\nDefault: "full"',
      payloadBatteryEmpty:         'Payload that means battery is empty (batteryValueBased = false).\nDefault: "empty"',
      // ── Common settings ────────────────────────────────────────────────────
      powerSource:                 'Reported power source for this device.\nOptions: battery | mains\nDefault: not set',
      serial:                      'Serial number override. Leave blank to auto-generate from device id.',
      // ── On/Off ────────────────────────────────────────────────────────────
      topicSetOnOff:               'Publish: sends on/off commands.\nPayload: payloadOn or payloadOff value.',
      topicOnOff:                  'Subscribe: receives current on/off state.',
      payloadOnOffJsonPath:        'JSON path inside the on/off payload to extract the state string.\nExample: state   or   switch.value',
      payloadOn:                   'Payload string for "on" state.\nDefault: "ON"',
      payloadOff:                  'Payload string for "off" state.\nDefault: "OFF"',
      retain:                      'true → publish commands with the MQTT retain flag.\nDefault: false',
      // ── Brightness / Level ─────────────────────────────────────────────────
      topicCurrentLevel:           'Subscribe: receives current brightness level.',
      payloadCurrentLevelJsonPath: 'JSON path inside the level payload to extract the numeric value.',
      topicMoveToLevel:            'Publish: sends brightness-set commands (level only).',
      topicMoveToLevelWithOnOff:   'Publish: sends brightness-set commands that also toggle on/off.',
      brightnessMin:               'MQTT value that maps to Matter level 0 (off / minimum).\nDefault: 0',
      brightnessMax:               'MQTT value that maps to Matter level 254 (maximum).\nDefault: 254',
      // ── Color ─────────────────────────────────────────────────────────────
      topicColor:                  'Subscribe: receives current color state (JSON object).',
      payloadColorJsonPath:        'JSON path inside the color payload to extract the color object.',
      topicSetColor:               'Publish: sends color commands.\nFormats:\n• Hue+Sat: {"hue":0–360, "saturation":0–100}\n• Color temp: {"colorTemp":153–500} (mireds)\n• XY: {"x":0.0–1.0, "y":0.0–1.0}',
      // ── Cover / Window-covering ────────────────────────────────────────────
      topicSetCoverState:          'Publish: sends combined open/close/stop commands.\nPayload: payloadOpen, payloadClosed, or payloadStop.',
      topicSetCoverStateOpen:      'Publish: dedicated topic for "open" command only (optional).\nPayload: payloadOpen value.',
      topicSetCoverStateClose:     'Publish: dedicated topic for "close" command only (optional).\nPayload: payloadClosed value.',
      topicSetCoverStateStop:      'Publish: dedicated topic for "stop" command only (optional).\nPayload: payloadStop value.\nLeave blank to send stop via topicSetCoverState.',
      topicCoverState:             'Subscribe: receives current cover state string.',
      payloadCoverStateJsonPath:   'JSON path inside the cover-state payload to extract the state.',
      topicCoverStateOpen:         'Subscribe: any payload on this topic is treated as "open".',
      topicCoverStateClose:        'Subscribe: any payload on this topic is treated as "closed".',
      topicCoverStateStop:         'Subscribe: any payload on this topic is treated as "stopped".',
      topicPosition:               'Subscribe: receives current position value.',
      payloadPositionJsonPath:     'JSON path inside the position payload to extract the numeric value.',
      topicSetPosition:            'Publish: sends position-set commands.\nPayload: numeric value in positionMin–positionMax range.',
      positionMin:                 'MQTT value for the fully open position.\nDefault: 0',
      positionMax:                 'MQTT value for the fully closed position.\nDefault: 100',
      topicTiltState:              'Subscribe: receives tilt state string.',
      payloadTiltStateJsonPath:    'JSON path inside the tilt-state payload to extract the state.',
      topicSetTiltState:           'Publish: sends combined tilt state commands.',
      topicTilt:                   'Subscribe: receives current tilt angle value.',
      payloadTiltJsonPath:         'JSON path inside the tilt payload to extract the numeric value.',
      topicSetTilt:                'Publish: sends tilt-angle set commands.\nPayload: numeric value in tiltMin–tiltMax range.',
      tiltMin:                     'MQTT value for 0 % tilt (fully untilted).\nDefault: 0',
      tiltMax:                     'MQTT value for 100 % tilt (fully tilted).\nDefault: 100',
      topicSafetyStatus:           'Subscribe: receives safety status bitmask value.',
      payloadSafetyStatusJsonPath: 'JSON path inside the safety-status payload.',
      topicSetSafetyStatus:        'Publish: sends safety status commands.',
      payloadOpen:                 'Payload for "open" command.\nDefault: "OPEN"',
      payloadClosed:               'Payload for "close" command.\nDefault: "CLOSE"',
      payloadStop:                 'Payload for "stop" command.\nDefault: "STOP"',
      // ── Closure ───────────────────────────────────────────────────────────
      topicSetClosureState:        'Publish: sends combined open/close/stop commands.\nPayload: payloadOpen, payloadClosed, or payloadStop.',
      topicSetClosureStateOpen:    'Publish: dedicated topic for "open" command only (optional).\nPayload: payloadOpen value.',
      topicSetClosureStateClose:   'Publish: dedicated topic for "close" command only (optional).\nPayload: payloadClosed value.',
      topicSetClosureStateStop:    'Publish: dedicated topic for "stop" command only (optional).\nPayload: payloadStop value.\nLeave blank to send stop via topicSetClosureState.',
      topicClosureState:           'Subscribe: receives current closure state string.',
      payloadClosureStateJsonPath: 'JSON path inside the closure-state payload.',
      topicClosureStateOpen:       'Subscribe: any payload on this topic is treated as "open".',
      topicClosureStateClose:      'Subscribe: any payload on this topic is treated as "closed".',
      topicClosureStateStop:       'Subscribe: any payload on this topic is treated as "stopped".',
      topicSetLatch:               'Publish: sends latch commands.',
      topicLatch:                  'Subscribe: receives latch state.',
      payloadLatchJsonPath:        'JSON path inside the latch payload.',
      topicMainState:              'Subscribe: receives main-state value for the closure.',
      payloadMainStateJsonPath:    'JSON path inside the main-state payload.',
      // ── Speed / Fan ───────────────────────────────────────────────────────
      topicSpeed:                  'Subscribe: receives current speed/level value.',
      payloadSpeedJsonPath:        'JSON path inside the speed payload to extract the numeric value.',
      topicSetSpeed:               'Publish: sends speed-set commands.\nFan payload: {"level":N, "percent":P}\nAir-purifier / extractor-hood: plain percentage 0–100.',
      topicSetSpeedStep:           'Publish: sends incremental speed step.\nPayload: "+1" to increase, "-1" to decrease.',
      speedMin:                    'MQTT level value for minimum speed (maps to 0 %).\nDefault: 0',
      speedMax:                    'MQTT level value for maximum speed (maps to 100 %).\nDefault: 5',
      topicFanMode:                'Subscribe: receives current fan mode string.',
      payloadFanModeJsonPath:      'JSON path inside the fan-mode payload.',
      topicSetFanMode:             'Publish: sends fan mode commands.\nValues: off | low | medium | high | on | auto | smart',
      // ── Temperature / Thermostat ───────────────────────────────────────────
      topicLocalTemp:              'Subscribe: receives local/ambient temperature in °C.',
      payloadLocalTempJsonPath:    'JSON path inside the local-temp payload.',
      topicTargetTemp:             'Subscribe: receives heating setpoint in °C.',
      payloadTargetTempJsonPath:   'JSON path inside the target-temp payload.',
      topicSetTargetTemp:          'Publish: sends heating setpoint.\nPayload: numeric °C value.',
      topicCoolingSetpoint:        'Subscribe: receives cooling setpoint in °C.',
      payloadCoolingSetpointJsonPath: 'JSON path inside the cooling-setpoint payload.',
      topicSetCoolingSetpoint:     'Publish: sends cooling setpoint.\nPayload: numeric °C value.',
      topicSystemMode:             'Subscribe: receives current thermostat system mode.',
      payloadSystemModeJsonPath:   'JSON path inside the system-mode payload.',
      topicSetSystemMode:          'Publish: sends system mode commands.\nValues: off | heat | cool | auto | fan_only | dry | sleep | heat_cool',
      topicRunningState:           'Subscribe: receives thermostat running state.',
      payloadRunningStateJsonPath: 'JSON path inside the running-state payload.',
      topicTemperatureLevel:       'Subscribe: receives temperature level setting.',
      payloadTemperatureLevelJsonPath: 'JSON path inside the temperature-level payload.',
      topicSetTemperatureLevel:    'Publish: sends temperature level commands.',
      // ── Sensors ───────────────────────────────────────────────────────────
      topicTemperature:            'Subscribe: receives temperature measurement in °C.',
      payloadTemperatureJsonPath:  'JSON path inside the temperature payload.',
      topicTemperatureFreezer:     'Subscribe: receives freezer temperature in °C.',
      payloadTemperatureFreezerJsonPath: 'JSON path inside the freezer-temperature payload.',
      topicHumidity:               'Subscribe: receives relative humidity in %.',
      payloadHumidityJsonPath:     'JSON path inside the humidity payload.',
      topicIlluminance:            'Subscribe: receives illuminance in lux.',
      payloadIlluminanceJsonPath:  'JSON path inside the illuminance payload.',
      topicMoisture:               'Subscribe: receives soil/surface moisture value.',
      payloadMoistureJsonPath:     'JSON path inside the moisture payload.',
      topicPressure:               'Subscribe: receives pressure in kPa.',
      payloadPressureJsonPath:     'JSON path inside the pressure payload.',
      topicFlow:                   'Subscribe: receives flow rate.',
      payloadFlowJsonPath:         'JSON path inside the flow payload.',
      topicOpenLevel:              'Subscribe: receives open-level percentage.',
      payloadOpenLevelJsonPath:    'JSON path inside the open-level payload.',
      topicAirQuality:             'Subscribe: receives air quality index (0–5).\n0=unknown 1=good 2=fair 3=moderate 4=poor 5=very poor',
      payloadAirQualityJsonPath:   'JSON path inside the air-quality payload.',
      topicTvoc:                   'Subscribe: receives total VOC in µg/m³.',
      payloadTvocJsonPath:         'JSON path inside the TVOC payload.',
      topicCo2:                    'Subscribe: receives CO₂ concentration in ppm.',
      payloadCo2JsonPath:          'JSON path inside the CO₂ payload.',
      topicPm25:                   'Subscribe: receives PM2.5 concentration in µg/m³.',
      payloadPm25JsonPath:         'JSON path inside the PM2.5 payload.',
      topicOccupancy:              'Subscribe: receives occupancy state.',
      payloadOccupancyJsonPath:    'JSON path inside the occupancy payload.',
      topicContactState:           'Subscribe: receives contact state.',
      payloadContactStateJsonPath: 'JSON path inside the contact-state payload.',
      // ── Door lock ─────────────────────────────────────────────────────────
      topicLockState:              'Subscribe: receives current lock state.',
      payloadLockStateJsonPath:    'JSON path inside the lock-state payload.',
      topicSetLockState:           'Publish: sends lock commands.\nPayload: payloadLocked or payloadUnlocked value.',
      payloadLocked:               'Payload for "locked" state.\nDefault: "LOCK"',
      payloadUnlocked:             'Payload for "unlocked" state.\nDefault: "UNLOCK"',
      payloadNotFullyLocked:       'Payload for "not fully locked" state.\nDefault: "NOT_FULLY_LOCKED"',
      topicDoorState:              'Subscribe: receives physical door open/closed state.',
      payloadDoorStateJsonPath:    'JSON path inside the door-state payload.',
      payloadDoorOpen:             'Payload for door open.\nDefault: "OPEN"',
      payloadDoorClosed:           'Payload for door closed.\nDefault: "CLOSED"',
      // ── Generic switch ────────────────────────────────────────────────────
      topicAction:                 'Subscribe: receives button action events.',
      payloadActionJsonPath:       'JSON path inside the action payload to extract the action string.',
      topicActionPress:            'Subscribe: any payload on this topic triggers a single press.',
      topicActionDouble:           'Subscribe: any payload on this topic triggers a double press.',
      topicActionLong:             'Subscribe: any payload on this topic triggers a long press.',
      topicActionInitialPress:     'Subscribe: any payload on this topic triggers an initial press.',
      topicActionLongRelease:      'Subscribe: any payload on this topic triggers a long release.',
      payloadPress:                'Payload that maps to single press.\nDefault: "press"',
      payloadDouble:               'Payload that maps to double press.\nDefault: "double"',
      payloadLong:                 'Payload that maps to long press.\nDefault: "long"',
      payloadInitialPress:         'Payload that maps to initial press.\nDefault: "initial_press"',
      payloadLongRelease:          'Payload that maps to long press release.\nDefault: "long_release"',
      // ── Smoke/CO alarm ────────────────────────────────────────────────────
      topicSmokeAlarm:             'Subscribe: receives smoke alarm state.',
      payloadSmokeAlarmJsonPath:   'JSON path inside the smoke-alarm payload.',
      topicCo:                     'Subscribe: receives CO alarm state.',
      payloadCoJsonPath:           'JSON path inside the CO payload.',
      topicBatteryAlert:           'Subscribe: receives battery alert state.',
      payloadBatteryAlertJsonPath: 'JSON path inside the battery-alert payload.',
      topicHardwareFault:          'Subscribe: receives hardware fault state.',
      payloadHardwareFaultJsonPath:'JSON path inside the hardware-fault payload.',
      topicTestInProgress:         'Subscribe: receives test-in-progress state.',
      payloadTestInProgressJsonPath:'JSON path inside the test-in-progress payload.',
      payloadAlarmNormal:          'Payload for alarm clear / normal state.\nDefault: "normal"',
      payloadAlarmWarning:         'Payload for alarm warning state.\nDefault: "warning"',
      payloadAlarmCritical:        'Payload for alarm critical state.\nDefault: "critical"',
      // ── Operational state ─────────────────────────────────────────────────
      topicOperationalState:       'Subscribe: receives current operational state string.',
      payloadOperationalStateJsonPath: 'JSON path inside the operational-state payload.',
      topicSetOperationalState:    'Publish: sends operational state commands.',
      payloadRunning:              'Payload for "running" state.\nDefault: "running"',
      payloadStopped:              'Payload for "stopped" state.\nDefault: "stopped"',
      payloadPaused:               'Payload for "paused" state.\nDefault: "paused"',
      topicCountdownTime:          'Subscribe: receives remaining countdown time (seconds).',
      payloadCountdownTimeJsonPath:'JSON path inside the countdown-time payload.',
      topicCurrentPhase:           'Subscribe: receives current operational phase name.',
      payloadCurrentPhaseJsonPath: 'JSON path inside the current-phase payload.',
      topicOperationalError:       'Subscribe: receives operational error state.',
      payloadOperationalErrorJsonPath: 'JSON path inside the operational-error payload.',
      // ── Washer / Dryer ────────────────────────────────────────────────────
      topicWasherMode:             'Subscribe: receives current washer mode.',
      payloadWasherModeJsonPath:   'JSON path inside the washer-mode payload.',
      topicSetWasherMode:          'Publish: sends washer mode commands.',
      topicSpinSpeed:              'Subscribe: receives spin speed setting.',
      payloadSpinSpeedJsonPath:    'JSON path inside the spin-speed payload.',
      topicNumberOfRinses:         'Subscribe: receives number of rinses setting.',
      payloadNumberOfRinsesJsonPath:'JSON path inside the number-of-rinses payload.',
      topicDrynessLevel:           'Subscribe: receives dryness level setting.',
      payloadDrynessLevelJsonPath: 'JSON path inside the dryness-level payload.',
      // ── Dishwasher ────────────────────────────────────────────────────────
      topicDishwasherMode:         'Subscribe: receives current dishwasher mode.',
      payloadDishwasherModeJsonPath:'JSON path inside the dishwasher-mode payload.',
      topicSetDishwasherMode:      'Publish: sends dishwasher mode commands.',
      topicDishwasherAlarm:        'Subscribe: receives dishwasher alarm state.',
      payloadDishwasherAlarmJsonPath:'JSON path inside the dishwasher-alarm payload.',
      // ── Oven / Microwave ──────────────────────────────────────────────────
      topicOvenMode:               'Subscribe: receives current oven mode.',
      payloadOvenModeJsonPath:     'JSON path inside the oven-mode payload.',
      topicSetOvenMode:            'Publish: sends oven mode commands.',
      topicMicrowaveMode:          'Subscribe: receives current microwave mode.',
      payloadMicrowaveModeJsonPath:'JSON path inside the microwave-mode payload.',
      topicCookTime:               'Subscribe: receives cook time in seconds.',
      payloadCookTimeJsonPath:     'JSON path inside the cook-time payload.',
      topicSelectedWattIndex:      'Subscribe: receives selected wattage index.',
      payloadSelectedWattIndexJsonPath:'JSON path inside the selected-watt-index payload.',
      // ── Media / Speaker ───────────────────────────────────────────────────
      topicPlaybackState:          'Subscribe: receives current playback state.',
      payloadPlaybackJsonPath:     'JSON path inside the playback-state payload.',
      topicSetPlaybackState:       'Publish: sends playback state commands.',
      topicSetPlaybackCmd:         'Publish: sends playback control commands (play/pause/stop/next/prev).',
      topicSetMediaSeek:           'Publish: sends media seek position in seconds.',
      topicVolume:                 'Subscribe: receives current volume level (0–100).',
      payloadVolumeJsonPath:       'JSON path inside the volume payload.',
      topicSetVolume:              'Publish: sends volume set commands.\nPayload: numeric 0–100.',
      // ── Electrical ────────────────────────────────────────────────────────
      topicPower:                  'Subscribe: receives active power in watts.',
      payloadPowerJsonPath:        'JSON path inside the power payload.',
      topicVoltage:                'Subscribe: receives voltage in volts.',
      payloadVoltageJsonPath:      'JSON path inside the voltage payload.',
      topicCurrent:                'Subscribe: receives current in amperes.',
      payloadCurrentJsonPath:      'JSON path inside the current payload.',
      topicEnergy:                 'Subscribe: receives energy in kWh.',
      payloadEnergyJsonPath:       'JSON path inside the energy payload.',
      topicFrequency:              'Subscribe: receives line frequency in Hz.',
      payloadFrequencyJsonPath:    'JSON path inside the frequency payload.',
      // ── EVSE ──────────────────────────────────────────────────────────────
      topicEvseState:              'Subscribe: receives EVSE charger state.',
      payloadEvseStateJsonPath:    'JSON path inside the EVSE-state payload.',
      // ── Composed device ───────────────────────────────────────────────────
      components:                  'Active sub-component IDs for composed devices, comma-separated.\nExample: temperatureSensor,humiditySensor',
      configUrl:                   'Custom URL for the device configuration page.\nLeave blank to use the auto-generated editor URL.',
    };

    // ── Hint popup ────────────────────────────────────────────────────────────
    let activePopup = null;

    function showHint(btn, key) {
      if (activePopup) { activePopup.remove(); activePopup = null; }
      const popup = document.createElement('div');
      popup.className = 'hint-popup';
      popup.textContent = FIELD_HINTS[key];
      document.body.appendChild(popup);
      const rect = btn.getBoundingClientRect();
      let left = rect.left;
      if (left + 328 > window.innerWidth) left = Math.max(4, window.innerWidth - 332);
      popup.style.top = (rect.bottom + 6) + 'px';
      popup.style.left = left + 'px';
      activePopup = popup;
    }

    document.addEventListener('click', function() { if (activePopup) { activePopup.remove(); activePopup = null; } });

    // Build a map: key → [componentId, ...] for composed devices
    const keyToComponents = {};
    if (componentDefs) {
      for (const comp of componentDefs) {
        for (const key of [...comp.subscribeKeys, ...comp.settingsKeys]) {
          if (!keyToComponents[key]) keyToComponents[key] = [];
          keyToComponents[key].push(comp.id);
        }
      }
    }

    // Hidden input that holds the serialised component selection for the save handler
    let componentsInput = null;

    function updateComponentsInput() {
      if (!componentsInput) return;
      const active = [...document.querySelectorAll('[data-component]:checked')].map(el => el.dataset.component);
      componentsInput.value = active.join(',');
    }

    function updateComponentVisibility() {
      if (!componentDefs) return;
      const active = new Set([...document.querySelectorAll('[data-component]:checked')].map(el => el.dataset.component));
      document.querySelectorAll('[data-for]').forEach(el => {
        const required = el.dataset.for.split(' ');
        el.style.display = required.some(c => active.has(c)) ? '' : 'none';
      });
      updateComponentsInput();
    }

    function updateBatteryVisibility() {
      const sel = document.querySelector('[name="powerSource"]');
      const isMains = sel && sel.value === 'mains';
      document.querySelectorAll('[data-battery]').forEach(el => { el.style.display = isMains ? 'none' : ''; });
    }

    function makeField(key, value) {
      const wrap = document.createElement('div');
      wrap.className = 'field';
      if (BATTERY_KEYS.includes(key)) wrap.dataset.battery = '1';
      if (keyToComponents[key]) wrap.dataset.for = keyToComponents[key].join(' ');
      const label = document.createElement('label');
      label.appendChild(document.createTextNode(key));
      if (FIELD_HINTS[key]) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hint-btn';
        btn.title = 'Show hint';
        btn.textContent = '\u24d8';
        btn.addEventListener('click', function(e) { e.stopPropagation(); showHint(btn, key); });
        label.appendChild(btn);
      }
      let input;
      if (key === 'powerSource') {
        input = document.createElement('select');
        input.name = key;
        [['', '\u2014 not set \u2014'], ['battery', 'Battery'], ['mains', 'Mains']].forEach(([v, t]) => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = t;
          if (String(value ?? '') === v) opt.selected = true;
          input.appendChild(opt);
        });
        input.addEventListener('change', updateBatteryVisibility);
      } else if (key === 'retain' || key === 'batteryValueBased') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.name = key;
        input.checked = !!value;
      } else {
        input = document.createElement('input');
        input.type = 'text';
        input.name = key;
        input.value = value == null ? '' : String(value);
      }
      wrap.appendChild(label);
      wrap.appendChild(input);
      return wrap;
    }

    // Render component checkboxes panel (composed devices only)
    if (componentDefs) {
      const heading = document.createElement('div');
      heading.className = 'section-label';
      heading.textContent = 'Components';
      fields.appendChild(heading);

      const panelWrap = document.createElement('div');
      panelWrap.className = 'field full';
      const checksDiv = document.createElement('div');
      checksDiv.className = 'comp-checks';

      const activeComponents = new Set((initial['components'] || '').split(',').map(s => s.trim()).filter(Boolean));

      for (const comp of componentDefs) {
        const lbl = document.createElement('label');
        lbl.className = 'comp-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.component = comp.id;
        cb.checked = activeComponents.has(comp.id);
        cb.addEventListener('change', updateComponentVisibility);
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(comp.label));
        checksDiv.appendChild(lbl);
      }

      // Hidden input so the save handler can read the current selection via [name="components"]
      componentsInput = document.createElement('input');
      componentsInput.type = 'hidden';
      componentsInput.name = 'components';
      componentsInput.value = initial['components'] || '';

      panelWrap.appendChild(checksDiv);
      panelWrap.appendChild(componentsInput);
      fields.appendChild(panelWrap);
    }

    for (const [groupName, groupKeys] of Object.entries(groups)) {
      if (!groupKeys.length) continue;
      // 'components' is rendered as checkboxes above — skip the normal field
      const visibleKeys = groupKeys.filter(k => k !== 'components');
      if (!visibleKeys.length) continue;
      const heading = document.createElement('div');
      heading.className = 'section-label';
      heading.textContent = GROUP_LABELS[groupName] ?? groupName;
      fields.appendChild(heading);
      visibleKeys.forEach((key) => fields.appendChild(makeField(key, initial[key])));
    }

    updateBatteryVisibility();
    updateComponentVisibility();

    const allKeys = [...groups.publish, ...groups.subscribe, ...groups.settings];

    saveBtn.addEventListener('click', async () => {
      updateComponentsInput();
      status.textContent = 'Saving...';
      const payload = { deviceId };
      allKeys.forEach((key) => {
        const input = document.querySelector('[name="' + key + '"]');
        if (!input) return;
        payload[key] = (key === 'retain' || key === 'batteryValueBased') ? input.checked : input.value;
      });

      try {
        const params = new URLSearchParams();
        params.set('deviceId', deviceId);
        allKeys.forEach((key) => params.set(key, String(payload[key] ?? '')));

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
